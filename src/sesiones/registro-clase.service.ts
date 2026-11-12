import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditoriaService,
  type EventoAuditoria,
  VALOR_OMITIDO,
} from '../auditoria/auditoria.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { ParametrosService } from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ESTADO_MATRICULA } from '../estudiantes/estados.js';
import type { Prisma } from '../generated/prisma/client.js';
import { soloCambios } from '../proyectos-docentes/edicion-proyecto.service.js';
import {
  fechaDeHoy,
  PARAMETRO_UMBRAL_ALERTA,
  RANGO_UMBRAL_ALERTA,
} from './alertas.js';
import { aTextoFecha } from './calendario.js';
import {
  type DetalleSesionDto,
  MENSAJE_SIN_TEMAS,
  MENSAJE_TEMA_ADICIONAL_VACIO,
  type RegistrarSesionDto,
  type TemaContenidoDto,
} from './dto/registro.dto.js';
import {
  aSesion,
  contextoDeAlerta,
  ESTADO_REGISTRADA,
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
/**
 * RF-20, precondición (decisión de la coordinación, opción A): la regla se aplica como está
 * escrita. Si la aprobación (RF-18) no está integrada para la demo, se relaja cambiando
 * `ESTADOS_QUE_PERMITEN_REGISTRO`.
 */
export const MENSAJE_PROYECTO_NO_APROBADO =
  'Podrá registrar clases cuando el Departamento apruebe el proyecto docente.';
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

export function mensajeTemaAdicionalRepetido(tema: string): string {
  return `«${tema}» está escrito dos veces entre los temas no planeados de esta clase.`;
}

export function mensajeTemaAdicionalPlaneado(tema: string): string {
  return `«${tema}» ya está en el contenido programático: selecciónelo en la lista de temas en vez de escribirlo como no planeado.`;
}

/** Para comparar temas como los lee una persona: sin mayúsculas, tildes ni espacios de más. */
function huellaTema(texto: string): string {
  return (
    texto
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('es-CO')
      .normalize('NFD')
      // Las tildes y la diéresis; la eñe se conserva: «caña» y «cana» son temas distintos.
      .replace(/[́̈]/g, '')
      .normalize('NFC')
  );
}

/**
 * HU-08-05: los temas no planeados de una clase, ya recortados por el DTO. No se repiten entre
 * ellos ni repiten un tema del contenido programático del proyecto, que se selecciona de la
 * lista (RF-20, p4). Si no cumplen, responde 400 con el tema que falla.
 */
export function validarTemasAdicionales(
  adicionales: readonly string[],
  temasPlaneados: readonly (string | null)[],
): string[] {
  const planeados = new Set(
    temasPlaneados
      .filter((tema): tema is string => tema !== null && tema.trim() !== '')
      .map(huellaTema),
  );
  const vistos = new Set<string>();
  for (const tema of adicionales) {
    const huella = huellaTema(tema);
    if (huella === '') {
      throw new BadRequestException(MENSAJE_TEMA_ADICIONAL_VACIO);
    }
    if (vistos.has(huella)) {
      throw new BadRequestException(mensajeTemaAdicionalRepetido(tema));
    }
    if (planeados.has(huella)) {
      throw new BadRequestException(mensajeTemaAdicionalPlaneado(tema));
    }
    vistos.add(huella);
  }
  return [...adicionales];
}

export function mensajeTipoSinTema(tipo: string | null): string {
  return (
    `Esta sesión está marcada como «${tipo ?? 'sin tipo'}» y no lleva temas. Si sí hubo clase, ` +
    'cambie primero su tipo (HU-08-06).'
  );
}

/** La sesión con lo que ya tiene registrado: temas, ausentes y quién la registró. */
const INCLUIR_REGISTRO = {
  ...INCLUIR_SESION,
  sesion_tema: {
    select: { id_contenido: true, tema_adicional: true },
    orderBy: { id: 'asc' },
  },
  inasistencia: { select: { id_matricula: true } },
  usuario: { select: { nombres: true, apellidos: true } },
} as const satisfies Prisma.sesion_claseInclude;

type SesionRegistrada = Prisma.sesion_claseGetPayload<{
  include: typeof INCLUIR_REGISTRO;
}>;

/** Lo que tiene registrado la sesión, antes o después de guardar. */
export interface ContenidoDelRegistro {
  estado: string | null;
  temas: number[];
  /** Temas no planeados (HU-08-05), en el orden en que se escribieron. */
  temasAdicionales: string[];
  ausentes: number[];
  observaciones: string | null;
}

/**
 * Tablas con que se audita el registro (RF-29). La consulta de la sesión se audita como
 * `consulta_sensible` sobre `inasistencia` (en el controlador), porque trae la lista del curso.
 */
export const TABLA_AUDITORIA_CLASE = 'sesion_clase';
export const TABLA_AUDITORIA_INASISTENCIA = 'inasistencia';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
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
      this.parametros.leerEntero(PARAMETRO_UMBRAL_ALERTA, RANGO_UMBRAL_ALERTA),
    ]);
    return this.construirDetalle(proyecto, sesion, puedeVerDatos, umbralDias);
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

    const { anterior, nuevo } = await this.prisma.$transaction(
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
            sesion_tema: {
              select: { id_contenido: true, tema_adicional: true },
              orderBy: { id: 'asc' },
            },
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
        const adicionalesActuales = temasAdicionalesDe(sesion.sesion_tema);

        // Temas: semanas del contenido programático de este proyecto que tienen tema. Una semana
        // que ya estaba registrada y luego se vació puede conservarse.
        const delProyecto = await tx.contenido_programatico.findMany({
          where: { id_proyecto_docente: proyecto.id },
          select: { id: true, tema: true },
        });
        const pedidos = new Set(datos.idsContenido);
        const contenidos = delProyecto.filter((contenido) =>
          pedidos.has(contenido.id),
        );
        if (
          contenidos.length !== datos.idsContenido.length ||
          contenidos.some(
            (contenido) =>
              contenido.tema === null && !temasActuales.has(contenido.id),
          )
        ) {
          throw new BadRequestException(MENSAJE_TEMAS_INVALIDOS);
        }
        // HU-08-05: sin el campo se conservan los temas no planeados; una lista vacía los borra.
        const temasAdicionales =
          datos.temasAdicionales === undefined
            ? adicionalesActuales
            : validarTemasAdicionales(
                datos.temasAdicionales,
                delProyecto.map((contenido) => contenido.tema),
              );
        // RF-20, p4: al menos un tema, del contenido programático o no planeado.
        if (datos.idsContenido.length === 0 && temasAdicionales.length === 0) {
          throw new BadRequestException(MENSAJE_SIN_TEMAS);
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
        // Los temas no planeados (HU-08-05) no tienen `id_contenido`: van aparte.
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
        // Se reemplazan solo si cambiaron: así no se reescriben en cada corrección.
        if (
          JSON.stringify(temasAdicionales) !==
          JSON.stringify(adicionalesActuales)
        ) {
          await tx.sesion_tema.deleteMany({
            where: { id_sesion: sesion.id, id_contenido: null },
          });
          if (temasAdicionales.length > 0) {
            await tx.sesion_tema.createMany({
              data: temasAdicionales.map((tema) => ({
                id_sesion: sesion.id,
                tema_adicional: tema,
              })),
            });
          }
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
        // Sin el campo se conservan las observaciones; un texto vacío las borra.
        const observaciones =
          datos.observaciones === undefined
            ? sesion.observaciones
            : datos.observaciones.trim() || null;
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
          anterior: {
            estado: sesion.estado,
            temas: [...temasActuales],
            temasAdicionales: adicionalesActuales,
            ausentes: [...ausentesActuales],
            observaciones: sesion.observaciones,
          } satisfies ContenidoDelRegistro,
          nuevo: {
            estado: ESTADO_REGISTRADA,
            temas,
            temasAdicionales,
            ausentes,
            observaciones,
          } satisfies ContenidoDelRegistro,
        };
      },
      { timeout: 10_000 },
    );

    // RF-29: después de confirmar y solo con lo que cambió; el usuario y la IP salen del
    // contexto de la petición. Los dos eventos son independientes: van a la vez.
    await Promise.all(
      eventosDelRegistro(idSesion, anterior, nuevo).map((evento) =>
        this.auditoria.registrar(evento),
      ),
    );
    const [sesion, umbralDias] = await Promise.all([
      this.buscarSesion(proyecto.id, idSesion),
      this.parametros.leerEntero(PARAMETRO_UMBRAL_ALERTA, RANGO_UMBRAL_ALERTA),
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
      temasAdicionales: temasAdicionalesDe(sesion.sesion_tema),
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

/**
 * RF-29: los eventos de auditoría de un registro, solo con lo que cambió. Ausentes y
 * observaciones son datos personales (Ley 1581): de los ausentes van los conteos, nunca quiénes;
 * de las observaciones, que cambiaron, no su texto.
 */
export function eventosDelRegistro(
  idSesion: number,
  anterior: ContenidoDelRegistro,
  nuevo: ContenidoDelRegistro,
): EventoAuditoria[] {
  const eventos: EventoAuditoria[] = [];

  // Los temas no planeados van con su texto: son temas de la clase, no datos personales.
  const clase = soloCambios(
    {
      estado: anterior.estado,
      temas: ordenados(anterior.temas),
      temasAdicionales: anterior.temasAdicionales,
      observaciones: anterior.observaciones,
    },
    {
      estado: nuevo.estado,
      temas: ordenados(nuevo.temas),
      temasAdicionales: nuevo.temasAdicionales,
      observaciones: nuevo.observaciones,
    },
  );
  if (clase) {
    if ('observaciones' in clase.nuevo) {
      clase.anterior.observaciones = VALOR_OMITIDO;
      clase.nuevo.observaciones = VALOR_OMITIDO;
    }
    eventos.push({
      accion: 'actualizar',
      tablaAfectada: TABLA_AUDITORIA_CLASE,
      idRegistro: idSesion,
      valorAnterior: clase.anterior,
      valorNuevo: clase.nuevo,
    });
  }

  const antes = new Set(anterior.ausentes);
  const despues = new Set(nuevo.ausentes);
  const marcados = [...despues].filter((id) => !antes.has(id)).length;
  const desmarcados = [...antes].filter((id) => !despues.has(id)).length;
  if (marcados + desmarcados > 0) {
    eventos.push({
      accion: 'actualizar',
      tablaAfectada: TABLA_AUDITORIA_INASISTENCIA,
      idRegistro: idSesion,
      valorAnterior: { ausentes: antes.size },
      valorNuevo: { ausentes: despues.size, marcados, desmarcados },
    });
  }
  return eventos;
}

/** Los temas no planeados de una sesión (HU-08-05): las filas sin `id_contenido`. */
function temasAdicionalesDe(
  filas: readonly {
    id_contenido: number | null;
    tema_adicional: string | null;
  }[],
): string[] {
  return filas
    .filter((fila) => fila.id_contenido === null)
    .map((fila) => fila.tema_adicional?.trim() ?? '')
    .filter((tema) => tema !== '');
}

/** Sin repetidos y en orden: `soloCambios` compara por JSON. */
function ordenados(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}
