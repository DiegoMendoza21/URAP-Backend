import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import {
  MENSAJE_PROYECTO_NO_EXISTE,
  ProyectosDocentesService,
} from '../proyectos-docentes/proyectos-docentes.service.js';
import {
  aFechaColumna,
  aHoraColumna,
  aniosDe,
  aTextoFecha,
  aTextoHora,
  NOMBRES_DIA_SEMANA,
  planificarSesiones,
} from './calendario.js';
import type { ConsultarCalendarioDto } from './dto/consultas.dto.js';
import type { GuardarHorarioDto } from './dto/horario.dto.js';
import type {
  BloqueHorarioDto,
  CalendarioSesionesDto,
  HorarioCursoDto,
  ResultadoGeneracionDto,
  SesionCalendarioDto,
} from './dto/respuestas.dto.js';

/** Estados de `sesion_clase` (DBML). «Vencida» lo calcula RF-23; no se guarda aquí. */
export const ESTADO_PROGRAMADA = 'programada';
export const ESTADO_REGISTRADA = 'registrada';
/**
 * Sesión sin diligenciar que dejó de caer en el horario. Se inactiva, no se borra (borrado
 * lógico, NFR-017), y vuelve a «programada» si el horario la incluye otra vez.
 */
export const ESTADO_RETIRADA = 'retirada';
/** Códigos de `tipo_sesion` (RF-21) que maneja la generación. */
export const TIPO_CLASE = 'clase';
export const TIPO_FESTIVO = 'festivo';
/** Tipo de notificación con que se avisa al administrador (RF-19, excepción p3). */
export const NOTIFICACION_FESTIVOS_FALTANTES = 'festivos_no_parametrizados';
/**
 * Margen de la transacción de generación. Prisma corta a los 5 s por defecto, lo mismo que la
 * meta de RF-19 (q1): con la base lejos (RDS) una recalculación grande podría abortarse.
 */
const TIEMPO_TRANSACCION_MS = 15_000;

export const MENSAJE_SOLO_DOCENTE_ASIGNADO =
  'Solo un docente asignado al proyecto o el administrador pueden cambiar su horario y su calendario.';
export const MENSAJE_PERIODO_CERRADO =
  'El período académico del proyecto está cerrado: ya no se pueden cambiar el horario ni el calendario.';
export const MENSAJE_PERIODO_SIN_FECHAS =
  'El período académico del proyecto no tiene fecha de inicio y de finalización. El administrador debe completarlas antes de generar el calendario.';
export const MENSAJE_SIN_HORARIO =
  'Defina primero los días y las horas de clase del curso.';
export const MENSAJE_DIA_REPETIDO =
  'Cada día de la semana puede aparecer una sola vez en el horario.';
export const MENSAJE_HORAS_INVERTIDAS =
  'La hora de fin de cada clase debe ser posterior a la de inicio.';

export function mensajeSinFestivos(anio: number): string {
  return (
    `El año ${anio} no tiene días festivos parametrizados: el calendario se generó sin ` +
    'marcarlos y se avisó al administrador.'
  );
}

export function mensajeSinSesiones(dias: readonly number[]): string {
  const nombres = dias.map((dia) => NOMBRES_DIA_SEMANA[dia]).join(', ');
  return `El horario (${nombres}) no produce ninguna sesión entre las fechas del período.`;
}

/** Sesiones que forman el calendario: todas menos las retiradas. */
export const SESION_VIGENTE = {
  OR: [{ estado: null }, { estado: { not: ESTADO_RETIRADA } }],
} as const satisfies Prisma.sesion_claseWhereInput;

const INCLUIR_PROYECTO = {
  asignatura: { select: { id_programa: true } },
  periodo_academico: true,
  horario_curso: { orderBy: { dia_semana: 'asc' } },
} as const satisfies Prisma.proyecto_docenteInclude;

type ProyectoConHorario = Prisma.proyecto_docenteGetPayload<{
  include: typeof INCLUIR_PROYECTO;
}>;

type Transaccion = Prisma.TransactionClient;

/**
 * RF-19: horario del curso (HU-08-02) y generación de su calendario de sesiones (HU-08-03).
 *
 * Alcance (matriz de permisos, «Registro de clases»): consultan los mismos que ven el proyecto
 * docente; cambian el horario y generan el calendario el docente asignado al proyecto
 * (`proyecto_docente_docente`) y el administrador.
 */
@Injectable()
export class SesionesService {
  private readonly logger = new Logger(SesionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly proyectos: ProyectosDocentesService,
  ) {}

  async obtenerHorario(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<HorarioCursoDto> {
    const proyecto = await this.proyectoVisible(usuario, idProyecto);
    return {
      idProyectoDocente: proyecto.id,
      bloques: proyecto.horario_curso.map(aBloque),
      puedeEditar: await this.puedeEditar(usuario, proyecto),
    };
  }

  /** HU-08-02: reemplaza los días y horas de clase del curso. */
  async guardarHorario(
    usuario: UsuarioSesion,
    idProyecto: number,
    { bloques }: GuardarHorarioDto,
  ): Promise<HorarioCursoDto> {
    const proyecto = await this.proyectoEditable(usuario, idProyecto);
    if (
      new Set(bloques.map((bloque) => bloque.diaSemana)).size !== bloques.length
    ) {
      throw new BadRequestException(MENSAJE_DIA_REPETIDO);
    }
    // Las horas llegan validadas como HH:mm: compararlas como texto es compararlas como horas.
    if (bloques.some((bloque) => bloque.horaInicio >= bloque.horaFin)) {
      throw new BadRequestException(MENSAJE_HORAS_INVERTIDAS);
    }
    const ordenados = [...bloques].sort((a, b) => a.diaSemana - b.diaSemana);

    const guardados = await this.prisma.$transaction(async (tx) => {
      await this.bloquearProyecto(tx, proyecto.id);
      await tx.horario_curso.deleteMany({
        where: { id_proyecto_docente: proyecto.id },
      });
      await tx.horario_curso.createMany({
        data: ordenados.map((bloque) => ({
          id_proyecto_docente: proyecto.id,
          dia_semana: bloque.diaSemana,
          hora_inicio: aHoraColumna(bloque.horaInicio),
          hora_fin: aHoraColumna(bloque.horaFin),
        })),
      });
      return tx.horario_curso.findMany({
        where: { id_proyecto_docente: proyecto.id },
        orderBy: { dia_semana: 'asc' },
      });
    });

    const nuevos = guardados.map(aBloque);
    await this.auditar(usuario.id, {
      accion: 'actualizar',
      tabla_afectada: 'horario_curso',
      id_registro: proyecto.id,
      valor_anterior: proyecto.horario_curso.map(
        aBloque,
      ) as unknown as Prisma.InputJsonValue,
      valor_nuevo: nuevos as unknown as Prisma.InputJsonValue,
    });
    return {
      idProyectoDocente: proyecto.id,
      bloques: nuevos,
      puedeEditar: true,
    };
  }

  /** RF-19, p5: el calendario del curso, en orden de fecha. */
  async consultarCalendario(
    usuario: UsuarioSesion,
    idProyecto: number,
    { pagina, tamano }: ConsultarCalendarioDto,
  ): Promise<CalendarioSesionesDto> {
    const proyecto = await this.proyectoVisible(usuario, idProyecto);
    const donde = { id_proyecto_docente: proyecto.id, ...SESION_VIGENTE };
    const [total, sesiones, puedeEditar] = await Promise.all([
      this.prisma.sesion_clase.count({ where: donde }),
      this.prisma.sesion_clase.findMany({
        where: donde,
        include: { tipo_sesion: true, dia_festivo: true },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
      this.puedeEditar(usuario, proyecto),
    ]);
    const periodo = proyecto.periodo_academico;
    const advertencias =
      total > 0 && periodo?.fecha_inicio && periodo.fecha_fin
        ? (
            await this.aniosSinFestivos(
              aniosEntre(periodo.fecha_inicio, periodo.fecha_fin),
            )
          ).map(mensajeSinFestivos)
        : [];
    const horas = new Map(
      proyecto.horario_curso.map((bloque) => [
        bloque.dia_semana,
        aBloque(bloque),
      ]),
    );
    return {
      elementos: sesiones.map((sesion) => aSesion(sesion, horas)),
      pagina,
      tamano,
      total,
      periodo: {
        codigo: periodo?.codigo ?? null,
        fechaInicio: periodo?.fecha_inicio
          ? aTextoFecha(periodo.fecha_inicio)
          : null,
        fechaFin: periodo?.fecha_fin ? aTextoFecha(periodo.fecha_fin) : null,
        numeroSemanas: periodo?.numero_semanas ?? null,
        cerrado: periodo?.cerrado ?? false,
      },
      puedeEditar,
      advertencias,
    };
  }

  /**
   * HU-08-03 (RF-19, p1 a p4): genera el calendario a partir del período y del horario. Si
   * ya existe, lo recalcula: crea las sesiones que falten, actualiza la semana y el festivo de
   * las que no se han diligenciado y retira (inactiva) las sin diligenciar que ya no caen en
   * el horario. Las sesiones diligenciadas, o con cualquier dato del docente, no se tocan
   * (comentarios de RF-19).
   */
  async generarCalendario(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<ResultadoGeneracionDto> {
    const proyecto = await this.proyectoEditable(usuario, idProyecto);
    const periodo = proyecto.periodo_academico;
    if (!periodo?.fecha_inicio || !periodo.fecha_fin) {
      throw new ConflictException(MENSAJE_PERIODO_SIN_FECHAS);
    }
    const fechaInicio = periodo.fecha_inicio;
    const fechaFin = periodo.fecha_fin;
    const [festivos, tipos] = await Promise.all([
      this.prisma.dia_festivo.findMany({
        where: { fecha: { gte: fechaInicio, lte: fechaFin } },
      }),
      this.prisma.tipo_sesion.findMany({
        where: { codigo: { in: [TIPO_CLASE, TIPO_FESTIVO] } },
      }),
    ]);
    const tipoClase = tipos.find((tipo) => tipo.codigo === TIPO_CLASE);
    const tipoFestivo = tipos.find((tipo) => tipo.codigo === TIPO_FESTIVO);
    if (!tipoClase || !tipoFestivo) {
      this.logger.error(
        `Faltan los tipos de sesión «${TIPO_CLASE}» o «${TIPO_FESTIVO}». Corra npm run db:sembrar.`,
      );
      throw new InternalServerErrorException();
    }
    const festivoPorFecha = new Map(
      festivos
        .filter((festivo) => festivo.fecha)
        .map((festivo) => [aTextoFecha(festivo.fecha as Date), festivo]),
    );
    const tiposRecalculables = new Set([tipoClase.id, tipoFestivo.id]);
    /** RF-19, p4: el tipo y la marca de festivo que le tocan a una fecha. */
    const marcaDe = (fecha: string, idTipoActual: number | null) => {
      const festivo = festivoPorFecha.get(fecha) ?? null;
      // Un tipo que eligió el docente (parcial, actividad) se respeta; solo se marca el festivo.
      const recalculable =
        idTipoActual === null || tiposRecalculables.has(idTipoActual);
      return {
        id_dia_festivo: festivo?.id ?? null,
        id_tipo_sesion: recalculable
          ? festivo
            ? tipoFestivo.id
            : tipoClase.id
          : idTipoActual,
      };
    };

    const { plan, dias, ...resultado } = await this.prisma.$transaction(
      async (tx) => {
        // Dos generaciones a la vez (un doble clic), o una generación y un cambio de horario,
        // se atienden de a una. El horario se lee después del bloqueo, para usar el vigente.
        await this.bloquearProyecto(tx, proyecto.id);
        const horario = await tx.horario_curso.findMany({
          where: { id_proyecto_docente: proyecto.id },
          select: { dia_semana: true },
        });
        const dias = horario
          .map((bloque) => bloque.dia_semana)
          .filter((dia): dia is number => dia !== null);
        if (dias.length === 0) {
          throw new ConflictException(MENSAJE_SIN_HORARIO);
        }
        const plan = planificarSesiones({
          fechaInicio,
          fechaFin,
          numeroSemanas: periodo.numero_semanas,
          diasClase: dias,
        });
        const planPorFecha = new Map(
          plan.map((sesion) => [sesion.fecha, sesion]),
        );

        const existentes = await tx.sesion_clase.findMany({
          where: { id_proyecto_docente: proyecto.id },
          include: {
            _count: {
              select: {
                sesion_tema: true,
                inasistencia: true,
                evidencia_rap: true,
              },
            },
          },
        });
        const fechasExistentes = new Set<string>();
        let reactivadas = 0;
        let actualizadas = 0;
        let conservadas = 0;
        const retirar: number[] = [];

        for (const sesion of existentes) {
          const fecha = sesion.fecha ? aTextoFecha(sesion.fecha) : null;
          if (fecha) {
            // El índice único (proyecto, fecha) impide otra sesión en esa fecha.
            fechasExistentes.add(fecha);
          }
          const planeada = fecha ? planPorFecha.get(fecha) : undefined;

          if (sesion.estado === ESTADO_RETIRADA) {
            if (planeada && fecha) {
              await tx.sesion_clase.update({
                where: { id: sesion.id },
                data: {
                  estado: ESTADO_PROGRAMADA,
                  semana: planeada.semana,
                  dia_semana: planeada.diaSemana,
                  ...marcaDe(fecha, sesion.id_tipo_sesion),
                },
              });
              reactivadas++;
            }
            continue;
          }
          if (!fecha || tieneDatosDelDocente(sesion)) {
            conservadas++;
            continue;
          }
          if (!planeada) {
            retirar.push(sesion.id);
            continue;
          }
          const cambios = {
            semana: planeada.semana,
            dia_semana: planeada.diaSemana,
            ...marcaDe(fecha, sesion.id_tipo_sesion),
          };
          const igual =
            sesion.semana === cambios.semana &&
            sesion.dia_semana === cambios.dia_semana &&
            sesion.id_dia_festivo === cambios.id_dia_festivo &&
            sesion.id_tipo_sesion === cambios.id_tipo_sesion;
          if (!igual) {
            await tx.sesion_clase.update({
              where: { id: sesion.id },
              data: cambios,
            });
            actualizadas++;
          }
        }

        if (retirar.length > 0) {
          // Borrado lógico (NFR-017): la sesión queda en la base, fuera del calendario.
          await tx.sesion_clase.updateMany({
            where: { id: { in: retirar } },
            data: { estado: ESTADO_RETIRADA },
          });
        }
        const nuevas = plan.filter(
          (sesion) => !fechasExistentes.has(sesion.fecha),
        );
        if (nuevas.length > 0) {
          await tx.sesion_clase.createMany({
            data: nuevas.map((sesion) => ({
              id_proyecto_docente: proyecto.id,
              semana: sesion.semana,
              fecha: aFechaColumna(sesion.fecha),
              dia_semana: sesion.diaSemana,
              estado: ESTADO_PROGRAMADA,
              ...marcaDe(sesion.fecha, null),
            })),
          });
        }
        const vigentes = {
          id_proyecto_docente: proyecto.id,
          ...SESION_VIGENTE,
        };
        const [total, marcadas] = await Promise.all([
          tx.sesion_clase.count({ where: vigentes }),
          tx.sesion_clase.count({
            where: { ...vigentes, id_dia_festivo: { not: null } },
          }),
        ]);
        return {
          plan,
          dias,
          creadas: nuevas.length + reactivadas,
          actualizadas,
          retiradas: retirar.length,
          conservadas,
          festivos: marcadas,
          total,
        };
      },
      { timeout: TIEMPO_TRANSACCION_MS },
    );

    const aniosSinFestivos = await this.aniosSinFestivos(aniosDe(plan));
    const advertencias = aniosSinFestivos.map(mensajeSinFestivos);
    if (plan.length === 0) {
      advertencias.push(mensajeSinSesiones(dias));
    }
    await this.auditar(usuario.id, {
      accion: 'generar',
      tabla_afectada: 'sesion_clase',
      id_registro: proyecto.id,
      valor_nuevo: { ...resultado, aniosSinFestivos },
    });
    if (aniosSinFestivos.length > 0) {
      await this.avisarAdministradores(aniosSinFestivos, proyecto.id);
    }
    return { ...resultado, advertencias };
  }

  /**
   * Proyecto que el usuario puede ver, con el mismo filtro de la bandeja de proyectos (RF-08).
   * Si no lo ve, 404, igual que si no existiera: no revela proyectos ajenos.
   */
  private async proyectoVisible(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<ProyectoConHorario> {
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    const proyecto = visibles
      ? await this.prisma.proyecto_docente.findFirst({
          where: { AND: [{ id: idProyecto }, visibles] },
          include: INCLUIR_PROYECTO,
        })
      : null;
    if (!proyecto) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    return proyecto;
  }

  /**
   * Proyecto que el usuario puede modificar. Quien no lo ve recibe 404, como en la consulta;
   * quien lo ve pero no es su docente ni administrador, 403.
   */
  private async proyectoEditable(
    usuario: UsuarioSesion,
    idProyecto: number,
  ): Promise<ProyectoConHorario> {
    const proyecto = await this.proyectoVisible(usuario, idProyecto);
    if (!(await this.tienePermisoEdicion(usuario, proyecto))) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTE_ASIGNADO);
    }
    if (proyecto.periodo_academico?.cerrado) {
      throw new ConflictException(MENSAJE_PERIODO_CERRADO);
    }
    return proyecto;
  }

  private async puedeEditar(
    usuario: UsuarioSesion,
    proyecto: ProyectoConHorario,
  ): Promise<boolean> {
    return (
      !proyecto.periodo_academico?.cerrado &&
      (await this.tienePermisoEdicion(usuario, proyecto))
    );
  }

  /** Matriz de permisos, «Registro de clases»: R/E propios para el Docente, ADM para el Administrador. */
  private async tienePermisoEdicion(
    usuario: UsuarioSesion,
    proyecto: ProyectoConHorario,
  ): Promise<boolean> {
    if (usuario.roles.includes(ROL.docente)) {
      const asignado = await this.prisma.proyecto_docente_docente.findFirst({
        where: { id_proyecto_docente: proyecto.id, id_usuario: usuario.id },
        select: { id_usuario: true },
      });
      if (asignado) {
        return true;
      }
    }
    return (
      usuario.roles.includes(ROL.administrador) &&
      (await this.alcance.alcanzaPrograma(
        usuario.id,
        [ROL.administrador],
        proyecto.asignatura?.id_programa ?? null,
      ))
    );
  }

  private async bloquearProyecto(
    tx: Transaccion,
    idProyecto: number,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM proyecto_docente WHERE id = ${idProyecto} FOR UPDATE`;
  }

  /**
   * RF-19, p3: años del calendario sin ningún festivo. Se mira la fecha, igual que al marcar,
   * y no la columna `anio`, para que el aviso y las marcas no se contradigan.
   */
  private async aniosSinFestivos(anios: number[]): Promise<number[]> {
    if (anios.length === 0) {
      return [];
    }
    const festivos = await this.prisma.dia_festivo.findMany({
      where: {
        fecha: {
          gte: aFechaColumna(`${Math.min(...anios)}-01-01`),
          lte: aFechaColumna(`${Math.max(...anios)}-12-31`),
        },
      },
      select: { fecha: true },
    });
    const presentes = new Set(
      festivos.map((festivo) => festivo.fecha?.getUTCFullYear()),
    );
    return anios.filter((anio) => !presentes.has(anio));
  }

  /**
   * RF-19, excepción p3: avisa a los administradores que falta parametrizar los festivos de un
   * año. No repite el aviso mientras el anterior siga sin leer. Un fallo aquí no deshace el
   * calendario: queda en el registro técnico.
   */
  private async avisarAdministradores(
    anios: number[],
    idProyecto: number,
  ): Promise<void> {
    try {
      const tipo = await this.prisma.tipo_notificacion.findUnique({
        where: { codigo: NOTIFICACION_FESTIVOS_FALTANTES },
      });
      if (!tipo) {
        this.logger.error(
          `No existe el tipo de notificación «${NOTIFICACION_FESTIVOS_FALTANTES}». Corra npm run db:sembrar.`,
        );
        return;
      }
      const administradores = await this.prisma.usuario.findMany({
        where: {
          activo: true,
          usuario_rol_usuario_rol_id_usuarioTousuario: {
            some: {
              activo: true,
              fecha_revocacion: null,
              rol: { is: { activo: true, nombre: ROL.administrador } },
            },
          },
        },
        select: { id: true },
      });
      for (const anio of anios) {
        const yaAvisados = await this.prisma.notificacion.findMany({
          where: {
            id_tipo_notificacion: tipo.id,
            entidad: 'dia_festivo',
            id_entidad: anio,
            leida: false,
          },
          select: { id_usuario: true },
        });
        const avisados = new Set(yaAvisados.map((fila) => fila.id_usuario));
        const pendientes = administradores.filter(
          (admin) => !avisados.has(admin.id),
        );
        if (pendientes.length === 0) {
          continue;
        }
        await this.prisma.notificacion.createMany({
          data: pendientes.map((admin) => ({
            id_tipo_notificacion: tipo.id,
            id_usuario: admin.id,
            titulo: `Faltan los días festivos de ${anio}`,
            mensaje:
              `Se generó el calendario de sesiones del proyecto docente ${idProyecto} sin marcar ` +
              `festivos, porque el año ${anio} no tiene días festivos parametrizados. Cárguelos ` +
              'para que el sistema los marque en los calendarios.',
            entidad: 'dia_festivo',
            id_entidad: anio,
            leida: false,
          })),
        });
      }
    } catch (error) {
      this.logger.error(
        `No se pudo avisar a los administradores de los festivos faltantes (${anios.join(', ')}).`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** RF-29. Un fallo al auditar no deshace la operación (CLAUDE.md, «Auditoría»). */
  private async auditar(
    idUsuario: number,
    datos: Omit<Prisma.auditoriaUncheckedCreateInput, 'id_usuario' | 'fecha'>,
  ): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: { ...datos, id_usuario: idUsuario, fecha: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar «${datos.accion}» en ${datos.tabla_afectada} ${datos.id_registro}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function esDiligenciada(sesion: {
  estado: string | null;
  fecha_registro: Date | null;
  id_registrado_por: number | null;
}): boolean {
  return (
    sesion.estado === ESTADO_REGISTRADA ||
    sesion.fecha_registro !== null ||
    sesion.id_registrado_por !== null
  );
}

/**
 * Una sesión con algo que puso el docente no se recalcula: diligenciada (RF-20), con
 * descripción u observaciones (RF-21), o con temas, inasistencias o evidencias.
 */
function tieneDatosDelDocente(sesion: {
  estado: string | null;
  fecha_registro: Date | null;
  id_registrado_por: number | null;
  descripcion: string | null;
  observaciones: string | null;
  _count: { sesion_tema: number; inasistencia: number; evidencia_rap: number };
}): boolean {
  return (
    esDiligenciada(sesion) ||
    Boolean(sesion.descripcion?.trim()) ||
    Boolean(sesion.observaciones?.trim()) ||
    sesion._count.sesion_tema +
      sesion._count.inasistencia +
      sesion._count.evidencia_rap >
      0
  );
}

function aniosEntre(inicio: Date, fin: Date): number[] {
  const anios: number[] = [];
  for (
    let anio = inicio.getUTCFullYear();
    anio <= fin.getUTCFullYear();
    anio++
  ) {
    anios.push(anio);
  }
  return anios;
}

function aBloque(bloque: {
  dia_semana: number | null;
  hora_inicio: Date | null;
  hora_fin: Date | null;
}): BloqueHorarioDto {
  return {
    diaSemana: bloque.dia_semana ?? 0,
    horaInicio: bloque.hora_inicio ? aTextoHora(bloque.hora_inicio) : '',
    horaFin: bloque.hora_fin ? aTextoHora(bloque.hora_fin) : '',
  };
}

function aSesion(
  sesion: Prisma.sesion_claseGetPayload<{
    include: { tipo_sesion: true; dia_festivo: true };
  }>,
  horas: Map<number | null, BloqueHorarioDto>,
): SesionCalendarioDto {
  const bloque = horas.get(sesion.dia_semana);
  return {
    id: sesion.id,
    semana: sesion.semana ?? 0,
    fecha: sesion.fecha ? aTextoFecha(sesion.fecha) : '',
    diaSemana: sesion.dia_semana ?? 0,
    horaInicio: bloque?.horaInicio ?? null,
    horaFin: bloque?.horaFin ?? null,
    tipo:
      sesion.tipo_sesion?.codigo && sesion.tipo_sesion.nombre
        ? {
            codigo: sesion.tipo_sesion.codigo,
            nombre: sesion.tipo_sesion.nombre,
          }
        : null,
    estado: sesion.estado,
    festivo: sesion.dia_festivo?.nombre ?? null,
    diligenciada: esDiligenciada(sesion),
  };
}
