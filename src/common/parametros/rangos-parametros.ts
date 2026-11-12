import {
  type ClaveParametro,
  PARAMETRO,
  type RangoEntero,
} from './parametros.service.js';

/**
 * Valores admitidos de cada parámetro entero. Es el único lugar donde están: lo usan quien lee
 * el parámetro (`ParametrosService.leerEntero`) y la pantalla que lo edita (HU-03-07), así un
 * valor que la pantalla acepta nunca es uno que el lector descarta.
 *
 * Son controles de cordura, no reglas del programa: el valor lo fija el administrador.
 */
export const RANGO_PARAMETRO = {
  /** RF-23: con 0, una sesión se marca «Por vencer» solo el mismo día. */
  [PARAMETRO.alertaDiasAnticipacion]: { minimo: 0, maximo: 365 },
  [PARAMETRO.inicioSesionIntentosMaximos]: { minimo: 1, maximo: 100 },
  /** Hasta un día. */
  [PARAMETRO.inicioSesionMinutosBloqueo]: { minimo: 1, maximo: 1440 },
  /**
   * NFR-019. El tope protege al servidor: los archivos se reciben en memoria antes de
   * verificarlos, y una carga trae varios.
   */
  [PARAMETRO.archivoTamanoMaximoMb]: { minimo: 1, maximo: 50 },
  /**
   * RF-11, p3. El máximo es el tope técnico del cuerpo de la descripción (protege la columna
   * `text`): el servidor no puede prometer más de lo que acepta.
   */
  [PARAMETRO.descripcionCursoLongitudMaxima]: { minimo: 1, maximo: 16_000 },
  /** RF-25, p5. */
  [PARAMETRO.reporteExportacionFilasMaxima]: { minimo: 1, maximo: 1_000_000 },
  /** RF-26, HU-13-02: de un recordatorio diario a uno por trimestre. */
  [PARAMETRO.recordatorioSesionesDias]: { minimo: 1, maximo: 90 },
} as const satisfies Partial<Record<ClaveParametro, RangoEntero>>;

/** Claves de los parámetros enteros. */
export type ClaveParametroEntero = keyof typeof RANGO_PARAMETRO;
