import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ConsultarRolesDto,
  CrearRolDto,
  EditarRolDto,
  MatrizPermisosDto,
  PaginaRolesDto,
  PermisoAsignadoDto,
  ReemplazarPermisosDto,
  RolDto,
} from './dto/roles.dto.js';

type Transaccion = Prisma.TransactionClient;

export const MENSAJE_ROL_NO_EXISTE = 'El rol no existe.';
export const MENSAJE_NOMBRE_REPETIDO = 'Ya existe un rol con ese nombre.';
export const MENSAJE_SIN_LECTURA =
  'El rol debe conservar al menos un permiso de lectura.';
export const MENSAJE_ROL_SISTEMA_NOMBRE =
  'Los roles del sistema no se pueden renombrar: el sistema los reconoce por su nombre.';
export const MENSAJE_ROL_SISTEMA_INACTIVAR =
  'Los roles del sistema no se pueden inactivar.';
export const MENSAJE_ROL_CON_USUARIOS =
  'No se puede inactivar un rol que tiene usuarios activos asociados. Retíreles el rol primero.';
export const MENSAJE_ULTIMO_ADMINISTRADOR =
  'No se puede retirar el permiso de administración de usuarios y roles: ningún usuario activo lo conservaría.';

/** Permiso que permite administrar usuarios, roles y la matriz (RF-03, excepción p3). */
const MODULO_ADMINISTRACION = 'usuarios';
const PERMISO_ADMINISTRACION = 'administrar';
const PERMISO_LECTURA = 'leer';

/** Los seis roles de RF-03. El sistema los reconoce por su nombre (`ROL`). */
const NOMBRES_SISTEMA: ReadonlySet<string> = new Set(Object.values(ROL));

/** Asignación de rol vigente: activa, sin revocar y de un usuario activo. */
const ASIGNACION_VIGENTE = {
  activo: true,
  fecha_revocacion: null,
  usuario_usuario_rol_id_usuarioTousuario: { is: { activo: true } },
} as const;

const SELECCION_ROL = {
  id: true,
  nombre: true,
  descripcion: true,
  activo: true,
  rol_permiso: {
    select: {
      modulo: { select: { codigo: true, orden: true } },
      permiso: { select: { codigo: true, id: true } },
    },
  },
  _count: { select: { usuario_rol: { where: ASIGNACION_VIGENTE } } },
} as const;

type RolSeleccionado = Prisma.rolGetPayload<{ select: typeof SELECCION_ROL }>;

/**
 * Roles del sistema y matriz de permisos por módulo (RF-03, HU-02-05 y HU-02-06). Solo para el
 * Administrador (precondición de RF-03).
 *
 * Los permisos se leen de la base en cada petición protegida (RF-03, q1), así que un cambio en
 * la matriz rige desde la siguiente petición de los usuarios afectados.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar({ pagina, tamano }: ConsultarRolesDto): Promise<PaginaRolesDto> {
    const [total, roles] = await Promise.all([
      this.prisma.rol.count(),
      this.prisma.rol.findMany({
        select: SELECCION_ROL,
        orderBy: [{ activo: 'desc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return { elementos: roles.map(aDto), pagina, tamano, total };
  }

  async obtener(id: number): Promise<RolDto> {
    const rol = await this.prisma.rol.findUnique({
      where: { id },
      select: SELECCION_ROL,
    });
    if (!rol) {
      throw new NotFoundException(MENSAJE_ROL_NO_EXISTE);
    }
    return aDto(rol);
  }

  /**
   * Matriz completa (HU-02-06). No se pagina: la acota el catálogo de roles, módulos y
   * permisos, y la pantalla la necesita entera para dibujarla.
   */
  async matriz(): Promise<MatrizPermisosDto> {
    const [modulos, permisos, roles] = await Promise.all([
      this.prisma.modulo.findMany({
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.permiso.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.rol.findMany({
        select: SELECCION_ROL,
        orderBy: [{ activo: 'desc' }, { id: 'asc' }],
      }),
    ]);
    return {
      modulos: modulos.map(aCatalogo),
      permisos: permisos.map(aCatalogo),
      roles: roles.map(aDto),
    };
  }

  /** HU-02-05: crea el rol junto con sus permisos; exige al menos uno de lectura. */
  async crear(datos: CrearRolDto): Promise<RolDto> {
    exigirLectura(datos.permisos);
    const creado = await this.prisma.$transaction(async (tx) => {
      await this.exigirNombreLibre(tx, datos.nombre);
      const ids = await resolverPermisos(tx, datos.permisos);
      const rol = await tx.rol.create({
        data: {
          nombre: datos.nombre,
          descripcion: datos.descripcion ?? null,
          activo: true,
        },
      });
      await tx.rol_permiso.createMany({
        data: ids.map((par) => ({ id_rol: rol.id, ...par })),
      });
      return rol;
    });

    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: 'rol',
      idRegistro: creado.id,
      valorNuevo: {
        nombre: creado.nombre,
        descripcion: creado.descripcion,
        permisos: datos.permisos.map(clave).sort(),
      },
    });
    return this.obtener(creado.id);
  }

  /** HU-02-05: edita el nombre y la descripción. Los roles del sistema no se renombran. */
  async editar(id: number, datos: EditarRolDto): Promise<RolDto> {
    const { anterior, nuevo } = await this.prisma.$transaction(async (tx) => {
      const rol = await exigirRol(tx, id);
      const cambios: { nombre?: string; descripcion?: string } = {};
      if (datos.nombre !== undefined && datos.nombre !== rol.nombre) {
        if (NOMBRES_SISTEMA.has(rol.nombre ?? '')) {
          throw new ConflictException(MENSAJE_ROL_SISTEMA_NOMBRE);
        }
        await this.exigirNombreLibre(tx, datos.nombre, id);
        cambios.nombre = datos.nombre;
      }
      if (
        datos.descripcion !== undefined &&
        datos.descripcion !== rol.descripcion
      ) {
        cambios.descripcion = datos.descripcion;
      }
      if (Object.keys(cambios).length > 0) {
        await tx.rol.update({ where: { id }, data: cambios });
      }
      // En auditoría van solo los campos que cambian (CLAUDE.md, «Auditoría»).
      const previos = Object.fromEntries(
        Object.keys(cambios).map((campo) => [
          campo,
          rol[campo as keyof typeof cambios] ?? null,
        ]),
      );
      return { anterior: previos, nuevo: cambios };
    });

    if (Object.keys(nuevo).length > 0) {
      await this.auditoria.registrar({
        accion: 'actualizar',
        tablaAfectada: 'rol',
        idRegistro: id,
        valorAnterior: anterior,
        valorNuevo: nuevo,
      });
    }
    return this.obtener(id);
  }

  /**
   * HU-02-05 y RF-03, excepción p3: «eliminar» un rol es inactivarlo (borrado lógico,
   * NFR-017). No se permite si tiene usuarios activos ni si es un rol del sistema.
   */
  async inactivar(id: number): Promise<RolDto> {
    const inactivado = await this.prisma.$transaction(async (tx) => {
      await bloquearMatriz(tx);
      const rol = await exigirRol(tx, id);
      if (NOMBRES_SISTEMA.has(rol.nombre ?? '')) {
        throw new ConflictException(MENSAJE_ROL_SISTEMA_INACTIVAR);
      }
      if (rol.activo === false) {
        return false;
      }
      const usuarios = await tx.usuario_rol.count({
        where: { id_rol: id, ...ASIGNACION_VIGENTE },
      });
      if (usuarios > 0) {
        throw new ConflictException(MENSAJE_ROL_CON_USUARIOS);
      }
      // Sin usuarios activos, inactivarlo no le quita la administración a nadie: no hace
      // falta revisar la regla del último administrador.
      await tx.rol.update({ where: { id }, data: { activo: false } });
      return true;
    });

    if (inactivado) {
      await this.auditoria.registrar({
        accion: 'actualizar',
        tablaAfectada: 'rol',
        idRegistro: id,
        valorAnterior: { activo: true },
        valorNuevo: { activo: false },
      });
    }
    return this.obtener(id);
  }

  /**
   * HU-02-06: reemplaza los permisos del rol por los indicados. Exige al menos uno de lectura
   * (RF-03, p4) y que algún usuario activo conserve la administración de usuarios y roles
   * (RF-03, excepción p3).
   */
  async reemplazarPermisos(
    id: number,
    datos: ReemplazarPermisosDto,
  ): Promise<RolDto> {
    exigirLectura(datos.permisos);
    const { agregados, retirados } = await this.prisma.$transaction(
      async (tx) => {
        await bloquearMatriz(tx);
        await exigirRol(tx, id);
        const ids = await resolverPermisos(tx, datos.permisos);
        const actuales = await tx.rol_permiso.findMany({
          where: { id_rol: id },
          select: {
            id_modulo: true,
            id_permiso: true,
            modulo: { select: { codigo: true } },
            permiso: { select: { codigo: true } },
          },
        });
        const claveIds = (par: { id_modulo: number; id_permiso: number }) =>
          `${par.id_modulo}:${par.id_permiso}`;
        const nuevos = new Set(ids.map(claveIds));
        const existentes = new Set(actuales.map(claveIds));

        const quitar = actuales.filter((par) => !nuevos.has(claveIds(par)));
        const poner = ids.filter((par) => !existentes.has(claveIds(par)));
        if (quitar.length > 0) {
          await tx.rol_permiso.deleteMany({
            where: {
              id_rol: id,
              OR: quitar.map(({ id_modulo, id_permiso }) => ({
                id_modulo,
                id_permiso,
              })),
            },
          });
        }
        if (poner.length > 0) {
          await tx.rol_permiso.createMany({
            data: poner.map((par) => ({ id_rol: id, ...par })),
          });
        }
        if (
          quitar.some(
            ({ modulo, permiso }) =>
              modulo.codigo === MODULO_ADMINISTRACION &&
              permiso.codigo === PERMISO_ADMINISTRACION,
          )
        ) {
          await exigirAdministradorActivo(tx);
        }
        const codigos = new Map(
          datos.permisos.map((permiso, indice) => [
            claveIds(ids[indice]),
            clave(permiso),
          ]),
        );
        return {
          agregados: poner.map((par) => codigos.get(claveIds(par)) ?? ''),
          retirados: quitar.map(
            ({ modulo, permiso }) => `${modulo.codigo}.${permiso.codigo}`,
          ),
        };
      },
    );

    if (agregados.length > 0 || retirados.length > 0) {
      // Solo lo que cambia: los permisos retirados y los agregados. Va sobre `rol`, porque
      // `rol_permiso` tiene clave compuesta: así el historial del rol (HU-14-03) los muestra.
      await this.auditoria.registrar({
        accion: 'actualizar',
        tablaAfectada: 'rol',
        idRegistro: id,
        valorAnterior: { retirados: retirados.sort() },
        valorNuevo: { agregados: agregados.sort() },
      });
    }
    return this.obtener(id);
  }

  /** El nombre es único sin distinguir mayúsculas ni tildes (collation de la base). */
  private async exigirNombreLibre(
    tx: Transaccion,
    nombre: string,
    excepto?: number,
  ): Promise<void> {
    const existente = await tx.rol.findFirst({
      where: { nombre, ...(excepto ? { NOT: { id: excepto } } : {}) },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException(MENSAJE_NOMBRE_REPETIDO);
    }
  }
}

async function exigirRol(tx: Transaccion, id: number) {
  const rol = await tx.rol.findUnique({ where: { id } });
  if (!rol) {
    throw new NotFoundException(MENSAJE_ROL_NO_EXISTE);
  }
  return rol;
}

/**
 * Serializa los cambios de la matriz: sin esto, dos administradores podrían quitar a la vez
 * la administración a dos roles distintos y ninguno de los dos vería que la dejaron sin nadie.
 * Los cambios de la matriz son escasos (RF-03: frecuencia baja), así que esperar no cuesta.
 */
export async function bloquearMatriz(tx: Transaccion): Promise<void> {
  await tx.$queryRaw`SELECT id FROM permiso WHERE codigo = ${PERMISO_ADMINISTRACION} FOR UPDATE`;
}

/**
 * RF-03, excepción p3: después del cambio, algún usuario activo debe conservar la
 * administración de usuarios y roles mediante un rol activo. Si no, se lanza y la transacción
 * se deshace.
 */
async function exigirAdministradorActivo(tx: Transaccion): Promise<void> {
  if ((await contarAdministradoresActivos(tx)) === 0) {
    throw new ConflictException(MENSAJE_ULTIMO_ADMINISTRADOR);
  }
}

/**
 * Usuarios activos que conservan la administración de usuarios y roles mediante un rol
 * activo. También la usa la gestión de usuarios (RF-02): inactivar a alguien o revocarle un
 * rol no puede dejar el sistema sin nadie que lo administre.
 */
export function contarAdministradoresActivos(tx: Transaccion): Promise<number> {
  return tx.usuario.count({
    where: {
      activo: true,
      usuario_rol_usuario_rol_id_usuarioTousuario: {
        some: {
          activo: true,
          fecha_revocacion: null,
          rol: {
            is: {
              activo: true,
              rol_permiso: {
                some: {
                  modulo: { is: { codigo: MODULO_ADMINISTRACION } },
                  permiso: { is: { codigo: PERMISO_ADMINISTRACION } },
                },
              },
            },
          },
        },
      },
    },
  });
}

function exigirLectura(permisos: PermisoAsignadoDto[]): void {
  if (!permisos.some(({ permiso }) => permiso === PERMISO_LECTURA)) {
    throw new BadRequestException(MENSAJE_SIN_LECTURA);
  }
}

/** Traduce los códigos a ids, en el mismo orden. 400 si algún código no existe. */
async function resolverPermisos(
  tx: Transaccion,
  permisos: PermisoAsignadoDto[],
): Promise<{ id_modulo: number; id_permiso: number }[]> {
  const [modulos, catalogo] = await Promise.all([
    tx.modulo.findMany({ select: { id: true, codigo: true } }),
    tx.permiso.findMany({ select: { id: true, codigo: true } }),
  ]);
  const idModulo = new Map(modulos.map(({ id, codigo }) => [codigo, id]));
  const idPermiso = new Map(catalogo.map(({ id, codigo }) => [codigo, id]));
  return permisos.map(({ modulo, permiso }) => {
    const id_modulo = idModulo.get(modulo);
    if (id_modulo === undefined) {
      throw new BadRequestException(`El módulo «${modulo}» no existe.`);
    }
    const id_permiso = idPermiso.get(permiso);
    if (id_permiso === undefined) {
      throw new BadRequestException(`El permiso «${permiso}» no existe.`);
    }
    return { id_modulo, id_permiso };
  });
}

const clave = ({ modulo, permiso }: PermisoAsignadoDto) =>
  `${modulo}.${permiso}`;

function aDto(rol: RolSeleccionado): RolDto {
  return {
    id: rol.id,
    nombre: rol.nombre ?? '',
    descripcion: rol.descripcion,
    activo: rol.activo !== false,
    sistema: NOMBRES_SISTEMA.has(rol.nombre ?? ''),
    usuariosActivos: rol._count.usuario_rol,
    permisos: [...rol.rol_permiso]
      .sort(
        (a, b) =>
          (a.modulo.orden ?? 0) - (b.modulo.orden ?? 0) ||
          a.permiso.id - b.permiso.id,
      )
      .map(({ modulo, permiso }) => ({
        modulo: modulo.codigo ?? '',
        permiso: permiso.codigo ?? '',
      })),
  };
}

function aCatalogo({
  codigo,
  nombre,
}: {
  codigo: string | null;
  nombre: string | null;
}) {
  return { codigo: codigo ?? '', nombre: nombre ?? '' };
}
