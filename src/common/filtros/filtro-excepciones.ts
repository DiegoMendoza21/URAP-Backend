import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import type { RespuestaErrorDto } from '../dto/respuesta-error.dto.js';

interface TextosEstado {
  error: string;
  mensaje: string;
}

const TEXTOS_POR_ESTADO: Partial<Record<number, TextosEstado>> = {
  [HttpStatus.BAD_REQUEST]: {
    error: 'Solicitud inválida',
    mensaje: 'La solicitud no es válida.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    error: 'No autenticado',
    mensaje: 'Debe iniciar sesión para continuar.',
  },
  [HttpStatus.FORBIDDEN]: {
    error: 'Acceso denegado',
    mensaje: 'No tiene permiso para realizar esta acción.',
  },
  [HttpStatus.NOT_FOUND]: {
    error: 'No encontrado',
    mensaje: 'El recurso solicitado no existe.',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    error: 'Método no permitido',
    mensaje: 'La operación solicitada no está permitida sobre este recurso.',
  },
  [HttpStatus.CONFLICT]: {
    error: 'Conflicto',
    mensaje: 'La operación entra en conflicto con información existente.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    error: 'Contenido demasiado grande',
    mensaje: 'El contenido enviado supera el tamaño permitido.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    error: 'Datos no procesables',
    mensaje: 'Los datos enviados no se pueden procesar.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    error: 'Demasiadas solicitudes',
    mensaje: 'Ha hecho demasiadas solicitudes. Intente de nuevo más tarde.',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    error: 'Error interno',
    mensaje: 'Ocurrió un error inesperado. Intente de nuevo más tarde.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    error: 'Servicio no disponible',
    mensaje:
      'El servicio no está disponible en este momento. Intente de nuevo más tarde.',
  },
};

/** Errores de Prisma que tienen una lectura de negocio. Cualquier otro es un 500. */
const ERRORES_PRISMA: Record<string, { estado: number; mensaje: string }> = {
  P2002: {
    estado: HttpStatus.CONFLICT,
    mensaje: 'Ya existe un registro con esos datos.',
  },
  P2003: {
    estado: HttpStatus.CONFLICT,
    mensaje:
      'La operación no se puede completar porque depende de información relacionada.',
  },
  P2025: {
    estado: HttpStatus.NOT_FOUND,
    mensaje: 'El registro solicitado no existe.',
  },
};

/**
 * Mensajes que el propio framework genera en inglés. Nuestro código lanza sus excepciones
 * con mensajes en español; estos se reemplazan por el texto genérico del estado.
 */
const PATRONES_MENSAJE_FRAMEWORK = [
  /^Cannot [A-Z]+ \//, // ruta inexistente (router)
  /^Forbidden resource$/, // guard que devuelve false
  /^Validation failed/, // pipes incorporados (ParseIntPipe, ParseUUIDPipe...)
  /JSON/, // cuerpo JSON mal formado: el adaptador reenvía el mensaje del parser
  /^URI malformed$|^Failed to decode param/, // parámetro de ruta mal codificado
];

/** Forma de los errores de `http-errors` (body-parser, Express). */
interface ErrorHttpErrors {
  expose?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

/**
 * Filtro global de excepciones (NFR-011, NFR-016). Toda respuesta de error sale con la
 * forma de RespuestaErrorDto y en español. Nunca expone stack traces, SQL ni nombres de
 * tablas o restricciones: eso va solo al registro técnico del servidor.
 */
@Catch()
export class FiltroExcepciones implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcepciones.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const peticion = http.getRequest<Request>();
    const respuesta = http.getResponse<Response>();

    const ruta = peticion.originalUrl ?? peticion.url;
    const { estado, mensaje, detalles } = this.interpretar(excepcion);
    this.registrar(excepcion, estado, `${peticion.method} ${ruta}`);

    const cuerpo: RespuestaErrorDto = {
      estado,
      error: textosDe(estado).error,
      mensaje,
      ...(detalles && detalles.length > 0 ? { detalles } : {}),
      ruta,
      fecha: new Date().toISOString(),
    };
    respuesta.status(estado).json(cuerpo);
  }

  /**
   * Registro técnico (NFR-016). Lo inesperado queda con su stack. Un 5xx lanzado a
   * propósito deja una sola línea: quien lo lanza ya registró la causa.
   */
  private registrar(
    excepcion: unknown,
    estado: number,
    solicitud: string,
  ): void {
    if (estado < 500) {
      return;
    }
    if (excepcion instanceof HttpException) {
      this.logger.warn(
        `${solicitud} respondió ${estado}: ${excepcion.message}`,
      );
      return;
    }
    this.logger.error(
      `${solicitud} respondió ${estado}`,
      excepcion instanceof Error ? excepcion.stack : String(excepcion),
    );
  }

  private interpretar(excepcion: unknown): {
    estado: number;
    mensaje: string;
    detalles?: string[];
  } {
    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      const { mensaje, detalles } = extraerMensaje(excepcion.getResponse());
      // El adaptador de Express envuelve los errores de http-errors (cuerpo demasiado
      // grande, codificación no soportada...) conservando su mensaje técnico en inglés.
      const propio =
        mensaje !== undefined &&
        !esErrorHttpErrors(excepcion.cause) &&
        !esMensajeDelFramework(mensaje, estado);
      return {
        estado,
        mensaje: propio ? mensaje : textosDe(estado).mensaje,
        detalles,
      };
    }

    if (excepcion instanceof PrismaClientKnownRequestError) {
      const conocido = ERRORES_PRISMA[excepcion.code];
      if (conocido) {
        return conocido;
      }
    }

    // Errores de middleware que llegan sin convertir (los 5xx de http-errors): traen su
    // estado HTTP, pero su mensaje es técnico y en inglés.
    const estadoMiddleware = estadoDeErrorHttp(excepcion);
    if (estadoMiddleware !== undefined) {
      return {
        estado: estadoMiddleware,
        mensaje: textosDe(estadoMiddleware).mensaje,
      };
    }

    return {
      estado: HttpStatus.INTERNAL_SERVER_ERROR,
      mensaje: textosDe(HttpStatus.INTERNAL_SERVER_ERROR).mensaje,
    };
  }
}

function textosDe(estado: number): TextosEstado {
  const generico =
    estado >= 500 ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST;
  return (
    TEXTOS_POR_ESTADO[estado] ?? (TEXTOS_POR_ESTADO[generico] as TextosEstado)
  );
}

function extraerMensaje(cuerpo: string | object): {
  mensaje?: string;
  detalles?: string[];
} {
  if (typeof cuerpo === 'string') {
    return { mensaje: cuerpo };
  }
  const { mensaje, message, detalles } = cuerpo as Record<string, unknown>;
  const texto = [mensaje, message].find(
    (valor): valor is string => typeof valor === 'string',
  );
  const lista = Array.isArray(detalles)
    ? detalles.filter((valor): valor is string => typeof valor === 'string')
    : undefined;
  return { mensaje: texto, detalles: lista };
}

function esMensajeDelFramework(mensaje: string, estado: number): boolean {
  return (
    mensaje === STATUS_CODES[estado] ||
    PATRONES_MENSAJE_FRAMEWORK.some((patron) => patron.test(mensaje))
  );
}

function esErrorHttpErrors(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const { expose, statusCode } = valor as ErrorHttpErrors;
  return typeof expose === 'boolean' && typeof statusCode === 'number';
}

function estadoDeErrorHttp(excepcion: unknown): number | undefined {
  if (typeof excepcion !== 'object' || excepcion === null) {
    return undefined;
  }
  const { status, statusCode } = excepcion as ErrorHttpErrors;
  const estado = typeof status === 'number' ? status : statusCode;
  return typeof estado === 'number' && estado >= 400 && estado < 600
    ? estado
    : undefined;
}
