import type { PrismaService } from '../../src/common/prisma/prisma.service.js';

/** Código del plan de estudios que las pruebas crean en cada programa ficticio. */
export const CODIGO_PLAN_DE_PRUEBA = 'E2E';

/**
 * Modelo v2.5: la asignatura cuelga de un plan de estudios, no del programa. Devuelve el plan
 * de prueba del programa ficticio y lo crea la primera vez que se pide.
 */
export async function planDePrueba(
  prisma: PrismaService,
  idPrograma: number,
): Promise<number> {
  const plan = await prisma.plan_estudio.upsert({
    where: {
      id_programa_codigo: {
        id_programa: idPrograma,
        codigo: CODIGO_PLAN_DE_PRUEBA,
      },
    },
    create: {
      id_programa: idPrograma,
      codigo: CODIGO_PLAN_DE_PRUEBA,
      nombre: 'Plan de estudios de prueba',
    },
    update: {},
  });
  return plan.id;
}

/**
 * Borra los planes de estudio de unos programas ficticios. Va después de borrar sus
 * asignaturas y antes de borrar los programas, por las claves foráneas.
 */
export async function borrarPlanesDePrueba(
  prisma: PrismaService,
  idsProgramas: number[],
): Promise<void> {
  await prisma.plan_estudio.deleteMany({
    where: { id_programa: { in: idsProgramas } },
  });
}
