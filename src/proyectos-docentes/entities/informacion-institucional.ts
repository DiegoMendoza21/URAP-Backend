/**
 * RF-08, excepción p7: si la asignatura no tiene registradas las horas o los créditos, el
 * proyecto se crea igual pero queda marcado con información incompleta.
 *
 * La marca no se guarda en el proyecto: se calcula a partir de la asignatura cada vez que se
 * consulta. Así desaparece sola cuando el programa registre los datos que faltan, sin tener
 * que recorrer los proyectos ya creados. Un valor 0 es un dato registrado (por ejemplo, un
 * curso sin horas prácticas); solo falta lo que está en nulo.
 */
export interface DatosAcademicosAsignatura {
  creditos: number | null;
  horas_tde: number | null;
  horas_tdp: number | null;
  horas_ti: number | null;
}

const CAMPOS_OBLIGATORIOS: [keyof DatosAcademicosAsignatura, string][] = [
  ['creditos', 'créditos'],
  ['horas_tde', 'horas TDE'],
  ['horas_tdp', 'horas TDP'],
  ['horas_ti', 'horas TI'],
];

/** Nombres, aptos para mostrar, de los datos académicos que la asignatura no tiene. */
export function camposFaltantes(
  asignatura: DatosAcademicosAsignatura,
): string[] {
  return CAMPOS_OBLIGATORIOS.filter(
    ([campo]) => asignatura[campo] === null || asignatura[campo] === undefined,
  ).map(([, nombre]) => nombre);
}
