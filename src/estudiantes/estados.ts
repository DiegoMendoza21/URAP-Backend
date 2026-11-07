/** Valores de `matricula.estado` (DBML v2.4: «matriculado | retirado»). */
export const ESTADO_MATRICULA = {
  matriculado: 'matriculado',
  retirado: 'retirado',
} as const;

export type EstadoMatricula =
  (typeof ESTADO_MATRICULA)[keyof typeof ESTADO_MATRICULA];
