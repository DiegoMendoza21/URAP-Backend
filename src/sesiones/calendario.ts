/*
 * RF-19: cálculo del calendario de sesiones. Son funciones puras, sin base de datos, para
 * probar aparte las reglas de fechas: qué días hay clase, en qué semana cae cada una y cómo
 * se guardan las fechas y horas en las columnas `date` y `time` de MySQL.
 *
 * Todas las fechas se manejan en UTC a medianoche, que es como Prisma lee y escribe una
 * columna `date`. Así una fecha no cambia de día por la zona horaria del servidor.
 */

export const MILISEGUNDOS_DIA = 24 * 60 * 60 * 1000;

/** Días en que puede haber clase: 1 = lunes … 6 = sábado (DBML, `horario_curso.dia_semana`). */
export const DIA_SEMANA_MINIMO = 1;
export const DIA_SEMANA_MAXIMO = 6;

export const NOMBRES_DIA_SEMANA: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

/** Hora en formato de 24 horas, `HH:mm`. */
export const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `2026-08-03` → la fecha a medianoche UTC, como la guarda una columna `date`. */
export function aFechaColumna(texto: string): Date {
  return new Date(`${texto}T00:00:00.000Z`);
}

/** Fecha de una columna `date` → `2026-08-03`. */
export function aTextoFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** `07:30` → el valor que Prisma espera para una columna `time`. */
export function aHoraColumna(hora: string): Date {
  return new Date(`1970-01-01T${hora}:00.000Z`);
}

/** Valor de una columna `time` → `07:30`. */
export function aTextoHora(hora: Date): string {
  return hora.toISOString().slice(11, 16);
}

/** Día de la semana de una fecha: 1 = lunes … 7 = domingo. */
export function diaSemanaDe(fecha: Date): number {
  const dia = fecha.getUTCDay();
  return dia === 0 ? 7 : dia;
}

export interface SesionPlanificada {
  /** `YYYY-MM-DD` */
  fecha: string;
  /** Semana del período, empezando en 1 la semana en que inicia. */
  semana: number;
  diaSemana: number;
}

export interface DatosPlanificacion {
  fechaInicio: Date;
  fechaFin: Date;
  /** Semanas de clase del período; sin valor, el calendario llega hasta la fecha final. */
  numeroSemanas: number | null;
  diasClase: readonly number[];
}

/**
 * RF-19, p1 y p2: una sesión por cada día de clase entre el inicio y el fin del período,
 * numerada por semana. La semana 1 es la semana (de lunes a domingo) en que inicia el período,
 * aunque empiece a mitad de semana. Si el período define su número de semanas, no se generan
 * sesiones después de la última.
 */
export function planificarSesiones({
  fechaInicio,
  fechaFin,
  numeroSemanas,
  diasClase,
}: DatosPlanificacion): SesionPlanificada[] {
  const dias = new Set(diasClase);
  const lunesInicial =
    fechaInicio.getTime() - (diaSemanaDe(fechaInicio) - 1) * MILISEGUNDOS_DIA;
  const sesiones: SesionPlanificada[] = [];
  for (
    let instante = fechaInicio.getTime();
    instante <= fechaFin.getTime();
    instante += MILISEGUNDOS_DIA
  ) {
    const fecha = new Date(instante);
    const diaSemana = diaSemanaDe(fecha);
    if (!dias.has(diaSemana)) {
      continue;
    }
    const semana =
      Math.floor((instante - lunesInicial) / (7 * MILISEGUNDOS_DIA)) + 1;
    if (numeroSemanas !== null && semana > numeroSemanas) {
      break;
    }
    sesiones.push({ fecha: aTextoFecha(fecha), semana, diaSemana });
  }
  return sesiones;
}

/** Años que abarca el calendario, para buscar sus festivos (RF-19, p3). */
export function aniosDe(sesiones: readonly SesionPlanificada[]): number[] {
  return [
    ...new Set(sesiones.map((sesion) => Number(sesion.fecha.slice(0, 4)))),
  ].sort((a, b) => a - b);
}
