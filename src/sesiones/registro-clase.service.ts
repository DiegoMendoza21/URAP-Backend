import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { ParametrosService } from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ESTADO_MATRICULA } from '../estudiantes/estados.js';
import type { Prisma } from '../generated/prisma/client.js';
import { fechaDeHoy, PARAMETRO_UMBRAL_ALERTA } from './alertas.js';
import { aTextoFecha } from './calendario.js';
import type {
  DetalleSesionDto,
  RegistrarSesionDto,
  TemaContenidoDto,
} from './dto/registro.dto.js';
import {
  aSesion,
  contextoDeAlerta,
  ESTADO_REGISTRADA,
  esDiligenciada,
  horasDelHorario,
  INCLUIR_SESION,
  type ProyectoConHorario,
  SESION_VIGENTE,
  SesionesService,
} from './sesiones.service.js';

/**
 * RF-20, precondición: las clases se registran cuando el proyecto docente está aprobado o en
 * ejecución (códigos de `estado_proyecto`, RF-17). Es la única línea que cambia si el programa
 * decide otra cosa.
 */
export const ESTADOS_QUE_PERMITEN_REGISTRO: readonly string[] = [
  'aprobado',
  'en_ejecucion',
];

export const MENSAJE_SESION_NO_EXISTE =
  'La sesión no existe o no es de este proyecto docente.';
export const MENSAJE_SOLO_QUIEN_REGISTRA =
  'Solo un docente asignado al proyecto o el administrador registran la clase.';
export const MENSAJE_PERIODO_CERRADO_REGISTRO =
  'El período académico está cerrado: ya no se registran clases.';
export const MENSAJE_PROYECTO_NO_APROBADO =
  'Las clases se registran cuando el proyecto docente está aprobado o en ejecución.';
export const MENSAJE_FECHA_FUTURA =
  'No se puede registrar una sesión de una fecha futura: regístrela el día de la clase o después.';
export const MENSAJE_SIN_CONTENIDO =
  'El proyecto docente todavía no tiene temas en su contenido programático (punto 6). Regístrelos para poder registrar clases.';
export const MENSAJE_TEMAS_INVALIDOS =
  'Los temas seleccionados deben ser del contenido programático de este proyecto.';
export const MENSAJE_AUSENTES_INVALIDOS =
  'Los estudiantes marcados deben estar matriculados en este curso.';
export const MENSAJE_CONFIRMAR_TODO_EL_GRUPO =
  'Marcó a todo el grupo como ausente. Confirme que ningún estudiante asistió a la clase.';

export function mensajeTipoSinTema(tipo: string | null): string {
  return (
    `Esta sesión está marcada como «${tipo ?? 'sin tipo'}» y no lleva temas. Si sí hubo clase, ` +
    'cambie primero su tipo (HU-08-06).'
  );
}

/** La sesión con lo que ya tiene registrado: temas, ausentes y quién la registró. */
const INCLUIR_REGISTRO = {
  ...INCLUIR_SESION,
  sesion_tema: { select: { id_contenido: true } },
  inasistencia: { select: { id_matricula: true } },
  usuario: { select: { nombres: true, apellidos: true } },
} as const satisfies Prisma.sesion_claseInclude;

type SesionRegistrada = Prisma.sesion_claseGetPayload<{
  include: typeof INCLUIR_REGISTRO;
}>;

interface ContenidoDelRegistro {
  temas: number[];
  ausentes: number[];
  observaciones: string | null;
}

/**
 * Registro de la clase desarrollada (RF-20, HU-08-04) con sus estudiantes ausentes (RF-22,
 * HU-09-02). Los dos se guardan juntos porque son la misma pantalla y la misma sesión: temas,
 * ausentes y observaciones quedan en una transacción.
 *
 * Alcance (matriz, «Registro de clases»): registra y corrige el docente asignado al proyecto o
 * el administrador; consultan los mismos que ven el proyecto. Los ausentes y las observaciones
 * son datos personales (Ley 1581): solo los ven quienes pueden registrar, como la lista de
 * matriculados (RF-22). Los demás ven los temas y el número de ausentes.
 */
@Injectable()
export class RegistroClaseService {
  private readonly logger = new Logger(RegistroClaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly parametros: ParametrosService,
  ) {}

  /** RF-20, p2 y p3: la sesión con la lista de temas y, para quien registra, la del curso. */
  async detalle(
    usuario: UsuarioSesion,
    idProyecto: number,
    idSesion: number,
  ): Promise<DetalleSesionDto> {
    const proyecto = await this.sesiones.proyectoVisible(usuario, idProyecto);
    const [sesion, puedeVerDatos, umbralDias] = await Promise.all([
      this.buscarSesion(proyecto.id, idSesion),
      this.sesiones.tienePermisoEdicion(usuario, proyecto),
      this.parametros.entero(PARAMETRO_UMBRAL_ALERTA),
    ]);
    const detalle = await this.construirDetalle(
      proyecto,
      sesion,
      puedeVerDatos,
      umbralDias,
    );
    if (detalle.asistencia?.listaCargada) {
      // Consulta de datos personales: queda en la auditoría (CLAUDE.md, «Auditoría»).
      await this.auditar(usuario.id, 'consultar_asistencia', sesion.id, null, {
        idProyecto: proyecto.id,
      });
    }
    return detalle;
  }

  /**
   * RF-20, p4 a p6, y RF-22, p4 a p6: guarda los temas, los ausentes y las observaciones, y
   * marca la sesión como diligenciada. Reemplaza el registro anterior: así se corrige.
   */
  async registrar(
    usuario: UsuarioSesion,
    idProyecto: number,
    idSesion: number,
    datos: RegistrarSesionDto,
  ): Promise<DetalleSesionDto> {
    const proyecto = await this.sesiones.proyectoVisible(usuario, idProyecto);
    if (!(await this.sesiones.tienePermisoEdicion(usuario, proyecto))) {
      throw new ForbiddenException(MENSAJE_SOLO_QUIEN_REGISTRA);
    }
    const motivoDelProyecto = motivoDelProyectoNoRegistrable(proyecto);
    if (motivoDelProyecto) {
      throw new ConflictException(motivoDelProyecto);
    }
    const hoy = fechaDeHoy();
    const ausentes = datos.ausentes ?? [];
    const observaciones = datos.observaciones?.trim() || null;

    const { anterior, nuevo, primeraVez } = await this.prisma.$transaction(
      async (tx) => {
        // Dos guardados a la vez de la misma sesión (dos pestañas, un doble toque) van de a uno.
        await tx.$queryRaw`SELECT id FROM sesion_clase WHERE id = ${idSesion} FOR UPDATE`;
        const sesion = await tx.sesion_clase.findFirst({
          where: {
            id: idSesion,
            id_proyecto_docente: proyecto.id,
            ...SESION_VIGENTE,
          },
          include: {
            tipo_sesion: true,
            sesion_tema: { select: { id_contenido: true } },
            inasistencia: { select: { id_matricula: true } },
          },
        });
        if (!sesion?.fecha) {
          throw new NotFoundException(MENSAJE_SESION_NO_EXISTE);
        }
        if (sesion.tipo_sesion?.exige_tema === false) {
          throw new ConflictException(
            mensajeTipoSinTema(sesion.tipo_sesion.nombre),
          );
        }
        // RF-20, excepción p6: el día de la clase ya se puede registrar; antes, no.
        if (aTextoFecha(sesion.fecha) > hoy) {
          throw new ConflictException(MENSAJE_FECHA_FUTURA);
        }

        const temasActuales = new Set(
          sesion.sesion_tema
            .map((tema) => tema.id_contenido)
            .filter((id): id is number => id !== null),
        );
        const ausentesActuales = new Set(
          sesion.inasistencia.map((fila) => fila.id_matricula),
        );

        // Temas: semanas del contenido programático de este proyecto que tienen tema. Una semana
        // que ya estaba registrada y luego se vació puede conservarse.
        const contenidos = await tx.contenido_programatico.findMany({
          where: {
            id: { in: datos.idsContenido },
            id_proyecto_docente: proyecto.id,
          },
          select: { id: true, tema: true },
        });
        if (
          contenidos.length !== datos.idsContenido.length ||
          contenidos.some(
            (contenido) =>
              contenido.tema === null && !temasActuales.has(contenido.id),
          )
        ) {
          throw new BadRequestException(MENSAJE_TEMAS_INVALIDOS);
        }

        // Ausentes: matriculados en este curso. Quien se retiró después de quedar marcado
        // puede seguir marcado en esta sesión.
        const [matriculas, totalMatriculados] = await Promise.all([
          ausentes.length > 0
            ? tx.matricula.findMany({
                where: {
                  id: { in: ausentes },
                  id_proyecto_docente: proyecto.id,
                },
                select: { id: true, estado: true },
              })
            : Promise.resolve([]),
          tx.matricula.count({
            where: {
              id_proyecto_docente: proyecto.id,
              estado: ESTADO_MATRICULA.matriculado,
            },
          }),
        ]);
        if (
          matriculas.length !== ausentes.length ||
          matriculas.some(
            (matricula) =>
              matricula.estado !== ESTADO_MATRICULA.matriculado &&
              !ausentesActuales.has(matricula.id),
          )
        ) {
          throw new BadRequestException(MENSAJE_AUSENTES_INVALIDOS);
        }
        // RF-22, excepción p6: todo el grupo ausente pide confirmación.
        const ausentesMatriculados = matriculas.filter(
          (matricula) => matricula.estado === ESTADO_MATRICULA.matriculado,
        ).length;
        if (
          totalMatriculados > 0 &&
          ausentesMatriculados === totalMatriculados &&
          !datos.confirmarTodoElGrupo
        ) {
          throw new ConflictException(MENSAJE_CONFIRMAR_TODO_EL_GRUPO);
        }

        const temas = [...new Set(datos.idsContenido)];
        // Los temas adicionales (HU-08-05) no tienen `id_contenido` y no se tocan aquí.
        await tx.sesion_tema.deleteMany({
          where: {
            id_sesion: sesion.id,
            id_contenido: { not: null, notIn: temas },
          },
        });
        const temasNuevos = temas.filter((id) => !temasActuales.has(id));
        if (temasNuevos.length > 0) {
          await tx.sesion_tema.createMany({
            data: temasNuevos.map((id) => ({
              id_sesion: sesion.id,
              id_contenido: id,
            })),
          });
        }
        await tx.inasistencia.deleteMany({
          where: { id_sesion: sesion.id, id_matricula: { notIn: ausentes } },
        });
        const ausentesNuevos = ausentes.filter(
          (id) => !ausentesActuales.has(id),
        );
        if (ausentesNuevos.length > 0) {
          await tx.inasistencia.createMany({
            data: ausentesNuevos.map((id) => ({
              id_sesion: sesion.id,
              id_matricula: id,
            })),
          });
        }
        await tx.sesion_clase.update({
          where: { id: sesion.id },
          data: {
            estado: ESTADO_REGISTRADA,
            // La primera vez queda quién y cuándo la registró; las correcciones van en la auditoría.
            fecha_registro: sesion.fecha_registro ?? new Date(),
            id_registrado_por: sesion.id_registrado_por ?? usuario.id,
            observaciones,
          },
        });
        return {
          primeraVez: !esDiligenciada(sesion),
          anterior: {
            temas: [...temasActuales],
            ausentes: [...ausentesActuales],
            observaciones: sesion.observaciones,
          } satisfies ContenidoDelRegistro,
          nuevo: {
            temas,
            ausentes,
            observaciones,
          } satisfies ContenidoDelRegistro,
        };
      },
      { timeout: 10_000 },
    );

    await this.auditar(
      usuario.id,
      primeraVez ? 'registrar' : 'actualizar',
      idSesion,
      anterior,
      nuevo,
    );
    const [sesion, umbralDias] = await Promise.all([
      this.buscarSesion(proyecto.id, idSesion),
      this.parametros.entero(PARAMETRO_UMBRAL_ALERTA),
    ]);
    return this.construirDetalle(proyecto, sesion, true, umbralDias);
  }

  private async buscarSesion(
    idProyecto: number,
    idSesion: number,
  ): Promise<SesionRegistrada> {
    const sesion = await this.prisma.sesion_clase.findFirst({
      where: {
        id: idSesion,
        id_proyecto_docente: idProyecto,
        ...SESION_VIGENTE,
      },
      include: INCLUIR_REGISTRO,
    });
    if (!sesion) {
      throw new NotFoundException(MENSAJE_SESION_NO_EXISTE);
    }
    return sesion;
  }

  private async construirDetalle(
    proyecto: ProyectoConHorario,
    sesion: SesionRegistrada,
    puedeVerDatos: boolean,
    umbralDias: number | null,
  ): Promise<DetalleSesionDto> {
    const seleccionados = new Set(
      sesion.sesion_tema
        .map((tema) => tema.id_contenido)
        .filter((id): id is number => id !== null),
    );
    const ausentes = new Set(
      sesion.inasistencia.map((fila) => fila.id_matricula),
    );
    const [contenidos, matriculas, conLista] = await Promise.all([
      this.prisma.contenido_programatico.findMany({
        where: {
          id_proyecto_docente: proyecto.id,
          OR: [{ tema: { not: null } }, { id: { in: [...seleccionados] } }],
        },
        select: { id: true, semana: true, tema: true },
        orderBy: [{ semana: 'asc' }, { id: 'asc' }],
      }),
      puedeVerDatos
        ? this.prisma.matricula.findMany({
            where: {
              id_proyecto_docente: proyecto.id,
              OR: [
                { estado: ESTADO_MATRICULA.matriculado },
                { id: { in: [...ausentes] } },
              ],
            },
            select: {
              id: true,
              estado: true,
              estudiante: { select: { nombres: true, apellidos: true } },
            },
            orderBy: [
              { estudiante: { apellidos: 'asc' } },
              { estudiante: { nombres: 'asc' } },
              { id: 'asc' },
            ],
          })
        : Promise.resolve([]),
      puedeVerDatos
        ? this.prisma.matricula.count({
            where: { id_proyecto_docente: proyecto.id },
          })
        : Promise.resolve(0),
    ]);

    const temas: TemaContenidoDto[] = contenidos.map((contenido) => ({
      idContenido: contenido.id,
      semana: contenido.semana ?? 0,
      tema: contenido.tema ?? `Semana ${contenido.semana ?? '?'} (sin tema)`,
      previsto: contenido.semana !== null && contenido.semana === sesion.semana,
      seleccionado: seleccionados.has(contenido.id),
    }));
    const contexto = contextoDeAlerta(proyecto.periodo_academico, umbralDias);
    const motivo = puedeVerDatos
      ? (motivoDelProyectoNoRegistrable(proyecto) ??
        motivoDeLaSesionNoRegistrable(sesion, contexto.hoy) ??
        (contenidos.some((contenido) => contenido.tema !== null)
          ? null
          : MENSAJE_SIN_CONTENIDO))
      : null;

    return {
      idProyectoDocente: proyecto.id,
      asignatura: proyecto.asignatura?.nombre ?? null,
      sesion: aSesion(
        sesion,
        horasDelHorario(proyecto.horario_curso),
        contexto,
      ),
      puedeRegistrar: puedeVerDatos && motivo === null,
      motivoNoRegistrable: motivo,
      temas,
      numeroAusentes: sesion._count.inasistencia,
      asistencia: puedeVerDatos
        ? {
            listaCargada: conLista > 0,
            totalMatriculados: matriculas.filter(
              (matricula) => matricula.estado === ESTADO_MATRICULA.matriculado,
            ).length,
            estudiantes: matriculas.map((matricula) => ({
              idMatricula: matricula.id,
              nombres: matricula.estudiante?.nombres ?? null,
              apellidos: matricula.estudiante?.apellidos ?? null,
              ausente: ausentes.has(matricula.id),
              retirado: matricula.estado !== ESTADO_MATRICULA.matriculado,
            })),
          }
        : null,
      observaciones: puedeVerDatos ? sesion.observaciones : null,
      registro: sesion.fecha_registro
        ? {
            fecha: sesion.fecha_registro.toISOString(),
            registradoPor: sesion.usuario
              ? [sesion.usuario.nombres, sesion.usuario.apellidos]
                  .filter(Boolean)
                  .join(' ') || null
              : null,
          }
        : null,
    };
  }

  /** RF-29. Un fallo al auditar no deshace la operación (CLAUDE.md, «Auditoría»). */
  private async auditar(
    idUsuario: number,
    accion: string,
    idSesion: number,
    anterior: ContenidoDelRegistro | null,
    nuevo: ContenidoDelRegistro | Prisma.InputJsonObject,
  ): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: {
          id_usuario: idUsuario,
          accion,
          tabla_afectada: 'sesion_clase',
          id_registro: idSesion,
          valor_anterior: (anterior ?? undefined) as
            Prisma.InputJsonValue | undefined,
          valor_nuevo: nuevo as unknown as Prisma.InputJsonValue,
          fecha: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar «${accion}» en la sesión ${idSesion}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

/** Precondiciones del proyecto: período abierto y proyecto aprobado o en ejecución (RF-20). */
function motivoDelProyectoNoRegistrable(
  proyecto: ProyectoConHorario,
): string | null {
  if (proyecto.periodo_academico?.cerrado) {
    return MENSAJE_PERIODO_CERRADO_REGISTRO;
  }
  if (
    !ESTADOS_QUE_PERMITEN_REGISTRO.includes(
      proyecto.estado_proyecto?.codigo ?? '',
    )
  ) {
    return MENSAJE_PROYECTO_NO_APROBADO;
  }
  return null;
}

/** La sesión: de un tipo que lleva temas (RF-21) y de hoy o de antes (RF-20, excepción p6). */
function motivoDeLaSesionNoRegistrable(
  sesion: SesionRegistrada,
  hoy: string,
): string | null {
  if (sesion.tipo_sesion?.exige_tema === false) {
    return mensajeTipoSinTema(sesion.tipo_sesion.nombre);
  }
  if (sesion.fecha && aTextoFecha(sesion.fecha) > hoy) {
    return MENSAJE_FECHA_FUTURA;
  }
  return null;
}
