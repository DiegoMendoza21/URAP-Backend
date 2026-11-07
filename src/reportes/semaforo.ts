/**
 * Indicador de color de cada proyecto docente en el tablero de seguimiento (RF-25, p4) y orden
 * por gravedad de la lista de pendientes (HU-12-02). La regla vive solo aquí: si el programa
 * la cambia, se cambia en esta función y el tablero, los pendientes y los reportes la siguen.
 *
 * - Rojo: el curso tiene sesiones vencidas sin registrar (o incumplidas, si el período ya se
 *   cerró). Es lo urgente: cada día suma atraso (RF-23).
 * - Amarillo: no hay vencidas, pero faltan secciones del proyecto por completar o hay sesiones
 *   por vencer dentro del umbral de alerta del programa.
 * - Verde: todas las secciones completas y ninguna sesión vencida ni por vencer.
 */

export type ColorSemaforo = 'rojo' | 'amarillo' | 'verde';

export const COLORES_SEMAFORO: readonly ColorSemaforo[] = [
  'rojo',
  'amarillo',
  'verde',
];

export interface DatosSemaforo {
  /** Secciones del proyecto con algo pendiente (puntos 2 a 7 del formato). */
  seccionesIncompletas: number;
  vencidas: number;
  incumplidas: number;
  porVencer: number;
}

export interface Semaforo {
  color: ColorSemaforo;
  /** Por qué tiene ese color, en lenguaje del usuario. */
  motivo: string;
}

export function semaforoDelProyecto({
  seccionesIncompletas,
  vencidas,
  incumplidas,
  porVencer,
}: DatosSemaforo): Semaforo {
  const atrasadas = vencidas + incumplidas;
  if (atrasadas > 0) {
    return {
      color: 'rojo',
      motivo:
        atrasadas === 1
          ? '1 sesión vencida sin registrar.'
          : `${atrasadas} sesiones vencidas sin registrar.`,
    };
  }
  const motivos: string[] = [];
  if (seccionesIncompletas > 0) {
    motivos.push(
      seccionesIncompletas === 1
        ? '1 sección del proyecto por completar'
        : `${seccionesIncompletas} secciones del proyecto por completar`,
    );
  }
  if (porVencer > 0) {
    motivos.push(
      porVencer === 1
        ? '1 sesión por vencer'
        : `${porVencer} sesiones por vencer`,
    );
  }
  if (motivos.length > 0) {
    return { color: 'amarillo', motivo: `${motivos.join(' y ')}.` };
  }
  return { color: 'verde', motivo: 'Al día.' };
}

export interface DatosGravedad extends DatosSemaforo {
  color: ColorSemaforo;
  /** Días de atraso de la sesión vencida más antigua; nulo si no hay. */
  mayorAtraso: number | null;
  /** Porcentaje de secciones completas. */
  porcentajeSecciones: number;
  /** Para desempatar de forma estable: asignatura y grupo. */
  nombre: string;
}

/**
 * Orden de la lista de pendientes (HU-12-02), del más grave al menos grave: primero el color;
 * luego más sesiones atrasadas, el atraso más antiguo, más secciones incompletas y menos
 * porcentaje completo; por último, el nombre.
 */
export function compararGravedad(a: DatosGravedad, b: DatosGravedad): number {
  return (
    COLORES_SEMAFORO.indexOf(a.color) - COLORES_SEMAFORO.indexOf(b.color) ||
    b.vencidas + b.incumplidas - (a.vencidas + a.incumplidas) ||
    (b.mayorAtraso ?? 0) - (a.mayorAtraso ?? 0) ||
    b.seccionesIncompletas - a.seccionesIncompletas ||
    a.porcentajeSecciones - b.porcentajeSecciones ||
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

/** Un proyecto tiene pendientes si le faltan secciones o tiene sesiones atrasadas (HU-12-02). */
export function tienePendientes(datos: DatosSemaforo): boolean {
  return (
    datos.seccionesIncompletas > 0 || datos.vencidas + datos.incumplidas > 0
  );
}
