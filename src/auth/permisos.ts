import type {
  CodigoModulo,
  CodigoPermiso,
} from '../datos-iniciales/catalogos.js';

/** Metadato con el permiso que `@Permiso()` exige en un endpoint. */
export const PERMISO_REQUERIDO = 'urap:permiso-requerido';

/**
 * Un permiso de la matriz (HU-02-06) como lo lleva la sesión y lo recibe el frontend:
 * `modulo.permiso`, por ejemplo `proyectos.crear`.
 */
export function clavePermiso(modulo: string, permiso: string): string {
  return `${modulo}.${permiso}`;
}

export interface PermisoRequerido {
  modulo: CodigoModulo;
  permiso: CodigoPermiso;
}
