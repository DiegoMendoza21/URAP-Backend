import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  NOTIFICACION,
  NotificacionesService,
} from '../notificaciones/notificaciones.service.js';
import { AlcanceService } from './alcance.service.js';
import {
  aDatosCompletitud,
  SELECCION_COMPLETITUD,
} from './diligenciamiento.service.js';
import type {
  AprobarProyectoDto,
  ConsultarPendientesRevisionDto,
  DevolverProyectoDto,
  EventoRevisionDto,
  MarcarObservacionDto,
  ObservacionDto,
  ObservacionesProyectoDto,
  PaginaPendientesRevisionDto,
  PersonaDto,
  SeccionIncompletaDto,
  TransicionProyectoDto,
  VerificacionEnvioDto,
  VerificacionRevisionDto,
} from './dto/revision.dto.js';
import {
  EdicionProyectoService,
  MENSAJE_SOLO_DOCENTES_ASIGNADOS,
  type ProyectoConAcceso,
} from './edicion-proyecto.service.js';
import { SECCIONES } from './entities/secciones.js';
import { aResumen, INCLUIR_RESUMEN } from './mapeo.js';

/** Códigos de `estado_proyecto` que mueve la revisión (RF-17; catálogo en `datos-iniciales`). */
export const ESTADO = {
  enDiligenciamiento: 'en_diligenciamiento',
  enviado: 'enviado',
  devuelto: 'devuelto',
  aprobado: 'aprobado',
} as const;

/** RF-17, precondición: desde dónde se envía a revisión. */
const ESTADOS_QUE_SE_ENVIAN: readonly string[] = [
  ESTADO.enDiligenciamiento,
  ESTADO.devuelto,
];

/** `revision_proyecto.tipo` y `.resultado` (DBML v2.4): las firmas del formato. */
export const TIPO_EVENTO = {
  elaboracion: 'elaboracion',
  revision: 'revision',
  aprobacion: 'aprobacion',
} as const;
export const RESULTADO_EVENTO = {
  enviado: 'enviado',
  devuelto: 'devuelto',
  aprobado: 'aprobado',
} as const;

export const MENSAJE_SOLO_RESPONSABLE =
  'Solo el docente responsable del proyecto puede enviarlo a revisión.';
export const MENSAJE_PERIODO_CERRADO_ENVIO =
  'El período académico del proyecto está cerrado: ya no se puede enviar a revisión.';
export const MENSAJE_SECCIONES_INCOMPLETAS =
  'El proyecto todavía tiene secciones incompletas. Complételas para enviarlo a revisión.';
export const MENSAJE_FUERA_DE_ALCANCE =
  'Usted no revisa proyectos docentes de este programa.';
/**
 * RF-18 · Separación de funciones (control interno, Ley 87 de 1993): quien elabora el proyecto
 * no lo aprueba. Se aplica mientras `revision_bloquear_autoaprobacion` esté encendido.
 */
export const MENSAJE_PROYECTO_PROPIO =
  'No puede revisar un proyecto docente en el que es docente. Debe revisarlo otra persona del Departamento.';
/** El mismo caso, como aviso de la bandeja y de la pantalla de revisión. */
export const MOTIVO_PROYECTO_PROPIO =
  'Usted es docente de este proyecto: debe revisarlo otra persona del Departamento.';
export const MENSAJE_OBSERVACION_NO_EXISTE =
  'La observación no existe o no pertenece a la última devolución del proyecto.';
export const MENSAJE_OBSERVACIONES_SOLO_DEVUELTO =
  'Las observaciones solo se marcan mientras el proyecto está devuelto con observaciones.';

export function mensajeNoEnviable(nombreEstado: string): string {
  return `El proyecto está «${nombreEstado}»: solo se envía a revisión en diligenciamiento o devuelto con observaciones.`;
}

export function mensajeNoRevisable(nombreEstado: string): string {
  return `El proyecto está «${nombreEstado}»: solo se aprueban o devuelven los proyectos enviados a revisión.`;
}

type Cliente = PrismaService | Prisma.TransactionClient;

/** Lo que la revisión lee del proyecto para decidir y para notificar. */
const INCLUIR_REVISION = {
  estado_proyecto: true,
  periodo_academico: { select: { codigo: true, cerrado: true } },
  asignatura: {
    select: { nombre: true, plan_estudio: { select: { id_programa: true } } },
  },
  proyecto_docente_docente: {
    select: {
      id_usuario: true,
      responsable: true,
      usuario: { select: { activo: true, nombres: true, apellidos: true } },
    },
  },
} satisfies Prisma.proyecto_docenteInclude;

type ProyectoEnRevision = Prisma.proyecto_docenteGetPayload<{
  include: typeof INCLUIR_REVISION;
}>;

const INCLUIR_EVENTO = {
  usuario: { select: { id: true, nombres: true, apellidos: true } },
  estado_proyecto_revision_proyecto_id_estado_anteriorToestado_proyecto: true,
  estado_proyecto_revision_proyecto_id_estado_nuevoToestado_proyecto: true,
  _count: { select: { observacion_revision: true } },
} satisfies Prisma.revision_proyectoInclude;

const POSICION_SECCION = new Map(
  SECCIONES.map((seccion, indice) => [seccion.clave, indice]),
);

function aEstado(
  estado: { codigo: string | null; nombre: string | null } | null,
): { codigo: string; nombre: string } | null {
  return estado
    ? { codigo: estado.codigo ?? '', nombre: estado.nombre ?? '' }
    : null;
}

function aPersona(
  usuario: {
    id: number;
    nombres: string | null;
    apellidos: string | null;
  } | null,
): PersonaDto | null {
  return usuario
    ? { id: usuario.id, nombres: usuario.nombres, apellidos: usuario.apellidos }
    : null;
}

function aObservacion(fila: {
  id: number;
  seccion: string | null;
  observacion: string | null;
  resuelta: boolean | null;
}): ObservacionDto {
  const seccion = SECCIONES.find((s) => s.clave === fila.seccion);
  return {
    id: fila.id,
    seccion: fila.seccion ?? '',
    numeroSeccion: seccion?.numero ?? null,
    tituloSeccion: seccion?.titulo ?? null,
    observacion: fila.observacion ?? '',
    resuelta: fila.resuelta === true,
  };
}

/** «Finanzas a corto plazo, grupo A (2026-2)»: cómo se nombra el proyecto en los avisos. */
function nombreProyecto(proyecto: ProyectoEnRevision): string {
  const asignatura = proyecto.asignatura?.nombre ?? 'sin asignatura';
  const grupo = proyecto.grupo ? `, grupo ${proyecto.grupo}` : '';
  const periodo = proyecto.periodo_academico?.codigo
    ? ` (${proyecto.periodo_academico.codigo})`
    : '';
  return `${asignatura}${grupo}${periodo}`;
}

/**
 * Si el usuario figura entre los docentes del proyecto (`proyecto_docente_docente`). Cuentan
 * todos, no solo el responsable: todos lo elaboran.
 */
function esDocenteDelProyecto(
  usuario: UsuarioSesion,
  docentes: readonly { id_usuario: number }[],
): boolean {
  return docentes.some((docente) => docente.id_usuario === usuario.id);
}

/**
 * Revisión y aprobación del proyecto docente (EP-07): el docente responsable lo envía a
 * revisión (RF-17) y quien tiene `proyectos.aprobar` en el programa lo aprueba o lo devuelve
 * con observaciones por sección (RF-18). Cada paso queda en `revision_proyecto`, que sustituye
 * las firmas «elaboró», «revisó» y «aprobó» del formato (HU-07-06).
 *
 * Las transiciones bloquean la fila del proyecto, igual que `EdicionProyectoService.editar`:
 * un guardado de sección y un envío simultáneos se atienden de a uno, y dos revisores no
 * pueden aprobar y devolver el mismo proyecto a la vez.
 *
 * Quien es docente del proyecto no lo aprueba ni lo devuelve mientras el parámetro
 * `revision_bloquear_autoaprobacion` esté encendido (separación de funciones). Si el programa
 * decide otra cosa, el administrador lo apaga sin tocar código.
 */
@Injectable()
export class RevisionService {
  private readonly logger = new Logger(RevisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
    private readonly alcance: AlcanceService,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
    private readonly parametros: ParametrosService,
  ) {}

  // ——— RF-17 · Envío a revisión (HU-07-01) ———

  /** RF-17, p2 y p3: el resumen de la verificación, antes de confirmar el envío. */
  async verificarEnvio(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<VerificacionEnvioDto> {
    await this.edicion.consultable(usuario, id);
    const proyecto = await this.cargar(this.prisma, id);
    const incompletas = await this.seccionesIncompletas(this.prisma, id);
    const motivo = this.motivoNoEnviable(usuario, proyecto, incompletas);
    return {
      idProyecto: id,
      estado: aEstado(proyecto.estado_proyecto),
      puedeEnviar: motivo === null,
      motivo,
      seccionesIncompletas: incompletas,
      observacionesSinResolver:
        proyecto.estado_proyecto?.codigo === ESTADO.devuelto
          ? await this.contarSinResolver(id)
          : 0,
    };
  }

  /**
   * RF-17, p4 y p5: cambia el estado a «Enviado a revisión», registra la fecha y el usuario,
   * y notifica a quienes revisan en el programa. Las observaciones sin resolver no impiden el
   * envío (HU-07-05): la verificación ya las advirtió.
   */
  async enviar(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<TransicionProyectoDto> {
    await this.edicion.consultable(usuario, id);
    const idEnviado = await this.idEstado(ESTADO.enviado);

    const { proyecto, ahora } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM proyecto_docente WHERE id = ${id} FOR UPDATE`;
      const actual = await this.cargar(tx, id);
      const incompletas = await this.seccionesIncompletas(tx, id);
      const motivo = this.motivoNoEnviable(usuario, actual, incompletas);
      if (motivo === MENSAJE_SOLO_RESPONSABLE) {
        throw new ForbiddenException(motivo);
      }
      if (motivo === MENSAJE_SECCIONES_INCOMPLETAS) {
        // RF-17, excepción de p2: impide el envío y lista los pendientes.
        throw new ConflictException({
          mensaje: motivo,
          detalles: incompletas.map(
            (seccion) =>
              `Punto ${seccion.numero} · ${seccion.titulo}: ${seccion.pendientes.join(' ')}`,
          ),
        });
      }
      if (motivo) {
        throw new ConflictException(motivo);
      }
      const momento = new Date();
      await tx.proyecto_docente.update({
        where: { id },
        data: { id_estado: idEnviado, fecha_envio: momento },
      });
      await tx.revision_proyecto.create({
        data: {
          id_proyecto_docente: id,
          id_usuario: usuario.id,
          tipo: TIPO_EVENTO.elaboracion,
          resultado: RESULTADO_EVENTO.enviado,
          id_estado_anterior: actual.id_estado,
          id_estado_nuevo: idEnviado,
          fecha: momento,
        },
      });
      return { proyecto: actual, ahora: momento };
    });

    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'proyecto_docente',
      idRegistro: id,
      valorAnterior: { estado: proyecto.estado_proyecto?.codigo ?? null },
      valorNuevo: { estado: ESTADO.enviado, fechaEnvio: ahora.toISOString() },
    });
    const revisores = await this.revisoresDelPrograma(proyecto);
    await this.notificaciones.notificar({
      tipo: NOTIFICACION.proyectoEnviado,
      destinatarios: revisores.filter((idUsuario) => idUsuario !== usuario.id),
      titulo: 'Proyecto docente enviado a revisión',
      mensaje: `El proyecto docente de ${nombreProyecto(proyecto)} fue enviado a revisión y espera su revisión.`,
      entidad: 'proyecto_docente',
      idEntidad: id,
      urlDestino: `/proyectos-docentes/${id}/revision`,
    });
    return this.transicion(id, ahora);
  }

  // ——— RF-18 · Revisión (HU-07-02 a HU-07-04) ———

  /**
   * HU-07-02: proyectos «Enviado a revisión» de los programas donde el usuario tiene
   * `proyectos.aprobar`, los que llevan más tiempo esperando primero. Los suyos también
   * aparecen, con `puedeRevisar` en falso y el motivo: así sabe que esperan a otra persona.
   */
  async pendientes(
    usuario: UsuarioSesion,
    consulta: ConsultarPendientesRevisionDto,
  ): Promise<PaginaPendientesRevisionDto> {
    const { pagina, tamano } = consulta;
    const { global, programas } = await this.alcance.alcanceConPermiso(
      usuario.id,
      'proyectos',
      'aprobar',
    );
    if (!global && programas.length === 0) {
      return { elementos: [], pagina, tamano, total: 0 };
    }
    const condiciones: Prisma.proyecto_docenteWhereInput[] = [
      { estado_proyecto: { is: { codigo: ESTADO.enviado } } },
    ];
    if (!global) {
      condiciones.push({
        asignatura: {
          is: { plan_estudio: { id_programa: { in: programas } } },
        },
      });
    }
    if (consulta.idPrograma) {
      condiciones.push({
        asignatura: {
          is: { plan_estudio: { id_programa: consulta.idPrograma } },
        },
      });
    }
    if (consulta.idAsignatura) {
      condiciones.push({ id_asignatura: consulta.idAsignatura });
    }
    if (consulta.idDocente) {
      condiciones.push({
        proyecto_docente_docente: { some: { id_usuario: consulta.idDocente } },
      });
    }
    const where = { AND: condiciones };
    const [total, filas] = await Promise.all([
      this.prisma.proyecto_docente.count({ where }),
      this.prisma.proyecto_docente.findMany({
        where,
        include: INCLUIR_RESUMEN,
        orderBy: [{ fecha_envio: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    // Como en la aprobación, el parámetro se lee solo si en la página hay alguno suyo.
    const bloquearPropios =
      filas.some((fila) =>
        esDocenteDelProyecto(usuario, fila.proyecto_docente_docente),
      ) && (await this.bloquearProyectosPropios());
    return {
      elementos: filas.map((fila) => {
        const propio =
          bloquearPropios &&
          esDocenteDelProyecto(usuario, fila.proyecto_docente_docente);
        return {
          ...aResumen(fila),
          fechaEnvio: fila.fecha_envio?.toISOString() ?? null,
          puedeRevisar: !propio,
          motivo: propio ? MOTIVO_PROYECTO_PROPIO : null,
        };
      }),
      pagina,
      tamano,
      total,
    };
  }

  /**
   * RF-18: si el usuario puede aprobar o devolver el proyecto ahora y, si no, por qué. La
   * pantalla de revisión lo consulta para decidir si muestra las decisiones. El alcance se
   * comprueba como en `aprobar` y `devolver` (404 si no ve el proyecto, 403 si no lo aprueba en
   * su programa), así que no revela el estado de un proyecto ajeno. Después, en el mismo orden
   * que esas acciones, la separación de funciones y el estado: `puedeRevisar` es verdadero solo
   * si los dos lo permiten, y `motivo` dice cuál no.
   */
  async verificarRevision(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<VerificacionRevisionDto> {
    const visible = await this.exigirAlcanceRevision(usuario, id);
    const estado = aEstado(visible.estado_proyecto);
    const motivo = (await this.esProyectoPropioBloqueado(usuario, visible))
      ? MOTIVO_PROYECTO_PROPIO
      : estado?.codigo === ESTADO.enviado
        ? null
        : mensajeNoRevisable(estado?.nombre ?? 'sin estado');
    return { idProyecto: id, estado, puedeRevisar: motivo === null, motivo };
  }

  /** HU-07-03: aprueba el proyecto, lo que habilita el registro de clases (RF-20). */
  async aprobar(
    usuario: UsuarioSesion,
    id: number,
    { observacionGeneral }: AprobarProyectoDto,
  ): Promise<TransicionProyectoDto> {
    await this.exigirRevisable(usuario, id);
    const idAprobado = await this.idEstado(ESTADO.aprobado);

    const { proyecto, ahora } = await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquearEnviado(tx, id);
      const momento = new Date();
      await tx.proyecto_docente.update({
        where: { id },
        data: { id_estado: idAprobado, fecha_aprobacion: momento },
      });
      await tx.revision_proyecto.create({
        data: {
          id_proyecto_docente: id,
          id_usuario: usuario.id,
          tipo: TIPO_EVENTO.aprobacion,
          resultado: RESULTADO_EVENTO.aprobado,
          id_estado_anterior: actual.id_estado,
          id_estado_nuevo: idAprobado,
          observacion_general: observacionGeneral ?? null,
          fecha: momento,
        },
      });
      return { proyecto: actual, ahora: momento };
    });

    await this.auditoria.registrar({
      accion: 'aprobar',
      tablaAfectada: 'proyecto_docente',
      idRegistro: id,
      valorAnterior: { estado: ESTADO.enviado },
      valorNuevo: {
        estado: ESTADO.aprobado,
        fechaAprobacion: ahora.toISOString(),
      },
    });
    await this.avisarDocentes(
      proyecto,
      {
        tipo: NOTIFICACION.proyectoAprobado,
        titulo: 'Proyecto docente aprobado',
        mensaje: `El departamento académico aprobó el proyecto docente de ${nombreProyecto(proyecto)}. Ya puede registrar sus clases.`,
        urlDestino: `/proyectos-docentes/${id}`,
      },
      'aprobado',
    );
    return this.transicion(id, ahora);
  }

  /**
   * HU-07-04: devuelve el proyecto con observaciones por sección. Vuelve a «Devuelto con
   * observaciones», que permite editar (`estado_proyecto.permite_edicion`).
   */
  async devolver(
    usuario: UsuarioSesion,
    id: number,
    { observacionGeneral, observaciones }: DevolverProyectoDto,
  ): Promise<TransicionProyectoDto> {
    await this.exigirRevisable(usuario, id);
    const idDevuelto = await this.idEstado(ESTADO.devuelto);

    const { proyecto, ahora } = await this.prisma.$transaction(async (tx) => {
      const actual = await this.bloquearEnviado(tx, id);
      const momento = new Date();
      await tx.proyecto_docente.update({
        where: { id },
        data: { id_estado: idDevuelto },
      });
      await tx.revision_proyecto.create({
        data: {
          id_proyecto_docente: id,
          id_usuario: usuario.id,
          tipo: TIPO_EVENTO.revision,
          resultado: RESULTADO_EVENTO.devuelto,
          id_estado_anterior: actual.id_estado,
          id_estado_nuevo: idDevuelto,
          observacion_general: observacionGeneral ?? null,
          fecha: momento,
          observacion_revision: {
            create: observaciones.map(({ seccion, observacion }) => ({
              seccion,
              observacion,
              resuelta: false,
            })),
          },
        },
      });
      return { proyecto: actual, ahora: momento };
    });

    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'proyecto_docente',
      idRegistro: id,
      valorAnterior: { estado: ESTADO.enviado },
      valorNuevo: {
        estado: ESTADO.devuelto,
        observaciones: observaciones.length,
        secciones: [...new Set(observaciones.map((o) => o.seccion))],
      },
    });
    await this.avisarDocentes(
      proyecto,
      {
        tipo: NOTIFICACION.proyectoDevuelto,
        titulo: 'Proyecto docente devuelto con observaciones',
        mensaje: `El departamento académico devolvió el proyecto docente de ${nombreProyecto(proyecto)} con ${observaciones.length === 1 ? 'una observación' : `${observaciones.length} observaciones`}. Revíselas en cada sección y vuelva a enviarlo.`,
        urlDestino: `/proyectos-docentes/${id}/diligenciar`,
      },
      'devuelto con observaciones',
    );
    return this.transicion(id, ahora);
  }

  // ——— HU-07-05 · Observaciones de la devolución ———

  /** La última devolución con sus observaciones, en el orden del formato. */
  async observaciones(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<ObservacionesProyectoDto> {
    const proyecto = await this.edicion.consultable(usuario, id);
    const devolucion = await this.ultimaDevolucion(this.prisma, id);
    if (!devolucion) {
      return { vigentes: false, devolucion: null };
    }
    const observaciones = devolucion.observacion_revision
      .map(aObservacion)
      .sort(
        (a, b) =>
          (POSICION_SECCION.get(a.seccion) ?? 99) -
            (POSICION_SECCION.get(b.seccion) ?? 99) || a.id - b.id,
      );
    return {
      vigentes: proyecto.estado_proyecto?.codigo === ESTADO.devuelto,
      devolucion: {
        idRevision: devolucion.id,
        fecha: devolucion.fecha?.toISOString() ?? null,
        revisor: aPersona(devolucion.usuario),
        observacionGeneral: devolucion.observacion_general,
        observaciones,
        sinResolver: observaciones.filter((o) => !o.resuelta).length,
      },
    };
  }

  /**
   * HU-07-05: un docente asignado marca una observación como resuelta (o la desmarca),
   * mientras el proyecto está devuelto. Solo las de la última devolución.
   */
  async marcarObservacion(
    usuario: UsuarioSesion,
    id: number,
    idObservacion: number,
    { resuelta }: MarcarObservacionDto,
  ): Promise<ObservacionDto> {
    const visible = await this.edicion.consultable(usuario, id);
    if (!this.edicion.esDocenteAsignado(usuario, visible)) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTES_ASIGNADOS);
    }

    const { anterior, actualizada } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM proyecto_docente WHERE id = ${id} FOR UPDATE`;
        const proyecto = await tx.proyecto_docente.findUniqueOrThrow({
          where: { id },
          select: { estado_proyecto: { select: { codigo: true } } },
        });
        if (proyecto.estado_proyecto?.codigo !== ESTADO.devuelto) {
          throw new ConflictException(MENSAJE_OBSERVACIONES_SOLO_DEVUELTO);
        }
        const devolucion = await this.ultimaDevolucion(tx, id);
        const observacion = devolucion?.observacion_revision.find(
          (fila) => fila.id === idObservacion,
        );
        if (!observacion) {
          throw new NotFoundException(MENSAJE_OBSERVACION_NO_EXISTE);
        }
        const nueva =
          (observacion.resuelta === true) === resuelta
            ? observacion
            : await tx.observacion_revision.update({
                where: { id: idObservacion },
                data: { resuelta },
              });
        return { anterior: observacion, actualizada: nueva };
      },
    );

    // Solo si cambió: marcar dos veces lo mismo no deja rastro en la auditoría.
    if ((anterior.resuelta === true) !== resuelta) {
      await this.auditoria.registrar({
        accion: 'actualizar',
        tablaAfectada: 'observacion_revision',
        idRegistro: idObservacion,
        valorAnterior: { resuelta: anterior.resuelta === true },
        valorNuevo: { resuelta },
      });
    }
    return aObservacion(actualizada);
  }

  // ——— HU-07-06 · Historial de revisiones ———

  /**
   * Cada envío, devolución y aprobación, del más antiguo al más reciente. Es de solo lectura:
   * ningún endpoint modifica `revision_proyecto`. No se pagina: por proyecto son unos pocos
   * eventos por período.
   */
  async historial(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<EventoRevisionDto[]> {
    await this.edicion.consultable(usuario, id);
    const eventos = await this.prisma.revision_proyecto.findMany({
      where: { id_proyecto_docente: id },
      include: INCLUIR_EVENTO,
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
    return eventos.map((evento) => ({
      id: evento.id,
      tipo: evento.tipo ?? '',
      resultado: evento.resultado ?? '',
      fecha: evento.fecha?.toISOString() ?? null,
      usuario: aPersona(evento.usuario),
      estadoAnterior: aEstado(
        evento.estado_proyecto_revision_proyecto_id_estado_anteriorToestado_proyecto,
      ),
      estadoNuevo: aEstado(
        evento.estado_proyecto_revision_proyecto_id_estado_nuevoToestado_proyecto,
      ),
      observacionGeneral: evento.observacion_general,
      observaciones: evento._count.observacion_revision,
    }));
  }

  // ——— Apoyo ———

  private cargar(cliente: Cliente, id: number): Promise<ProyectoEnRevision> {
    return cliente.proyecto_docente.findUniqueOrThrow({
      where: { id },
      include: INCLUIR_REVISION,
    });
  }

  /** RF-17, p2: secciones obligatorias con pendientes, con la misma regla del resumen. */
  private async seccionesIncompletas(
    cliente: Cliente,
    id: number,
  ): Promise<SeccionIncompletaDto[]> {
    const proyecto = await cliente.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: SELECCION_COMPLETITUD,
    });
    const datos = aDatosCompletitud(proyecto);
    return SECCIONES.map((seccion) => ({
      numero: seccion.numero,
      clave: seccion.clave,
      titulo: seccion.titulo,
      pendientes: seccion.pendientes(datos),
    })).filter((seccion) => seccion.pendientes.length > 0);
  }

  /** Por qué el usuario no puede enviar ahora, o nulo si puede. El orden importa: es el aviso. */
  private motivoNoEnviable(
    usuario: UsuarioSesion,
    proyecto: ProyectoEnRevision,
    incompletas: SeccionIncompletaDto[],
  ): string | null {
    const esResponsable =
      usuario.roles.includes(ROL.docente) &&
      proyecto.proyecto_docente_docente.some(
        (asignacion) =>
          asignacion.id_usuario === usuario.id &&
          asignacion.responsable === true,
      );
    if (!esResponsable) {
      return MENSAJE_SOLO_RESPONSABLE;
    }
    const codigo = proyecto.estado_proyecto?.codigo ?? '';
    if (!ESTADOS_QUE_SE_ENVIAN.includes(codigo)) {
      return mensajeNoEnviable(
        proyecto.estado_proyecto?.nombre ?? 'sin estado',
      );
    }
    // RF-17, excepción de p4.
    if (proyecto.periodo_academico?.cerrado === true) {
      return MENSAJE_PERIODO_CERRADO_ENVIO;
    }
    if (incompletas.length > 0) {
      return MENSAJE_SECCIONES_INCOMPLETAS;
    }
    return null;
  }

  /**
   * Quien aprueba o devuelve: tiene alcance sobre el proyecto y no es docente de él mientras la
   * separación de funciones esté encendida (si lo es, 403).
   */
  private async exigirRevisable(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<void> {
    const visible = await this.exigirAlcanceRevision(usuario, id);
    if (await this.esProyectoPropioBloqueado(usuario, visible)) {
      throw new ForbiddenException(MENSAJE_PROYECTO_PROPIO);
    }
  }

  /**
   * Alcance de quien revisa: ve el proyecto (si no, 404 sin revelar que existe) y tiene
   * `proyectos.aprobar` en su programa (si no, 403). El guard ya exigió el permiso; aquí se
   * comprueba el alcance.
   */
  private async exigirAlcanceRevision(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<ProyectoConAcceso> {
    const visible = await this.edicion.consultable(usuario, id);
    const proyecto = await this.prisma.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: {
        asignatura: {
          select: { plan_estudio: { select: { id_programa: true } } },
        },
      },
    });
    const { global, programas } = await this.alcance.alcanceConPermiso(
      usuario.id,
      'proyectos',
      'aprobar',
    );
    const idPrograma = proyecto.asignatura?.plan_estudio.id_programa ?? null;
    if (!global && (idPrograma === null || !programas.includes(idPrograma))) {
      throw new ForbiddenException(MENSAJE_FUERA_DE_ALCANCE);
    }
    return visible;
  }

  /**
   * RF-18 · Separación de funciones: es docente del proyecto y el parámetro está encendido. El
   * parámetro se lee solo si es docente: casi nunca revisa un docente del proyecto.
   */
  private async esProyectoPropioBloqueado(
    usuario: UsuarioSesion,
    proyecto: ProyectoConAcceso,
  ): Promise<boolean> {
    return (
      esDocenteDelProyecto(usuario, proyecto.proyecto_docente_docente) &&
      (await this.bloquearProyectosPropios())
    );
  }

  /**
   * RF-18 · Separación de funciones: si quien es docente del proyecto queda impedido de
   * revisarlo. Si el parámetro falta o tiene un valor inválido, se impide: es una regla de
   * control interno y ante la duda se aplica. El error queda en el registro técnico.
   */
  private bloquearProyectosPropios(): Promise<boolean> {
    return this.parametros.leerSiNo(
      PARAMETRO.revisionBloquearAutoaprobacion,
      true,
    );
  }

  /** Bloquea la fila y exige el estado «Enviado a revisión» (RF-18, precondición). */
  private async bloquearEnviado(
    tx: Prisma.TransactionClient,
    id: number,
  ): Promise<ProyectoEnRevision> {
    await tx.$queryRaw`SELECT id FROM proyecto_docente WHERE id = ${id} FOR UPDATE`;
    const actual = await this.cargar(tx, id);
    if (actual.estado_proyecto?.codigo !== ESTADO.enviado) {
      throw new ConflictException(
        mensajeNoRevisable(actual.estado_proyecto?.nombre ?? 'sin estado'),
      );
    }
    return actual;
  }

  private ultimaDevolucion(cliente: Cliente, id: number) {
    return cliente.revision_proyecto.findFirst({
      where: {
        id_proyecto_docente: id,
        resultado: RESULTADO_EVENTO.devuelto,
      },
      include: {
        usuario: { select: { id: true, nombres: true, apellidos: true } },
        observacion_revision: true,
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    });
  }

  private async contarSinResolver(id: number): Promise<number> {
    const devolucion = await this.ultimaDevolucion(this.prisma, id);
    return (
      devolucion?.observacion_revision.filter((o) => o.resuelta !== true)
        .length ?? 0
    );
  }

  /** Quienes revisan proyectos del programa: tienen `proyectos.aprobar` allí. */
  private revisoresDelPrograma(
    proyecto: ProyectoEnRevision,
  ): Promise<number[]> {
    return this.notificaciones.usuariosConPermiso(
      'proyectos',
      'aprobar',
      proyecto.asignatura?.plan_estudio.id_programa ?? null,
    );
  }

  /**
   * Avisa a los docentes activos del proyecto. RF-18, excepción de p5: si el docente
   * responsable está inactivo, avisa además a quienes revisan en el programa, para que
   * asignen a otro.
   */
  private async avisarDocentes(
    proyecto: ProyectoEnRevision,
    aviso: {
      tipo: string;
      titulo: string;
      mensaje: string;
      urlDestino: string;
    },
    /** Qué le pasó al proyecto, para el aviso a los revisores: «aprobado», «devuelto…». */
    resultado: string,
  ): Promise<void> {
    const docentes = proyecto.proyecto_docente_docente;
    await this.notificaciones.notificar({
      ...aviso,
      destinatarios: docentes
        .filter((docente) => docente.usuario?.activo === true)
        .map((docente) => docente.id_usuario),
      entidad: 'proyecto_docente',
      idEntidad: proyecto.id,
    });
    const responsable = docentes.find(
      (docente) => docente.responsable === true,
    );
    if (responsable && responsable.usuario?.activo !== true) {
      const nombre = [
        responsable.usuario?.nombres,
        responsable.usuario?.apellidos,
      ]
        .filter(Boolean)
        .join(' ');
      await this.notificaciones.notificar({
        tipo: aviso.tipo,
        destinatarios: await this.revisoresDelPrograma(proyecto),
        titulo: `${aviso.titulo}: el docente responsable está inactivo`,
        mensaje: `El proyecto docente de ${nombreProyecto(proyecto)} quedó ${resultado}, pero el docente responsable${nombre ? ` (${nombre})` : ''} está inactivo y no recibirá el aviso. Asigne otro docente responsable al proyecto.`,
        entidad: 'proyecto_docente',
        idEntidad: proyecto.id,
        urlDestino: `/proyectos-docentes/${proyecto.id}`,
      });
    }
  }

  private async idEstado(codigo: string): Promise<number> {
    const estado = await this.prisma.estado_proyecto.findUnique({
      where: { codigo },
      select: { id: true },
    });
    if (!estado) {
      // Falta un catálogo base: es un problema de instalación, no del usuario.
      this.logger.error(
        `No existe el estado de proyecto «${codigo}». Corra npm run db:sembrar.`,
      );
      throw new InternalServerErrorException();
    }
    return estado.id;
  }

  private async transicion(
    id: number,
    fecha: Date,
  ): Promise<TransicionProyectoDto> {
    const proyecto = await this.prisma.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: { estado_proyecto: true },
    });
    return {
      idProyecto: id,
      estado: aEstado(proyecto.estado_proyecto) ?? { codigo: '', nombre: '' },
      fecha: fecha.toISOString(),
    };
  }
}
