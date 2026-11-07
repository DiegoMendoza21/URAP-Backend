import type { Prisma } from '../generated/prisma/client.js';
import { type Auditable, soloCambios } from './edicion-proyecto.service.js';

/**
 * Auditoría de un guardado de sección que reemplaza una lista completa (estrategias,
 * bibliografía, evaluación de un RAC): solo los campos que cambian y nada si se guardó lo
 * mismo. Con `null`, `EdicionProyectoService.editar` tampoco mueve la fecha de modificación.
 */
export function auditarCambios(
  tabla: string,
  idRegistro: number,
  anterior: Record<string, Prisma.InputJsonValue | null>,
  nuevo: Record<string, Prisma.InputJsonValue | null>,
): Auditable | null {
  const cambios = soloCambios(anterior, nuevo);
  return cambios
    ? { accion: 'actualizar', tabla, idRegistro, ...cambios }
    : null;
}
