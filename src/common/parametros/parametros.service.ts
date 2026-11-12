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
  /** RF-18: si quien es docente de un proyecto queda impedido de aprobarlo o devolverlo. */
  revisionBloquearAutoaprobacion: 'revision_bloquear_autoaprobacion',
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
  /** RF-11, p3: longitud máxima de la descripción del curso, en caracteres. */
  descripcionCursoLongitudMaxima: 'descripcion_curso_longitud_maxima',
  /** RF-25, p5: filas máximas de una exportación del tablero o de los reportes. */
  reporteExportacionFilasMaxima: 'reporte_exportacion_filas_maxima',
  /** RF-13, p2: estrategias de enseñanza del catálogo del MEN que sugiere el punto 4. */
  catalogoEstrategiasEnsenanza: 'catalogo_estrategias_ensenanza',
  /** RF-13, p2: estrategias de aprendizaje del catálogo del MEN que sugiere el punto 4. */
  catalogoEstrategiasAprendizaje: 'catalogo_estrategias_aprendizaje',
  /** RF-26, HU-13-02: cada cuántos días se le recuerdan al docente sus sesiones pendientes. */
  recordatorioSesionesDias: 'recordatorio_sesiones_dias',
} as const;

export type ClaveParametro = (typeof PARAMETRO)[keyof typeof PARAMETRO];

export interface RangoEntero {
  minimo: number;
  maximo: number;
}

/**
 * Lectura de los parámetros de negocio de la tabla `parametro_sistema` (CLAUDE.md, «nada de
 * datos de negocio hardcodeados»). Lee de la base en cada uso y no guarda copias: por eso un
 * cambio hecho en la pantalla de parámetros (HU-03-07, `estructura-academica/`) rige desde la
 * siguiente petición, sin redesplegar. No agregue una caché aquí sin invalidarla al editar.
 *
 * Los parámetros de seguridad del despliegue (secreto y vigencia del JWT, límites de
 * peticiones) no van aquí: son variables de entorno.
 *
 * Dos comportamientos ante un parámetro que falta o está mal escrito, según quién lo pide:
 * - `leerEntero` devuelve `null` y `leerTextos` una lista vacía: la operación sigue sin él (el
 *   inicio de sesión no se bloquea porque falte el número de intentos; el calendario no marca
 *   alertas; el punto 4 del proyecto docente no sugiere el catálogo del MEN);
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
  async leerEntero(
    clave: ClaveParametro,
    rango: RangoEntero,
  ): Promise<number | null> {
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

  /**
   * Valor sí/no de un parámetro: `si` o `no`, sin importar mayúsculas ni tildes. Si falta o
   * tiene otro valor, devuelve `porDefecto` y lo registra como error técnico. Quien lo pide
   * elige ese valor: el que deja la operación del lado seguro (una regla de control interno se
   * aplica ante la duda).
   */
  async leerSiNo(clave: ClaveParametro, porDefecto: boolean): Promise<boolean> {
    const parametro = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    const texto = (parametro?.valor ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      // Tras NFD, cada tilde es una marca combinante aparte: se quitan las marcas.
      .replace(/\p{M}/gu, '');
    if (texto === 'si' || texto === 'no') {
      return texto === 'si';
    }
    const usado = `Se aplica «${porDefecto ? 'si' : 'no'}».`;
    this.logger.error(
      parametro?.valor == null
        ? `Falta el parámetro «${clave}» en parametro_sistema (ver npm run db:sembrar). ${usado}`
        : `El parámetro «${clave}» tiene un valor inválido («${parametro.valor}»): se ` +
            `esperaba «si» o «no». ${usado}`,
    );
    return porDefecto;
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

  /**
   * Lista separada por comas, con los elementos en minúscula: es para extensiones de archivo.
   * Si falta, responde 500.
   */
  async lista(clave: ClaveParametro): Promise<string[]> {
    const valor = await this.leer(clave);
    return valor
      .split(',')
      .map((elemento) => elemento.trim().toLowerCase())
      .filter((elemento) => elemento !== '');
  }

  /**
   * Lista de textos separados por comas, tal como están escritos: conserva las mayúsculas y las
   * tildes, porque se muestran al usuario. Si falta, devuelve una lista vacía y lo registra como
   * error técnico: la operación sigue sin él.
   */
  async leerTextos(clave: ClaveParametro): Promise<string[]> {
    const parametro = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    if (parametro?.valor == null) {
      this.logger.error(
        `Falta el parámetro «${clave}» en parametro_sistema (ver npm run db:sembrar).`,
      );
      return [];
    }
    return separarTextos(parametro.valor);
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

/** Los elementos de un valor separado por comas, sin espacios de más y sin vacíos. */
export function separarTextos(valor: string): string[] {
  return valor
    .split(',')
    .map((elemento) => elemento.trim().replace(/\s+/g, ' '))
    .filter((elemento) => elemento !== '');
}
