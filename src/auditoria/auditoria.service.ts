import { Injectable, Logger } from '@nestjs/common';
import { contextoActual } from '../common/contexto/contexto-peticion.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Acciones de auditoría, con el vocabulario del modelo de datos (DBML, tabla `auditoria`). */
export type AccionAuditoria =
  'crear' | 'actualizar' | 'eliminar' | 'aprobar' | 'consulta_sensible';

export interface EventoAuditoria {
  accion: AccionAuditoria;
  tablaAfectada: string;
  idRegistro: number | null;
  valorAnterior?: Prisma.InputJsonValue;
  valorNuevo?: Prisma.InputJsonValue;
  /**
   * Usuario responsable. Si se omite, se toma el de la sesión de la petición en curso; con
   * `null` se registra como acción del sistema (por ejemplo, un bloqueo automático).
   */
  idUsuario?: number | null;
  /** IP de origen. Si se omite, se toma la de la petición en curso. */
  ip?: string;
}

/** RF-29, q1: la auditoría no puede sumar más de un segundo a la operación. */
export const TIEMPO_MAXIMO_AUDITORIA_MS = 1000;

/** Campos que nunca se guardan en los valores anterior y nuevo, aunque un servicio los pase. */
const CAMPO_SENSIBLE = /password|contrasena|token|secreto|^jti$/i;
export const VALOR_OMITIDO = '[omitido]';

/**
 * Registro de auditoría de las acciones relevantes (HU-14-01, RF-29, NFR-008).
 *
 * Cómo se usa: el servicio que crea, modifica, elimina o aprueba llama a `registrar()`
 * después de confirmar la operación (fuera de su transacción, para que un fallo de la
 * auditoría no la deshaga), con la tabla, el id y los valores anterior y nuevo. Las consultas
 * sensibles se auditan con el decorador `@AuditarConsulta()` en el controlador. El usuario y
 * la IP se toman del contexto de la petición.
 *
 * Los registros no se modifican ni se eliminan (RF-29, p4): este servicio solo los crea.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda el evento. Nunca lanza y espera como máximo TIEMPO_MAXIMO_AUDITORIA_MS: si la
   * auditoría falla o tarda, queda constancia en el registro técnico y la operación del
   * usuario sigue (RF-29, excepción p3 y q1).
   */
  async registrar(evento: EventoAuditoria): Promise<void> {
    const contexto = contextoActual();
    const descripcion = `«${evento.accion}» sobre ${evento.tablaAfectada} ${evento.idRegistro ?? ''}`;

    let escritura: Promise<'ok' | 'error'>;
    try {
      escritura = this.prisma.auditoria
        .create({
          data: {
            id_usuario:
              evento.idUsuario === undefined
                ? (contexto?.idUsuario ?? null)
                : evento.idUsuario,
            accion: evento.accion,
            tabla_afectada: evento.tablaAfectada,
            id_registro: evento.idRegistro,
            valor_anterior: limpiar(evento.valorAnterior),
            valor_nuevo: limpiar(evento.valorNuevo),
            fecha: new Date(),
            ip: (evento.ip ?? contexto?.ip)?.slice(0, 255) ?? null,
          },
        })
        .then(
          () => 'ok' as const,
          (error: unknown) => {
            this.registrarFallo(descripcion, error);
            return 'error' as const;
          },
        );
    } catch (error) {
      this.registrarFallo(descripcion, error);
      return;
    }

    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<'tiempo'>((resolver) => {
      temporizador = setTimeout(
        () => resolver('tiempo'),
        TIEMPO_MAXIMO_AUDITORIA_MS,
      );
    });
    const resultado = await Promise.race([escritura, limite]);
    clearTimeout(temporizador);
    if (resultado === 'tiempo') {
      // La escritura sigue en curso; si termina fallando, su propio manejador lo registra.
      this.logger.warn(
        `La auditoría de ${descripcion} tardó más de ${TIEMPO_MAXIMO_AUDITORIA_MS} ms: ` +
          'la operación del usuario continúa sin esperarla.',
      );
    }
  }

  private registrarFallo(descripcion: string, error: unknown): void {
    this.logger.error(
      `No se pudo registrar en auditoría la acción ${descripcion}.`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}

/** Copia del valor sin campos sensibles (contraseñas, tokens), a cualquier profundidad. */
function limpiar(
  valor: Prisma.InputJsonValue | undefined,
): Prisma.InputJsonValue | undefined {
  if (Array.isArray(valor)) {
    return valor.map((elemento) =>
      limpiar(elemento as Prisma.InputJsonValue),
    ) as Prisma.InputJsonValue;
  }
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, interno]) => [
        clave,
        CAMPO_SENSIBLE.test(clave)
          ? VALOR_OMITIDO
          : limpiar(interno as Prisma.InputJsonValue),
      ]),
    );
  }
  return valor;
}
