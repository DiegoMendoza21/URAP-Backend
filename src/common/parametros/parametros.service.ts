import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Claves de `parametro_sistema` que lee el código (HU-03-07, datos iniciales). Este archivo es
 * idéntico en todas las ramas que usan parámetros: una clave nueva se agrega aquí, aunque la
 * rama todavía no la use, para no crear conflictos al integrar.
 */
export const PARAMETRO = {
  /** RF-23: días de anticipación con que una sesión se marca «Por vencer». */
  alertaDiasAnticipacion: 'alerta_dias_anticipacion',
  /** HU-01-04: intentos fallidos antes del bloqueo temporal. */
  inicioSesionIntentosMaximos: 'inicio_sesion_intentos_maximos',
  /** HU-01-04: minutos de bloqueo tras superar los intentos. */
  inicioSesionMinutosBloqueo: 'inicio_sesion_minutos_bloqueo',
  /** NFR-019: tamaño máximo de cada archivo cargado, en MB. */
  archivoTamanoMaximoMb: 'archivo_tamano_maximo_mb',
  /** NFR-019: extensiones permitidas para los documentos cargados. */
  archivoTiposPermitidos: 'archivo_tipos_permitidos',
  /** RF-24: extensiones permitidas para las evidencias fotográficas. */
  evidenciaTiposPermitidos: 'evidencia_tipos_permitidos',
} as const;

export type ClaveParametro = (typeof PARAMETRO)[keyof typeof PARAMETRO];

export interface RangoEntero {
  minimo: number;
  maximo: number;
}

/**
 * Lectura de los parámetros de negocio de la tabla `parametro_sistema` (CLAUDE.md, «nada de
 * datos de negocio hardcodeados»). La pantalla para editarlos llega con HU-03-07.
 *
 * Los parámetros de seguridad del despliegue (secreto y vigencia del JWT, límites de
 * peticiones) no van aquí: son variables de entorno.
 *
 * Dos comportamientos ante un parámetro que falta o está mal escrito, según quién lo pide:
 * - `leerEntero` devuelve `null`: la operación sigue sin él (el inicio de sesión no se
 *   bloquea porque falte el número de intentos; el calendario no marca alertas);
 * - `enteroPositivo` y `lista` responden 500: la operación no puede seguir con seguridad (una
 *   carga de archivos sin tamaño máximo ni tipos permitidos se niega).
 * En los dos casos queda en el registro técnico: es un problema de instalación.
 */
@Injectable()
export class ParametrosService {
  private readonly logger = new Logger(ParametrosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valor entero de un parámetro. Si falta, no es un entero o está fuera del rango, devuelve
   * `null` y lo registra como error técnico: es un problema de configuración que debe
   * corregirse, pero no debe tumbar la operación que lo consulta.
   */
  async leerEntero(clave: string, rango: RangoEntero): Promise<number | null> {
    const parametro = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    const texto = parametro?.valor?.trim() ?? '';
    const valor = /^-?\d+$/.test(texto) ? Number(texto) : Number.NaN;
    if (
      !Number.isSafeInteger(valor) ||
      valor < rango.minimo ||
      valor > rango.maximo
    ) {
      this.logger.error(
        parametro
          ? `El parámetro «${clave}» tiene un valor inválido («${parametro.valor}»): se ` +
              `esperaba un entero entre ${rango.minimo} y ${rango.maximo}.`
          : `Falta el parámetro «${clave}» en parametro_sistema (ver npm run db:sembrar).`,
      );
      return null;
    }
    return valor;
  }

  /** Entero mayor que cero. Si falta o no es válido, responde 500. */
  async enteroPositivo(clave: ClaveParametro): Promise<number> {
    const valor = await this.leer(clave);
    const numero = /^\d+$/.test(valor.trim()) ? Number(valor) : Number.NaN;
    if (!Number.isSafeInteger(numero) || numero <= 0) {
      return this.fallar(clave, `no es un entero positivo: «${valor}»`);
    }
    return numero;
  }

  /** Lista separada por comas, con los elementos en minúscula. Si falta, responde 500. */
  async lista(clave: ClaveParametro): Promise<string[]> {
    const valor = await this.leer(clave);
    return valor
      .split(',')
      .map((elemento) => elemento.trim().toLowerCase())
      .filter((elemento) => elemento !== '');
  }

  private async leer(clave: ClaveParametro): Promise<string> {
    const fila = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    if (fila?.valor == null) {
      return this.fallar(clave, 'no existe. Corra npm run db:sembrar');
    }
    return fila.valor;
  }

  private fallar(clave: string, motivo: string): never {
    this.logger.error(`El parámetro «${clave}» ${motivo}.`);
    throw new InternalServerErrorException();
  }
}
