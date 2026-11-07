import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AlcanceService } from './alcance.service.js';
import {
  AsistenteService,
  filtroDocenteDelPrograma,
  MENSAJE_ASIGNATURA_NO_EXISTE,
} from './asistente.service.js';
import type { ConsultarProyectosDocentesDto } from './dto/consultas.dto.js';
import type { CrearProyectoDocenteDto } from './dto/crear-proyecto-docente.dto.js';
import type {
  PaginaProyectosDocentesDto,
  ProyectoDocenteDetalleDto,
} from './dto/respuestas.dto.js';
import {
  aDetalle,
  aResumen,
  INCLUIR_DETALLE,
  INCLUIR_RESUMEN,
} from './mapeo.js';

/** Estado inicial de todo proyecto docente (RF-08, p7; códigos de RF-17). */
export const ESTADO_INICIAL = 'en_diligenciamiento';
/** `proyecto_docente.origen` de un proyecto creado con el asistente (DBML v2.4). */
export const ORIGEN_ASISTENTE = 'manual';

export const MENSAJE_SIN_PERIODO =
  'No hay un período académico activo. El administrador debe configurarlo antes de crear proyectos docentes.';
export const MENSAJE_RAP_INVALIDOS =
  'Los RAP seleccionados deben ser RAP activos del programa de la asignatura.';
export const MENSAJE_DOCENTES_REPETIDOS =
  'Un docente no puede asignarse dos veces.';
export const MENSAJE_UN_RESPONSABLE =
  'Marque exactamente un docente como responsable.';
export const MENSAJE_DOCENTES_INVALIDOS =
  'Solo se pueden asignar usuarios activos con el rol Docente responsable en el programa.';
export const MENSAJE_PROYECTO_EXISTENTE =
  'Ya existe un proyecto docente para esta asignatura, período y grupo. Puede abrir el existente o duplicarlo.';
export const MENSAJE_PROYECTO_NO_EXISTE =
  'El proyecto docente no existe o no tiene acceso a él.';

/** Roles que consultan los proyectos de su programa (matriz de permisos de `URAP-34`). */
const ROLES_CONSULTA_PROGRAMA = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
  ROL.liderRap,
] as const;

@Injectable()
export class ProyectosDocentesService {
  private readonly logger = new Logger(ProyectosDocentesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly asistente: AsistenteService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * RF-08, p7: crea el proyecto docente en estado «En diligenciamiento», con los RAP del
   * paso 3 y los docentes del paso 4, en una sola transacción.
   */
  async crear(
    usuario: UsuarioSesion,
    datos: CrearProyectoDocenteDto,
  ): Promise<ProyectoDocenteDetalleDto> {
    const asignatura = await this.prisma.asignatura.findFirst({
      where: { id: datos.idAsignatura, activo: true },
    });
    if (!asignatura?.id_programa) {
      throw new NotFoundException(MENSAJE_ASIGNATURA_NO_EXISTE);
    }
    const idPrograma = asignatura.id_programa;
    await this.asistente.exigirPrograma(usuario.id, idPrograma);

    this.validarDocentes(datos);
    const [periodo, estado, rapsValidos, docentesValidos] = await Promise.all([
      this.asistente.periodoVigente(),
      this.prisma.estado_proyecto.findUnique({
        where: { codigo: ESTADO_INICIAL },
      }),
      this.prisma.rap.count({
        where: {
          id: { in: datos.idsRap },
          id_programa: idPrograma,
          activo: true,
        },
      }),
      this.prisma.usuario.count({
        where: {
          id: { in: datos.docentes.map((docente) => docente.idUsuario) },
          activo: true,
          usuario_rol_usuario_rol_id_usuarioTousuario: {
            some: filtroDocenteDelPrograma(idPrograma),
          },
        },
      }),
    ]);
    if (!periodo) {
      throw new ConflictException(MENSAJE_SIN_PERIODO);
    }
    if (!estado) {
      // Falta un catálogo base: es un problema de instalación, no del usuario.
      this.logger.error(
        `No existe el estado de proyecto «${ESTADO_INICIAL}». Corra npm run db:sembrar.`,
      );
      throw new InternalServerErrorException();
    }
    if (rapsValidos !== datos.idsRap.length) {
      throw new BadRequestException(MENSAJE_RAP_INVALIDOS);
    }
    if (docentesValidos !== datos.docentes.length) {
      throw new BadRequestException(MENSAJE_DOCENTES_INVALIDOS);
    }

    const grupo = datos.grupo ?? null;
    // El responsable va primero: es quien firma «elaboró» en el formato.
    const docentes = [...datos.docentes].sort(
      (a, b) => Number(b.responsable) - Number(a.responsable),
    );
    const ahora = new Date();

    const creado = await this.prisma.$transaction(async (tx) => {
      // p6 y HU-05-06: un curso es asignatura + período + grupo, sin importar el docente. Se
      // comprueba aquí porque el índice único de MySQL no impide duplicados con grupo nulo.
      // Antes se bloquea la fila de la asignatura: en REPEATABLE READ dos creaciones
      // simultáneas (un doble clic) leerían las dos «no existe» y crearían dos proyectos. Con
      // el bloqueo, las creaciones de una misma asignatura se atienden de a una.
      await tx.$queryRaw`SELECT id FROM asignatura WHERE id = ${asignatura.id} FOR UPDATE`;
      const existente = await tx.proyecto_docente.findFirst({
        where: { id_asignatura: asignatura.id, id_periodo: periodo.id, grupo },
        select: { id: true },
      });
      if (existente) {
        throw new ConflictException(MENSAJE_PROYECTO_EXISTENTE);
      }
      return tx.proyecto_docente.create({
        data: {
          id_asignatura: asignatura.id,
          id_periodo: periodo.id,
          id_estado: estado.id,
          grupo,
          origen: ORIGEN_ASISTENTE,
          id_creado_por: usuario.id,
          fecha_creacion: ahora,
          fecha_actualizacion: ahora,
          proyecto_docente_rap: {
            create: datos.idsRap.map((idRap) => ({ id_rap: idRap })),
          },
          proyecto_docente_docente: {
            create: docentes.map((docente, indice) => ({
              id_usuario: docente.idUsuario,
              responsable: docente.responsable,
              orden: indice + 1,
            })),
          },
        },
        include: INCLUIR_DETALLE,
      });
    });

    // RF-29: después de confirmar, fuera de la transacción. El usuario y la IP salen del
    // contexto de la petición, y un fallo al auditar no deshace la creación.
    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: 'proyecto_docente',
      idRegistro: creado.id,
      valorNuevo: {
        idAsignatura: asignatura.id,
        idPeriodo: periodo.id,
        grupo,
        idsRap: datos.idsRap,
        docentes: docentes.map(({ idUsuario, responsable }) => ({
          idUsuario,
          responsable,
        })),
      },
    });
    return aDetalle(creado);
  }

  /** Bandeja de proyectos: cada usuario ve solo los que su rol y su alcance le permiten. */
  async listar(
    usuario: UsuarioSesion,
    { pagina, tamano }: ConsultarProyectosDocentesDto,
  ): Promise<PaginaProyectosDocentesDto> {
    const visibles = await this.filtroVisibilidad(usuario);
    if (!visibles) {
      return { elementos: [], pagina, tamano, total: 0 };
    }
    const [total, filas] = await Promise.all([
      this.prisma.proyecto_docente.count({ where: visibles }),
      this.prisma.proyecto_docente.findMany({
        where: visibles,
        include: INCLUIR_RESUMEN,
        orderBy: [{ fecha_creacion: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return { elementos: filas.map(aResumen), pagina, tamano, total };
  }

  async obtener(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<ProyectoDocenteDetalleDto> {
    const visibles = await this.filtroVisibilidad(usuario);
    const proyecto = visibles
      ? await this.prisma.proyecto_docente.findFirst({
          where: { AND: [{ id }, visibles] },
          include: INCLUIR_DETALLE,
        })
      : null;
    // Igual respuesta si no existe o si no es visible: no revela proyectos ajenos.
    if (!proyecto?.asignatura) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    return aDetalle(proyecto);
  }

  /**
   * Matriz de permisos (`URAP-34`): el Docente ve solo los proyectos donde está asignado
   * (`proyecto_docente_docente`); Departamento, Dirección y Líder RAP, los de su programa; el
   * Administrador, todos. Un usuario con varios roles ve la unión. Nulo: no ve ninguno.
   * Lo usan también el calendario de sesiones (RF-19) y las evidencias (RF-24), con el mismo
   * criterio.
   */
  async filtroVisibilidad(
    usuario: UsuarioSesion,
  ): Promise<Prisma.proyecto_docenteWhereInput | null> {
    const { global, programas } = await this.alcance.alcance(
      usuario.id,
      ROLES_CONSULTA_PROGRAMA,
    );
    if (global) {
      return {};
    }
    const condiciones: Prisma.proyecto_docenteWhereInput[] = [];
    if (programas.length > 0) {
      condiciones.push({
        asignatura: { is: { id_programa: { in: programas } } },
      });
    }
    if (usuario.roles.includes(ROL.docente)) {
      condiciones.push({
        proyecto_docente_docente: { some: { id_usuario: usuario.id } },
      });
    }
    return condiciones.length > 0 ? { OR: condiciones } : null;
  }

  private validarDocentes({ docentes }: CrearProyectoDocenteDto): void {
    const ids = new Set(docentes.map((docente) => docente.idUsuario));
    if (ids.size !== docentes.length) {
      throw new BadRequestException(MENSAJE_DOCENTES_REPETIDOS);
    }
    if (docentes.filter((docente) => docente.responsable).length !== 1) {
      throw new BadRequestException(MENSAJE_UN_RESPONSABLE);
    }
  }
}
