import type { CodigoModulo, CodigoPermiso, NombreRol } from './catalogos.js';

/**
 * Matriz inicial de permisos por rol: Producto 1, Tabla 17 «Matriz general de permisos por
 * rol», copiada en docs/datos-institucionales.md (apartado 1). El seed la carga en
 * `rol_permiso` solo para los roles que todavía no tienen permisos; después la ajusta el
 * administrador (HU-02-06).
 *
 * Cada celda usa las letras de la tabla, separadas por «/»:
 * - `C` consultar → leer.
 * - `R` registrar → crear; `E` editar → actualizar. Las dos incluyen leer: no se registra ni se
 *   edita lo que no se puede ver.
 * - `A` aprobar → aprobar; `G` generar → generar.
 * - `ADM` administrar → todos los permisos menos aprobar. Aprobar es un acto académico (el
 *   Departamento aprueba los proyectos, RF-17), no de administración del sistema. Decisión del
 *   2026-11-06.
 * - `—` sin acceso.
 *
 * Los alcances de la tabla («propios», «publicados», «RAP asignados», «restringida») no caben
 * en `rol_permiso`: son filtros que aplica cada servicio. Aquí se guarda solo el permiso.
 */
export type CeldaMatriz = string;

export const MATRIZ_PERMISOS_INICIAL: Record<
  NombreRol,
  Record<CodigoModulo, CeldaMatriz>
> = {
  Administrador: {
    usuarios: 'ADM',
    estructura: 'ADM',
    proyectos: 'ADM/C',
    plan_curso: 'ADM/C',
    rap: 'ADM',
    clases: 'ADM/C',
    documentos: 'ADM/C',
    reportes: 'ADM',
    auditoria: 'ADM/C',
  },
  'Docente responsable': {
    usuarios: '—',
    estructura: 'C',
    proyectos: 'R/E', // propios
    plan_curso: 'R/E', // propios
    rap: 'R/E', // RAC propios
    clases: 'R/E', // propios
    documentos: 'R/E', // propios
    reportes: 'C', // propios
    auditoria: '—',
  },
  'Líder RAP': {
    usuarios: '—',
    estructura: 'C',
    proyectos: 'C',
    plan_curso: 'C',
    rap: 'C', // RAP asignados
    clases: 'C',
    documentos: 'C', // autorizados
    reportes: 'C', // RAP asignados
    auditoria: '—',
  },
  // R en proyectos: decisión del 2026-11-06, se sigue RF-08 (el Departamento crea el proyecto).
  'Departamento académico': {
    usuarios: 'C',
    estructura: 'C',
    proyectos: 'R/A/C',
    plan_curso: 'A/C',
    rap: 'A/C',
    clases: 'C',
    documentos: 'C',
    reportes: 'G/C',
    auditoria: 'C', // restringida
  },
  'Dirección del programa': {
    usuarios: 'C',
    estructura: 'C',
    proyectos: 'C',
    plan_curso: 'C',
    rap: 'C',
    clases: 'C',
    documentos: 'C',
    reportes: 'C',
    auditoria: 'C', // restringida
  },
  Estudiante: {
    usuarios: '—',
    estructura: 'C',
    proyectos: 'C', // publicados
    plan_curso: 'C', // publicado
    rap: 'C', // autorizado
    clases: '—',
    documentos: 'C', // autorizados
    reportes: '—',
    auditoria: '—',
  },
};

const PERMISOS_POR_LETRA: Record<string, CodigoPermiso[]> = {
  C: ['leer'],
  R: ['crear', 'leer'],
  E: ['actualizar', 'leer'],
  A: ['aprobar'],
  G: ['generar'],
  ADM: ['leer', 'crear', 'actualizar', 'eliminar', 'generar', 'administrar'],
  '—': [],
};

/** Permisos de una celda de la Tabla 17, sin repetir. Lanza si la celda no es válida. */
export function permisosDeCelda(celda: CeldaMatriz): CodigoPermiso[] {
  const permisos = new Set<CodigoPermiso>();
  for (const letra of celda.split('/').map((parte) => parte.trim())) {
    const traducidos = PERMISOS_POR_LETRA[letra];
    if (!traducidos) {
      throw new Error(
        `Celda de la matriz de permisos no reconocida: «${celda}».`,
      );
    }
    traducidos.forEach((permiso) => permisos.add(permiso));
  }
  return [...permisos];
}

/** Pares módulo–permiso iniciales de un rol. */
export function permisosInicialesDe(
  rol: NombreRol,
): { modulo: CodigoModulo; permiso: CodigoPermiso }[] {
  return Object.entries(MATRIZ_PERMISOS_INICIAL[rol]).flatMap(
    ([modulo, celda]) =>
      permisosDeCelda(celda).map((permiso) => ({
        modulo: modulo as CodigoModulo,
        permiso,
      })),
  );
}
