import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditoriaService,
  VALOR_OMITIDO,
} from '../auditoria/auditoria.service.js';
import { ContrasenasService } from '../auth/contrasenas.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import { generarContrasenaTemporal } from './contrasena-temporal.js';
import {
  clavePar,
  type ConsultarUsuariosDto,
  type ContrasenaTemporalDto,
  type CrearUsuarioDto,
  type DetalleUsuarioDto,
  type EditarUsuarioDto,
  type EventoRolDto,
  type HistorialRolesDto,
  type OpcionesUsuariosDto,
  type PaginaUsuariosDto,
  type RolParaAsignarDto,
  type UsuarioCreadoDto,
  type UsuarioDto,
} from './dto/usuarios.dto.js';
import {
  bloquearMatriz,
  contarAdministradoresActivos,
} from './roles.service.js';

type Transaccion = Prisma.TransactionClient;

export const MENSAJE_USUARIO_NO_EXISTE = 'El usuario no existe.';
export const MENSAJE_CORREO_REPETIDO = 'Ya existe un usuario con ese correo.';
export const MENSAJE_DOCUMENTO_REPETIDO =
  'Ya existe un usuario con ese documento de identidad.';
export const MENSAJE_PROGRAMA_NO_EXISTE =
  'El programa seleccionado no existe o está inactivo.';
export const MENSAJE_ROL_NO_DISPONIBLE =
  'Alguno de los roles seleccionados no existe o está inactivo.';
export const MENSAJE_ROL_REPETIDO =
  'Un rol no puede repetirse sobre el mismo programa.';
export const MENSAJE_NO_INACTIVARSE =
  'No puede inactivar su propio usuario. Pídaselo a otra persona que administre usuarios.';
export const MENSAJE_ULTIMO_ADMINISTRADOR_USUARIO =
  'No se puede hacer este cambio: ningún usuario activo quedaría administrando usuarios y roles.';
export const MENSAJE_ROL_YA_ASIGNADO =
  'El usuario ya tiene ese rol vigente sobre ese programa.';
export const MENSAJE_ASIGNACION_NO_EXISTE =
  'El usuario no tiene ese rol vigente.';
export const MENSAJE_NO_QUITARSE_ADMINISTRACION =
  'No puede quitarse a sí mismo el rol con el que administra usuarios y roles. Pídaselo a otra persona que los administre.';
export const MENSAJE_FUERA_DE_ALCANCE =
  'Solo puede administrar usuarios y roles de los programas que tiene a su cargo.';

const MODULO = 'usuarios';
/** Entidades con las que quedan en auditoría los cambios de este servicio. */
export const ENTIDAD_USUARIO = 'usuario';
export const ENTIDAD_USUARIO_ROL = 'usuario_rol';

/** Eventos que trae el historial de roles de un usuario, como mucho. */
export const LIMITE_HISTORIAL = 200;

export const MOTIVO_USUARIO_INACTIVADO = 'usuario_inactivado';
export const MOTIVO_CONTRASENA_RESTABLECIDA = 'contrasena_restablecida';

/** Mismo criterio que el inicio de sesión: rol activo, no revocado y de un catálogo activo. */
const ROL_VIGENTE = {
  activo: true,
  fecha_revocacion: null,
  rol: { is: { activo: true } },
} as const;

/** `password_hash` no está, y no debe estar, en ninguna selección de este servicio. */
const SELECCION_USUARIO = {
  id: true,
  nombres: true,
  apellidos: true,
  email: true,
  id_programa: true,
  activo: true,
  programa_usuario_id_programaToprograma: { select: { nombre: true } },
  usuario_rol_usuario_rol_id_usuarioTousuario: {
    where: ROL_VIGENTE,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      id_rol: true,
      id_programa: true,
      fecha_asignacion: true,
      rol: { select: { nombre: true } },
      programa: { select: { nombre: true } },
    },
  },
} satisfies Prisma.usuarioSelect;

const SELECCION_DETALLE = {
  ...SELECCION_USUARIO,
  identificacion: true,
  ultimo_acceso: true,
  bloqueado_hasta: true,
  created_at: true,
} satisfies Prisma.usuarioSelect;

type UsuarioLeido = Prisma.usuarioGetPayload<{
  select: typeof SELECCION_USUARIO;
}>;
type DetalleLeido = Prisma.usuarioGetPayload<{
  select: typeof SELECCION_DETALLE;
}>;

/**
 * Gestión de usuarios (RF-02): consulta con filtros (HU-02-04), creación con sus roles
 * (HU-02-01), edición (HU-02-02) e inactivación (HU-02-03).
 *
 * Los usuarios no se eliminan (RF-02, excepción p6; NFR-017): se inactivan, y por eso aquí no
 * hay borrado. El documento de identidad y la contraseña son datos reservados: el primero
 * solo llega a quien administra, y la contraseña nunca sale salvo la temporal recién creada.
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contrasenas: ContrasenasService,
    private readonly alcance: AlcanceService,
  ) {}

  /** Listado paginado, por apellidos. Quien solo consulta ve a los de sus programas. */
  async listar(
    consulta: ConsultarUsuariosDto,
    usuario: UsuarioSesion,
  ): Promise<PaginaUsuariosDto> {
    const { pagina, tamano, idPrograma, idRol, estado, buscar } = consulta;
    const condiciones: Prisma.usuarioWhereInput[] = [
      await this.filtroDeConsulta(usuario),
    ];
    if (idPrograma !== undefined) {
      condiciones.push(enProgramas([idPrograma]));
    }
    if (idRol !== undefined) {
      condiciones.push({
        usuario_rol_usuario_rol_id_usuarioTousuario: {
          some: { ...ROL_VIGENTE, id_rol: idRol },
        },
      });
    }
    if (estado === 'activo') {
      condiciones.push({ activo: true });
    } else if (estado === 'inactivo') {
      condiciones.push({ OR: [{ activo: false }, { activo: null }] });
    }
    if (buscar) {
      condiciones.push({
        AND: buscar
          .split(/\s+/)
          .map(literal)
          .map((palabra) => ({
            OR: [
              { nombres: { contains: palabra } },
              { apellidos: { contains: palabra } },
              { email: { contains: palabra } },
            ],
          })),
      });
    }
    const where: Prisma.usuarioWhereInput = { AND: condiciones };
    const [total, usuarios] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        select: SELECCION_USUARIO,
        orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return { elementos: usuarios.map(aUsuario), pagina, tamano, total };
  }

  /** Programas y roles para los filtros y el formulario. No se pagina: son catálogos cortos. */
  async opciones(usuario: UsuarioSesion): Promise<OpcionesUsuariosDto> {
    const { global, programas } = await this.alcance.alcanceConPermiso(
      usuario.id,
      MODULO,
      'leer',
    );
    const [listaProgramas, roles] = await Promise.all([
      this.prisma.programa.findMany({
        where: { activo: true, ...(global ? {} : { id: { in: programas } }) },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.rol.findMany({
        where: { activo: true },
        select: { id: true, nombre: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    const aOpcion = ({
      id,
      nombre,
    }: {
      id: number;
      nombre: string | null;
    }) => ({
      id,
      nombre: nombre ?? '',
    });
    return {
      programas: listaProgramas.map(aOpcion),
      roles: roles.map(aOpcion),
    };
  }

  /** Un usuario. 404 si no existe o si quien consulta no alcanza su programa. */
  async obtener(
    id: number,
    usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    const encontrado = await this.prisma.usuario.findFirst({
      where: { AND: [{ id }, await this.filtroDeConsulta(usuario)] },
      select: SELECCION_DETALLE,
    });
    if (!encontrado) {
      throw new NotFoundException(MENSAJE_USUARIO_NO_EXISTE);
    }
    return aDetalle(encontrado, administra(usuario));
  }

  /**
   * HU-02-01: crea el usuario activo, con sus roles y una contraseña temporal que se devuelve
   * solo en esta respuesta.
   */
  async crear(
    datos: CrearUsuarioDto,
    usuario: UsuarioSesion,
  ): Promise<UsuarioCreadoDto> {
    const roles = sinRepetir(datos.roles);
    await this.exigirAlcance(usuario, [
      datos.idPrograma,
      ...roles.map((rol) => rol.idPrograma ?? null),
    ]);
    await this.exigirPrograma(datos.idPrograma);
    await this.exigirRoles(roles);
    await this.exigirUnicos(datos);

    const contrasenaTemporal = generarContrasenaTemporal();
    const hash = await this.contrasenas.hashear(contrasenaTemporal);
    const ahora = new Date();
    const { idUsuario, asignaciones } = await this.guardar(async (tx) => {
      const creado = await tx.usuario.create({
        data: {
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          email: datos.correo,
          identificacion: datos.identificacion,
          id_programa: datos.idPrograma,
          password_hash: hash,
          activo: true,
        },
        select: { id: true },
      });
      const filas = [];
      for (const rol of roles) {
        filas.push(
          await tx.usuario_rol.create({
            data: {
              id_usuario: creado.id,
              id_rol: rol.idRol,
              id_programa: rol.idPrograma ?? null,
              activo: true,
              id_asignado_por: usuario.id,
              fecha_asignacion: ahora,
            },
            select: { id: true, id_rol: true, id_programa: true },
          }),
        );
      }
      return { idUsuario: creado.id, asignaciones: filas };
    });

    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: ENTIDAD_USUARIO,
      idRegistro: idUsuario,
      valorNuevo: {
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        correo: datos.correo,
        // El documento es un dato personal: queda que se registró, no su valor.
        identificacion: VALOR_OMITIDO,
        idPrograma: datos.idPrograma,
        activo: true,
      },
    });
    for (const fila of asignaciones) {
      await this.auditoria.registrar({
        accion: 'crear',
        tablaAfectada: ENTIDAD_USUARIO_ROL,
        idRegistro: fila.id,
        valorNuevo: {
          idUsuario,
          idRol: fila.id_rol,
          idPrograma: fila.id_programa,
          activo: true,
        },
      });
    }

    return {
      usuario: await this.detalle(idUsuario, true),
      contrasenaTemporal,
    };
  }

  /** HU-02-02: cambia los datos indicados y audita solo los que cambiaron. */
  async editar(
    id: number,
    datos: EditarUsuarioDto,
    usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    const actual = await this.cargarParaAdministrar(id, usuario);
    const anterior: Record<string, Prisma.InputJsonValue | null> = {};
    const nuevo: Record<string, Prisma.InputJsonValue | null> = {};
    const cambios: Prisma.usuarioUncheckedUpdateInput = {};

    if (datos.nombres !== undefined && datos.nombres !== actual.nombres) {
      anterior.nombres = actual.nombres;
      nuevo.nombres = cambios.nombres = datos.nombres;
    }
    if (datos.apellidos !== undefined && datos.apellidos !== actual.apellidos) {
      anterior.apellidos = actual.apellidos;
      nuevo.apellidos = cambios.apellidos = datos.apellidos;
    }
    if (datos.correo !== undefined && datos.correo !== actual.email) {
      anterior.correo = actual.email;
      nuevo.correo = cambios.email = datos.correo;
    }
    if (
      datos.identificacion !== undefined &&
      datos.identificacion !== actual.identificacion
    ) {
      // Queda que el documento cambió, no su valor (Ley 1581).
      anterior.identificacion = VALOR_OMITIDO;
      nuevo.identificacion = VALOR_OMITIDO;
      cambios.identificacion = datos.identificacion;
    }
    if (
      datos.idPrograma !== undefined &&
      datos.idPrograma !== actual.id_programa
    ) {
      await this.exigirAlcance(usuario, [datos.idPrograma]);
      await this.exigirPrograma(datos.idPrograma);
      anterior.idPrograma = actual.id_programa;
      nuevo.idPrograma = cambios.id_programa = datos.idPrograma;
    }
    if (Object.keys(cambios).length === 0) {
      return aDetalle(actual, true);
    }

    await this.exigirUnicos(
      {
        correo: cambios.email ? datos.correo : undefined,
        identificacion: cambios.identificacion
          ? datos.identificacion
          : undefined,
      },
      id,
    );
    await this.guardar((tx) =>
      tx.usuario.update({ where: { id }, data: cambios, select: { id: true } }),
    );
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: ENTIDAD_USUARIO,
      idRegistro: id,
      valorAnterior: anterior,
      valorNuevo: nuevo,
    });
    return this.detalle(id, true);
  }

  /**
   * HU-02-03: inactiva o reactiva. Un usuario inactivo no puede iniciar sesión, y sus
   * sesiones abiertas se revocan para que no revivan si después se reactiva.
   */
  async cambiarEstado(
    id: number,
    activo: boolean,
    usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    const actual = await this.cargarParaAdministrar(id, usuario);
    if ((actual.activo === true) === activo) {
      return aDetalle(actual, true);
    }
    if (!activo && id === usuario.id) {
      throw new ConflictException(MENSAJE_NO_INACTIVARSE);
    }
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await bloquearMatriz(tx);
      await tx.usuario.update({ where: { id }, data: { activo } });
      if (!activo) {
        await tx.sesion.updateMany({
          where: { id_usuario: id, revocada_en: null },
          data: {
            revocada_en: ahora,
            motivo_revocacion: MOTIVO_USUARIO_INACTIVADO,
          },
        });
        await exigirAdministrador(tx);
      }
    });
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: ENTIDAD_USUARIO,
      idRegistro: id,
      valorAnterior: { activo: !activo },
      valorNuevo: { activo },
    });
    return this.detalle(id, true);
  }

  /**
   * Genera una contraseña temporal nueva y la devuelve solo en esta respuesta. Cierra las
   * demás sesiones del usuario y levanta el bloqueo por intentos fallidos, si lo tenía.
   */
  async generarContrasena(
    id: number,
    usuario: UsuarioSesion,
  ): Promise<ContrasenaTemporalDto> {
    await this.cargarParaAdministrar(id, usuario);
    const contrasenaTemporal = generarContrasenaTemporal();
    const hash = await this.contrasenas.hashear(contrasenaTemporal);
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          password_hash: hash,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        },
      });
      await tx.sesion.updateMany({
        where: {
          id_usuario: id,
          revocada_en: null,
          // Quien se la cambia a sí mismo conserva la sesión con la que lo hizo.
          NOT: { id: usuario.idSesion },
        },
        data: {
          revocada_en: ahora,
          motivo_revocacion: MOTIVO_CONTRASENA_RESTABLECIDA,
        },
      });
    });
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: ENTIDAD_USUARIO,
      idRegistro: id,
      // Queda que se generó una contraseña, nunca la contraseña.
      valorNuevo: { contrasena: VALOR_OMITIDO },
    });
    return { contrasenaTemporal };
  }

  /**
   * HU-02-07: asigna un rol sobre un programa. Si el usuario ya lo tuvo y se le revocó, se
   * reutiliza la misma fila de `usuario_rol` (el índice único no admite otra): vuelve a quedar
   * vigente, con la fecha y quien lo asigna ahora. Lo anterior queda en la auditoría.
   */
  async asignarRol(
    id: number,
    datos: RolParaAsignarDto,
    usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    await this.cargarParaAdministrar(id, usuario);
    const idPrograma = datos.idPrograma ?? null;
    await this.exigirAlcance(usuario, [idPrograma]);
    await this.exigirRoles([datos]);

    const ahora = new Date();
    const { fila, anterior } = await this.guardar(async (tx) => {
      const existente = await tx.usuario_rol.findFirst({
        where: { id_usuario: id, id_rol: datos.idRol, id_programa: idPrograma },
        select: { id: true, activo: true, fecha_revocacion: true },
      });
      if (existente?.activo === true && existente.fecha_revocacion === null) {
        throw new ConflictException(MENSAJE_ROL_YA_ASIGNADO);
      }
      const vigente = {
        activo: true,
        fecha_revocacion: null,
        fecha_asignacion: ahora,
        id_asignado_por: usuario.id,
      };
      const guardada = existente
        ? await tx.usuario_rol.update({
            where: { id: existente.id },
            data: vigente,
            select: { id: true },
          })
        : await tx.usuario_rol.create({
            data: {
              ...vigente,
              id_usuario: id,
              id_rol: datos.idRol,
              id_programa: idPrograma,
            },
            select: { id: true },
          });
      return { fila: guardada, anterior: existente };
    }, MENSAJE_ROL_YA_ASIGNADO);

    await this.auditoria.registrar({
      accion: anterior ? 'actualizar' : 'crear',
      tablaAfectada: ENTIDAD_USUARIO_ROL,
      idRegistro: fila.id,
      ...(anterior && {
        valorAnterior: {
          activo: false,
          fechaRevocacion: anterior.fecha_revocacion?.toISOString() ?? null,
        },
      }),
      valorNuevo: {
        idUsuario: id,
        idRol: datos.idRol,
        idPrograma,
        activo: true,
      },
    });
    return this.detalle(id, true);
  }

  /**
   * HU-02-07: revoca un rol. Es una revocación lógica: la fila queda inactiva, con su fecha.
   * Los permisos se leen de la base en cada petición, así que rige desde la siguiente.
   */
  async revocarRol(
    id: number,
    idAsignacion: number,
    usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    await this.cargarParaAdministrar(id, usuario);
    const asignacion = await this.prisma.usuario_rol.findFirst({
      where: {
        id: idAsignacion,
        id_usuario: id,
        activo: true,
        fecha_revocacion: null,
      },
      select: {
        id: true,
        id_rol: true,
        id_programa: true,
        fecha_asignacion: true,
        rol: {
          select: {
            rol_permiso: {
              where: {
                modulo: { is: { codigo: MODULO } },
                permiso: { is: { codigo: 'administrar' } },
              },
              select: { id_rol: true },
            },
          },
        },
      },
    });
    if (!asignacion) {
      throw new NotFoundException(MENSAJE_ASIGNACION_NO_EXISTE);
    }
    await this.exigirAlcance(usuario, [asignacion.id_programa]);
    if (id === usuario.id && (asignacion.rol?.rol_permiso.length ?? 0) > 0) {
      throw new ConflictException(MENSAJE_NO_QUITARSE_ADMINISTRACION);
    }

    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await bloquearMatriz(tx);
      await tx.usuario_rol.update({
        where: { id: asignacion.id },
        data: { activo: false, fecha_revocacion: ahora },
      });
      await exigirAdministrador(tx);
    });
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: ENTIDAD_USUARIO_ROL,
      idRegistro: asignacion.id,
      valorAnterior: {
        activo: true,
        fechaAsignacion: asignacion.fecha_asignacion?.toISOString() ?? null,
      },
      valorNuevo: {
        idUsuario: id,
        idRol: asignacion.id_rol,
        idPrograma: asignacion.id_programa,
        activo: false,
      },
    });
    return this.detalle(id, true);
  }

  /**
   * HU-02-07: quién tuvo qué rol y cuándo. Sale de la auditoría, que guarda cada asignación
   * y cada revocación con su fecha y quién la hizo, aunque la fila de `usuario_rol` se
   * reutilice. Lo que no pasó por este servicio (los roles del sembrado) no tiene auditoría:
   * de eso se muestra lo que dice la propia fila. Los más recientes primero, hasta
   * LIMITE_HISTORIAL eventos.
   */
  async historialRoles(
    id: number,
    usuario: UsuarioSesion,
  ): Promise<HistorialRolesDto> {
    await this.cargarParaAdministrar(id, usuario);
    const filas = await this.prisma.usuario_rol.findMany({
      where: { id_usuario: id },
      select: {
        id: true,
        id_rol: true,
        id_programa: true,
        fecha_asignacion: true,
        fecha_revocacion: true,
        rol: { select: { nombre: true } },
        programa: { select: { nombre: true } },
        usuario_usuario_rol_id_asignado_porTousuario: {
          select: { nombres: true, apellidos: true },
        },
      },
    });
    const porId = new Map(filas.map((fila) => [fila.id, fila]));
    const registros = await this.prisma.auditoria.findMany({
      where: {
        tabla_afectada: ENTIDAD_USUARIO_ROL,
        id_registro: { in: [...porId.keys()] },
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: LIMITE_HISTORIAL,
      select: {
        id_registro: true,
        fecha: true,
        valor_anterior: true,
        valor_nuevo: true,
        usuario: { select: { nombres: true, apellidos: true } },
      },
    });

    const eventos: (EventoRolDto & { orden: number })[] = [];
    const agregar = (
      fila: (typeof filas)[number],
      tipo: EventoRolDto['tipo'],
      fecha: Date,
      realizadoPor: string | null,
    ) =>
      eventos.push({
        idAsignacion: fila.id,
        tipo,
        idRol: fila.id_rol as number,
        rol: fila.rol?.nombre ?? '',
        idPrograma: fila.id_programa,
        programa: fila.programa?.nombre ?? null,
        fecha: fecha.toISOString(),
        realizadoPor,
        orden: fecha.getTime(),
      });

    /** El registro de auditoría más antiguo de cada fila (llegan del más reciente al más antiguo). */
    const masAntiguo = new Map<number, (typeof registros)[number]>();
    for (const registro of registros) {
      const fila = porId.get(registro.id_registro as number);
      if (!fila || !registro.fecha) {
        continue;
      }
      masAntiguo.set(fila.id, registro);
      agregar(
        fila,
        esRevocacion(registro.valor_nuevo) ? 'revocacion' : 'asignacion',
        registro.fecha,
        nombreDe(registro.usuario),
      );
    }
    // Lo que la auditoría no tiene (los roles del sembrado), de la propia fila.
    if (registros.length < LIMITE_HISTORIAL) {
      for (const fila of filas) {
        const primero = masAntiguo.get(fila.id);
        if (!primero) {
          if (fila.fecha_asignacion) {
            agregar(
              fila,
              'asignacion',
              fila.fecha_asignacion,
              nombreDe(fila.usuario_usuario_rol_id_asignado_porTousuario),
            );
          }
          if (fila.fecha_revocacion) {
            agregar(fila, 'revocacion', fila.fecha_revocacion, null);
          }
        } else if (esRevocacion(primero.valor_nuevo)) {
          // Se revocó un rol que nunca pasó por la auditoría: la revocación guardó desde
          // cuándo lo tenía.
          const desde = fechaDe(primero.valor_anterior, 'fechaAsignacion');
          if (desde) {
            agregar(fila, 'asignacion', desde, null);
          }
        }
      }
    }
    return {
      eventos: eventos
        .sort((a, b) => b.orden - a.orden)
        .slice(0, LIMITE_HISTORIAL)
        .map(({ orden: _orden, ...evento }) => evento),
    };
  }

  /** Quien solo consulta (`usuarios.leer` con programa) ve a los usuarios de sus programas. */
  private async filtroDeConsulta(
    usuario: UsuarioSesion,
  ): Promise<Prisma.usuarioWhereInput> {
    const { global, programas } = await this.alcance.alcanceConPermiso(
      usuario.id,
      MODULO,
      'leer',
    );
    return global ? {} : enProgramas(programas);
  }

  /**
   * Quien administra con un rol limitado a un programa solo toca usuarios y roles de ese
   * programa: sin esto podría darse a sí mismo, o a otro, un rol sobre todos los programas.
   */
  private async exigirAlcance(
    usuario: UsuarioSesion,
    programasAfectados: (number | null)[],
  ): Promise<void> {
    const { global, programas } = await this.alcance.alcanceConPermiso(
      usuario.id,
      MODULO,
      'administrar',
    );
    if (global) {
      return;
    }
    if (
      programasAfectados.some(
        (programa) => programa === null || !programas.includes(programa),
      )
    ) {
      throw new ForbiddenException(MENSAJE_FUERA_DE_ALCANCE);
    }
  }

  private async cargarParaAdministrar(
    id: number,
    usuario: UsuarioSesion,
  ): Promise<DetalleLeido> {
    const encontrado = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECCION_DETALLE,
    });
    if (!encontrado) {
      throw new NotFoundException(MENSAJE_USUARIO_NO_EXISTE);
    }
    await this.exigirAlcance(usuario, [encontrado.id_programa]);
    return encontrado;
  }

  private async detalle(
    id: number,
    conDocumento: boolean,
  ): Promise<DetalleUsuarioDto> {
    const encontrado = await this.prisma.usuario.findUniqueOrThrow({
      where: { id },
      select: SELECCION_DETALLE,
    });
    return aDetalle(encontrado, conDocumento);
  }

  private async exigirPrograma(idPrograma: number): Promise<void> {
    const programa = await this.prisma.programa.findFirst({
      where: { id: idPrograma, activo: true },
      select: { id: true },
    });
    if (!programa) {
      throw new BadRequestException(MENSAJE_PROGRAMA_NO_EXISTE);
    }
  }

  private async exigirRoles(roles: RolParaAsignarDto[]): Promise<void> {
    const idsRol = [...new Set(roles.map((rol) => rol.idRol))];
    const idsPrograma = [
      ...new Set(
        roles
          .map((rol) => rol.idPrograma)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];
    const [rolesActivos, programasActivos] = await Promise.all([
      this.prisma.rol.count({ where: { id: { in: idsRol }, activo: true } }),
      this.prisma.programa.count({
        where: { id: { in: idsPrograma }, activo: true },
      }),
    ]);
    if (rolesActivos !== idsRol.length) {
      throw new BadRequestException(MENSAJE_ROL_NO_DISPONIBLE);
    }
    if (programasActivos !== idsPrograma.length) {
      throw new BadRequestException(MENSAJE_PROGRAMA_NO_EXISTE);
    }
  }

  /** RF-02, excepción p5: el correo es único, también al editar. El documento también. */
  private async exigirUnicos(
    datos: { correo?: string; identificacion?: string },
    excepto?: number,
  ): Promise<void> {
    const otro = excepto === undefined ? {} : { NOT: { id: excepto } };
    if (datos.correo !== undefined) {
      const repetido = await this.prisma.usuario.findFirst({
        where: { email: datos.correo, ...otro },
        select: { id: true },
      });
      if (repetido) {
        throw new ConflictException(MENSAJE_CORREO_REPETIDO);
      }
    }
    if (datos.identificacion !== undefined) {
      const repetido = await this.prisma.usuario.findFirst({
        where: { identificacion: datos.identificacion, ...otro },
        select: { id: true },
      });
      if (repetido) {
        throw new ConflictException(MENSAJE_DOCUMENTO_REPETIDO);
      }
    }
  }

  /**
   * Ejecuta la escritura en una transacción. Si dos personas guardan a la vez el mismo correo
   * o documento, la segunda choca con el índice único: se responde 409, no 500.
   */
  private async guardar<T>(
    escritura: (tx: Transaccion) => Promise<T>,
    mensajeRepetido?: string,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(escritura);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          mensajeRepetido ??
            (JSON.stringify(error.meta ?? {}).includes('identificacion')
              ? MENSAJE_DOCUMENTO_REPETIDO
              : MENSAJE_CORREO_REPETIDO),
        );
      }
      throw error;
    }
  }
}

function administra(usuario: UsuarioSesion): boolean {
  return usuario.permisos.includes(`${MODULO}.administrar`);
}

/** Usuarios que pertenecen a alguno de los programas o tienen en ellos un rol vigente. */
function enProgramas(programas: number[]): Prisma.usuarioWhereInput {
  return {
    OR: [
      { id_programa: { in: programas } },
      {
        usuario_rol_usuario_rol_id_usuarioTousuario: {
          some: { ...ROL_VIGENTE, id_programa: { in: programas } },
        },
      },
    ],
  };
}

/** `contains` se traduce a LIKE: `%` y `_` se buscan como texto, no como comodines. */
function literal(palabra: string): string {
  return palabra.replace(/[\\%_]/g, '\\$&');
}

function sinRepetir(roles: RolParaAsignarDto[]): RolParaAsignarDto[] {
  if (new Set(roles.map(clavePar)).size !== roles.length) {
    throw new BadRequestException(MENSAJE_ROL_REPETIDO);
  }
  return roles;
}

/**
 * RF-03, excepción p3, vista desde los usuarios: después del cambio, algún usuario activo
 * debe seguir administrando usuarios y roles. Si no, la transacción se deshace.
 */
export async function exigirAdministrador(tx: Transaccion): Promise<void> {
  if ((await contarAdministradoresActivos(tx)) === 0) {
    throw new ConflictException(MENSAJE_ULTIMO_ADMINISTRADOR_USUARIO);
  }
}

/** En la auditoría de los roles, una revocación deja «activo: false» en el valor nuevo. */
function esRevocacion(valorNuevo: Prisma.JsonValue | null): boolean {
  return (
    valorNuevo !== null &&
    typeof valorNuevo === 'object' &&
    !Array.isArray(valorNuevo) &&
    valorNuevo.activo === false
  );
}

function fechaDe(valor: Prisma.JsonValue | null, campo: string): Date | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return null;
  }
  const texto = valor[campo];
  const fecha = typeof texto === 'string' ? new Date(texto) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
}

function nombreDe(
  persona: { nombres: string | null; apellidos: string | null } | null,
): string | null {
  return persona
    ? [persona.nombres, persona.apellidos].filter(Boolean).join(' ').trim()
    : null;
}

function aUsuario(fila: UsuarioLeido): UsuarioDto {
  return {
    id: fila.id,
    nombres: fila.nombres ?? '',
    apellidos: fila.apellidos ?? '',
    correo: fila.email ?? '',
    idPrograma: fila.id_programa,
    programa: fila.programa_usuario_id_programaToprograma?.nombre ?? null,
    activo: fila.activo === true,
    roles: fila.usuario_rol_usuario_rol_id_usuarioTousuario.map(
      (asignacion) => ({
        id: asignacion.id,
        idRol: asignacion.id_rol as number,
        rol: asignacion.rol?.nombre ?? '',
        idPrograma: asignacion.id_programa,
        programa: asignacion.programa?.nombre ?? null,
        fechaAsignacion: asignacion.fecha_asignacion?.toISOString() ?? null,
      }),
    ),
  };
}

function aDetalle(
  fila: DetalleLeido,
  conDocumento: boolean,
): DetalleUsuarioDto {
  return {
    ...aUsuario(fila),
    identificacion: conDocumento ? fila.identificacion : null,
    ultimoAcceso: fila.ultimo_acceso?.toISOString() ?? null,
    bloqueadoHasta:
      fila.bloqueado_hasta && fila.bloqueado_hasta > new Date()
        ? fila.bloqueado_hasta.toISOString()
        : null,
    fechaCreacion: fila.created_at?.toISOString() ?? null,
  };
}
