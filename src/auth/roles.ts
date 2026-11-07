/**
 * Nombres de los roles del sistema tal como están en la tabla `rol` (RF-03 y
 * docs/glosario-dominio.md). La autorización compara contra estos nombres: un cambio aquí
 * exige el mismo cambio en los datos iniciales.
 */
export const ROL = {
  administrador: 'Administrador',
  departamento: 'Departamento académico',
  docente: 'Docente responsable',
  liderRap: 'Líder RAP',
  direccion: 'Dirección del programa',
  estudiante: 'Estudiante',
} as const;

export type NombreRol = (typeof ROL)[keyof typeof ROL];

/** Metadato con los roles que `@Roles()` permite en un endpoint. */
export const ROLES_PERMITIDOS = 'urap:roles-permitidos';
