/**
 * RF-15, p4: el total de horas del contenido programático frente a las horas de la asignatura.
 *
 * Las horas de la asignatura son las del semestre completo (glosario, «Horas y créditos»: 2
 * créditos = 32 TDE + 64 TI en 16 semanas). Las del contenido se registran por semana y aquí
 * se suman. Un dato de la asignatura en nulo no se compara ni se inventa: la asignatura tiene
 * información incompleta (RF-08, p7) y lo que se ve es la suma del docente sin referencia.
 */

export type TipoHoras = 'TDE' | 'TDP' | 'TI' | 'Total';

export interface HorasSemana {
  horasTde: number | null;
  horasTdp: number | null;
  horasTi: number | null;
}

export interface HorasAsignatura {
  horas_tde: number | null;
  horas_tdp: number | null;
  horas_ti: number | null;
  horas_totales: number | null;
}

export interface FilaComparacion {
  tipo: TipoHoras;
  contenidos: number;
  asignatura: number | null;
  diferencia: number | null;
}

export interface ComparacionHoras {
  comparacion: FilaComparacion[];
  /** Nulo si no hay ninguna hora de la asignatura con qué comparar. */
  horasCoinciden: boolean | null;
}

export function compararHoras(
  semanas: readonly HorasSemana[],
  asignatura: HorasAsignatura | null,
): ComparacionHoras {
  const sumar = (campo: keyof HorasSemana) =>
    semanas.reduce((suma, semana) => suma + (semana[campo] ?? 0), 0);
  const tde = sumar('horasTde');
  const tdp = sumar('horasTdp');
  const ti = sumar('horasTi');

  const deAsignatura = {
    tde: asignatura?.horas_tde ?? null,
    tdp: asignatura?.horas_tdp ?? null,
    ti: asignatura?.horas_ti ?? null,
  };
  const partes = [deAsignatura.tde, deAsignatura.tdp, deAsignatura.ti];
  const totalAsignatura =
    asignatura?.horas_totales ??
    (partes.every((parte) => parte !== null)
      ? partes.reduce<number>((suma, parte) => suma + (parte ?? 0), 0)
      : null);

  const filas: [TipoHoras, number, number | null][] = [
    ['TDE', tde, deAsignatura.tde],
    ['TDP', tdp, deAsignatura.tdp],
    ['TI', ti, deAsignatura.ti],
    ['Total', tde + tdp + ti, totalAsignatura],
  ];
  const comparacion = filas.map(([tipo, contenidos, deLaAsignatura]) => ({
    tipo,
    contenidos,
    asignatura: deLaAsignatura,
    diferencia: deLaAsignatura === null ? null : contenidos - deLaAsignatura,
  }));
  const comparables = comparacion.filter((fila) => fila.diferencia !== null);
  return {
    comparacion,
    horasCoinciden:
      comparables.length === 0
        ? null
        : comparables.every((fila) => fila.diferencia === 0),
  };
}
