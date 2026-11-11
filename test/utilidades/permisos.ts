import type { NombreRol } from '../../src/auth/roles.js';
import type { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { MODULOS, PERMISOS } from '../../src/datos-iniciales/catalogos.js';
import { permisosInicialesDe } from '../../src/datos-iniciales/matriz-permisos.js';

/**
 * Lo que una prueba agregó a la matriz de permisos (HU-02-06) para poder autorizar sus
 * peticiones (HU-01-03), y que debe quitar al terminar: la base del CI no tiene seed.
 */
export interface MatrizDePrueba {
  modulos: number[];
  permisos: number[];
  /** Roles a los que la prueba les cargó los permisos de la Tabla 11. */
  roles: number[];
}

export function matrizDePrueba(): MatrizDePrueba {
  return { modulos: [], permisos: [], roles: [] };
}

/** Crea los módulos y permisos del catálogo que falten. */
export async function asegurarCatalogoDePermisos(
  prisma: PrismaService,
  creados: MatrizDePrueba,
): Promise<void> {
  for (const datos of MODULOS) {
    if (
      !(await prisma.modulo.findUnique({ where: { codigo: datos.codigo } }))
    ) {
      creados.modulos.push((await prisma.modulo.create({ data: datos })).id);
    }
  }
  for (const datos of PERMISOS) {
    if (
      !(await prisma.permiso.findUnique({ where: { codigo: datos.codigo } }))
    ) {
      creados.permisos.push((await prisma.permiso.create({ data: datos })).id);
    }
  }
}

/**
 * Carga en el rol los permisos iniciales de la Tabla 11, como hace el seed, si el rol todavía
 * no tiene ninguno. Requiere el catálogo (`asegurarCatalogoDePermisos`).
 */
export async function asegurarPermisosDeRol(
  prisma: PrismaService,
  creados: MatrizDePrueba,
  idRol: number,
  nombre: NombreRol,
): Promise<void> {
  if ((await prisma.rol_permiso.count({ where: { id_rol: idRol } })) > 0) {
    return;
  }
  const [modulos, permisos] = await Promise.all([
    prisma.modulo.findMany({ select: { id: true, codigo: true } }),
    prisma.permiso.findMany({ select: { id: true, codigo: true } }),
  ]);
  const idModulo = new Map(modulos.map(({ id, codigo }) => [codigo, id]));
  const idPermiso = new Map(permisos.map(({ id, codigo }) => [codigo, id]));
  await prisma.rol_permiso.createMany({
    data: permisosInicialesDe(nombre).map(({ modulo, permiso }) => ({
      id_rol: idRol,
      id_modulo: idModulo.get(modulo) as number,
      id_permiso: idPermiso.get(permiso) as number,
    })),
  });
  creados.roles.push(idRol);
}

/** Quita lo que la prueba agregó a la matriz, antes de borrar sus roles. */
export async function borrarMatrizDePrueba(
  prisma: PrismaService,
  creados: MatrizDePrueba,
): Promise<void> {
  await prisma.rol_permiso.deleteMany({
    where: { id_rol: { in: creados.roles } },
  });
}

/** Quita los módulos y permisos del catálogo que la prueba creó, después de borrar sus roles. */
export async function borrarCatalogoDePrueba(
  prisma: PrismaService,
  creados: MatrizDePrueba,
): Promise<void> {
  await prisma.modulo.deleteMany({ where: { id: { in: creados.modulos } } });
  await prisma.permiso.deleteMany({ where: { id: { in: creados.permisos } } });
}
