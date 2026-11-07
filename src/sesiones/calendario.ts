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
  /**
   * Fechas `YYYY-MM-DD` sin clase de `dia_festivo`: festivos de ley e institucionales. Solo
   * sirven aquí para reconocer las semanas de receso; el marcado de festivos lo hace el servicio.
   */
  diasSinClase?: ReadonlySet<string>;
}

/** Lunes de la semana de una fecha, a medianoche UTC. */
export function lunesDe(fecha: Date): Date {
  return new Date(
    fecha.getTime() - (diaSemanaDe(fecha) - 1) * MILISEGUNDOS_DIA,
  );
}

/** Sábado de la semana de una fecha: el último día en que puede haber clase. */
export function sabadoDe(fecha: Date): Date {
  return new Date(
    lunesDe(fecha).getTime() + (DIA_SEMANA_MAXIMO - 1) * MILISEGUNDOS_DIA,
  );
}

/**
 * Semana de receso: los seis días en que puede haber clase, de lunes a sábado, están en la tabla
 * de festivos, sea por ley o por decisión institucional. Así se carga el receso de noviembre
 * del Acuerdo 46 de 2026 (del 9 al 14, con origen `institucional`), y también serviría una
 * semana de receso que combine festivos de ley con días institucionales.
 */
function esSemanaDeReceso(
  lunes: Date,
  diasSinClase: ReadonlySet<string>,
): boolean {
  if (diasSinClase.size === 0) {
    return false;
  }
  for (let dia = 0; dia < DIA_SEMANA_MAXIMO; dia++) {
    const fecha = new Date(lunes.getTime() + dia * MILISEGUNDOS_DIA);
    if (!diasSinClase.has(aTextoFecha(fecha))) {
      return false;
    }
  }
  return true;
}

export interface SemanaDeReceso {
  /** Lunes, `YYYY-MM-DD` */
  desde: string;
  /** Sábado, `YYYY-MM-DD` */
  hasta: string;
}

/**
 * Semanas de clase entre las fechas del período: las semanas calendario que toca, menos las de
 * receso. Sirve para avisar cuando `numero_semanas` deja semanas por fuera.
 */
export function semanasDeClase(
  fechaInicio: Date,
  fechaFin: Date,
  diasSinClase: ReadonlySet<string>,
): number {
  let semanas = 0;
  for (
    let lunes = lunesDe(fechaInicio);
    lunes.getTime() <= fechaFin.getTime();
    lunes = new Date(lunes.getTime() + 7 * MILISEGUNDOS_DIA)
  ) {
    if (!esSemanaDeReceso(lunes, diasSinClase)) {
      semanas++;
    }
  }
  return semanas;
}

/** Semanas de receso que tocan el período, para mostrarlas en el calendario. */
export function semanasDeReceso(
  fechaInicio: Date,
  fechaFin: Date,
  diasSinClase: ReadonlySet<string>,
): SemanaDeReceso[] {
  const recesos: SemanaDeReceso[] = [];
  for (
    let lunes = lunesDe(fechaInicio);
    lunes.getTime() <= fechaFin.getTime();
    lunes = new Date(lunes.getTime() + 7 * MILISEGUNDOS_DIA)
  ) {
    if (esSemanaDeReceso(lunes, diasSinClase)) {
      recesos.push({
        desde: aTextoFecha(lunes),
        hasta: aTextoFecha(sabadoDe(lunes)),
      });
    }
  }
  return recesos;
}

/**
 * RF-19, p1 y p2: una sesión por cada encuentro previsto entre el inicio y el fin del período,
 * numerada por semana. La semana 1 es la semana (de lunes a domingo) en que inicia el período,
 * aunque empiece a mitad de semana. Si el período define su número de semanas, no se generan
 * sesiones después de la última.
 *
 * Calendario académico (Acuerdo 46 de 2026): una semana de receso no es semana de clase, así
 * que no tiene sesiones ni cuenta en la numeración; la semana siguiente toma su número. Un
 * festivo suelto, en cambio, es un encuentro previsto que cae en festivo: su sesión se genera
 * (el servicio la marca «Festivo» para que el docente la reprograme) y la numeración sigue.
 */
export function planificarSesiones({
  fechaInicio,
  fechaFin,
  numeroSemanas,
  diasClase,
  diasSinClase = new Set(),
}: DatosPlanificacion): SesionPlanificada[] {
  const dias = new Set(diasClase);
  const sesiones: SesionPlanificada[] = [];
  let semana = 0;
  for (
    let lunes = lunesDe(fechaInicio);
    lunes.getTime() <= fechaFin.getTime();
    lunes = new Date(lunes.getTime() + 7 * MILISEGUNDOS_DIA)
  ) {
    if (esSemanaDeReceso(lunes, diasSinClase)) {
      continue;
    }
    semana++;
    if (numeroSemanas !== null && semana > numeroSemanas) {
      break;
    }
    for (let dia = 0; dia < 7; dia++) {
      const instante = lunes.getTime() + dia * MILISEGUNDOS_DIA;
      if (instante < fechaInicio.getTime() || instante > fechaFin.getTime()) {
        continue;
      }
      const fecha = new Date(instante);
      const diaSemana = diaSemanaDe(fecha);
      if (dias.has(diaSemana)) {
        sesiones.push({ fecha: aTextoFecha(fecha), semana, diaSemana });
      }
    }
  }
  return sesiones;
}

/** Años que abarca el calendario, para buscar sus festivos (RF-19, p3). */
export function aniosDe(sesiones: readonly SesionPlanificada[]): number[] {
  return [
    ...new Set(sesiones.map((sesion) => Number(sesion.fecha.slice(0, 4)))),
  ].sort((a, b) => a - b);
}
