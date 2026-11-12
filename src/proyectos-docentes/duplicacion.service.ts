import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  AsistenteService,
  filtroDocenteDelPrograma,
} from './asistente.service.js';
import type { DocenteAsignadoDto } from './dto/crear-proyecto-docente.dto.js';
import type {
  AvisoRapDto,
  ContenidoCopiadoDto,
  DuplicarProyectoDocenteDto,
  PreparacionDuplicadoDto,
} from './dto/duplicacion.dto.js';
import type { ProyectoDocenteDetalleDto } from './dto/respuestas.dto.js';
import {
  aDetalle,
  aPeriodo,
  aRap,
  aResumen,
  INCLUIR_DETALLE,
  INCLUIR_RESUMEN,
} from './mapeo.js';
import {
  ESTADO_INICIAL,
  exigirCursoLibre,
  MENSAJE_DOCENTES_INVALIDOS,
  MENSAJE_PROYECTO_NO_EXISTE,
  MENSAJE_RAP_INVALIDOS,
  MENSAJE_SIN_PERIODO,
  ORIGEN_DUPLICADO,
  ProyectosDocentesService,
  validarDocentes,
} from './proyectos-docentes.service.js';

export const MENSAJE_PERIODO_NO_DISPONIBLE =
  'El período elegido no está abierto. Elija un período activo y sin cerrar.';
export const MENSAJE_AVISO_RAP =
  'La asignatura cambió de RAP desde el proyecto de origen. Revise la selección antes de duplicar.';

/**
 * RF-09, q1: la duplicación tarda 5 segundos o menos. El límite de la transacción es más
 * holgado a propósito: en un equipo ocupado, cortar la copia a los 5 segundos dejaría al
 * usuario sin proyecto, que es peor que esperar uno o dos segundos más.
 */
const TIEMPO_MAXIMO_TRANSACCION_MS = 15_000;

/** Lo que hace falta leer del proyecto de origen para copiarlo. */
const INCLUIR_ORIGEN = {
  ...INCLUIR_RESUMEN,
  asignatura: {
    include: {
      plan_estudio: { include: { programa: true } },
      asignatura_rap: true,
    },
  },
  proyecto_docente_rap: { include: { rap: true } },
  rac: {
    include: {
      rac_rap: true,
      evaluacion_rac: { orderBy: { id: 'asc' } },
    },
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
  },
  estrategia_metodologica: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
  contenido_programatico: { orderBy: { semana: 'asc' } },
  bibliografia: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.proyecto_docenteInclude;

export type Origen = Prisma.proyecto_docenteGetPayload<{
  include: typeof INCLUIR_ORIGEN;
}>;

type OrigenLeido = Origen & {
  asignatura: NonNullable<Origen['asignatura']>;
  idPrograma: number;
};

/**
 * Duplicación de un proyecto docente (RF-09; HU-05-04). La copia lleva la descripción, los
 * RAC con su relación con los RAP y su evaluación, las estrategias, los contenidos por semana
 * y la bibliografía, y nace en diligenciamiento: sin revisiones, observaciones, horario,
 * clases, evidencias, matriculados ni mediciones del original. Crear sigue siendo del
 * Departamento académico del programa de la asignatura, como en el asistente (RF-08).
 */
@Injectable()
export class DuplicacionService {
  private readonly logger = new Logger(DuplicacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asistente: AsistenteService,
    private readonly proyectos: ProyectosDocentesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** RF-09, p3: el formulario de la copia, con todo lo que trae el origen. */
  async preparar(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<PreparacionDuplicadoDto> {
    const origen = await this.leerOrigen(usuario, id);
    const { idPrograma } = origen;
    const [periodos, vigente, docentes, raps] = await Promise.all([
      this.prisma.periodo_academico.findMany({
        where: { activo: true, cerrado: false },
        orderBy: { fecha_inicio: 'desc' },
      }),
      this.asistente.periodoVigente(),
      this.asistente.docentes(usuario.id, idPrograma),
      this.prisma.rap.findMany({
        where: { id_programa: idPrograma, activo: true },
        orderBy: { numero: 'asc' },
      }),
    ]);
    const idsDocentes = new Set(docentes.map((docente) => docente.id));
    const mapeados = rapsDelMapeo(origen);
    const activos = new Set(raps.map((rap) => rap.id));

    return {
      origen: aResumen(origen),
      contenido: contenidoDe(origen),
      periodos: periodos.map((periodo) => ({
        ...(aPeriodo(periodo) as NonNullable<ReturnType<typeof aPeriodo>>),
        semanasQueNoCaben: semanasFuera(origen, periodo.numero_semanas),
      })),
      idPeriodoSugerido: vigente?.id ?? null,
      docentes,
      docentesSugeridos: origen.proyecto_docente_docente
        .filter((asignacion) => idsDocentes.has(asignacion.id_usuario))
        .map((asignacion) => ({
          idUsuario: asignacion.id_usuario,
          responsable: asignacion.responsable === true,
        })),
      raps: raps.map((rap) => ({
        ...aRap(rap),
        mapeado: mapeados.has(rap.id),
      })),
      idsRapSugeridos: origen.proyecto_docente_rap
        .map((relacion) => relacion.id_rap)
        .filter((idRap) => activos.has(idRap)),
      avisoRap: avisoRap(origen, raps),
    };
  }

  /** RF-09, p5 y p6: valida y guarda la copia en diligenciamiento, con su origen. */
  async duplicar(
    usuario: UsuarioSesion,
    id: number,
    datos: DuplicarProyectoDocenteDto,
  ): Promise<ProyectoDocenteDetalleDto> {
    const origen = await this.leerOrigen(usuario, id);
    const { idPrograma } = origen;
    validarDocentes(datos.docentes);

    const idsRap =
      datos.idsRap ??
      origen.proyecto_docente_rap.map((relacion) => relacion.id_rap);
    const [periodo, estado, rapsValidos, docentesValidos] = await Promise.all([
      datos.idPeriodo === undefined
        ? this.asistente.periodoVigente()
        : this.prisma.periodo_academico.findFirst({
            where: { id: datos.idPeriodo, activo: true, cerrado: false },
          }),
      this.prisma.estado_proyecto.findUnique({
        where: { codigo: ESTADO_INICIAL },
      }),
      this.prisma.rap.findMany({
        where: { id: { in: idsRap }, id_programa: idPrograma, activo: true },
        select: { id: true },
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
      if (datos.idPeriodo === undefined) {
        throw new ConflictException(MENSAJE_SIN_PERIODO);
      }
      throw new BadRequestException(MENSAJE_PERIODO_NO_DISPONIBLE);
    }
    if (!estado) {
      this.logger.error(
        `No existe el estado de proyecto «${ESTADO_INICIAL}». Corra npm run db:sembrar.`,
      );
      throw new InternalServerErrorException();
    }
    // Sin la selección del usuario, los RAP del origen que ya no están activos se quedan
    // fuera; si el usuario los eligió, es un error suyo.
    const rapsCopia = datos.idsRap
      ? idsRap
      : idsRap.filter((idRap) => rapsValidos.some((rap) => rap.id === idRap));
    if (
      rapsCopia.length === 0 ||
      (datos.idsRap !== undefined && rapsValidos.length !== datos.idsRap.length)
    ) {
      throw new BadRequestException(MENSAJE_RAP_INVALIDOS);
    }
    if (docentesValidos !== datos.docentes.length) {
      throw new BadRequestException(MENSAJE_DOCENTES_INVALIDOS);
    }

    const grupo = datos.grupo ?? null;
    const docentes = ordenarDocentes(datos.docentes);
    const seleccionados = new Set(rapsCopia);
    const semanas = origen.contenido_programatico.filter(
      (fila) =>
        periodo.numero_semanas === null ||
        (fila.semana ?? 0) <= periodo.numero_semanas,
    );
    const ahora = new Date();

    const creado = await this.prisma.$transaction(
      async (tx) => {
        await exigirCursoLibre(tx, origen.asignatura.id, periodo.id, grupo);
        const nuevo = await tx.proyecto_docente.create({
          data: {
            id_asignatura: origen.asignatura.id,
            id_periodo: periodo.id,
            id_estado: estado.id,
            grupo,
            descripcion: origen.descripcion,
            id_proyecto_origen: origen.id,
            origen: ORIGEN_DUPLICADO,
            id_creado_por: usuario.id,
            fecha_creacion: ahora,
            fecha_actualizacion: ahora,
            // La rúbrica congelada es del curso de origen: el nuevo mide con la vigente (RF-30).
            proyecto_docente_rap: {
              create: rapsCopia.map((idRap) => ({ id_rap: idRap })),
            },
            proyecto_docente_docente: {
              create: docentes.map((docente, indice) => ({
                id_usuario: docente.idUsuario,
                responsable: docente.responsable,
                orden: indice + 1,
              })),
            },
            estrategia_metodologica: {
              create: origen.estrategia_metodologica.map((fila) => ({
                descripcion: fila.descripcion,
                orden: fila.orden,
              })),
            },
            contenido_programatico: {
              create: semanas.map((fila) => ({
                semana: fila.semana,
                tema: fila.tema,
                horas_tde: fila.horas_tde,
                horas_tdp: fila.horas_tdp,
                horas_ti: fila.horas_ti,
              })),
            },
            bibliografia: {
              create: origen.bibliografia.map((fila) => ({
                referencia: fila.referencia,
                orden: fila.orden,
              })),
            },
          },
          select: { id: true },
        });
        // Cada RAC con sus relaciones y su evaluación: necesitan el id del RAC nuevo.
        for (const rac of origen.rac) {
          await tx.rac.create({
            data: {
              id_proyecto_docente: nuevo.id,
              codigo: rac.codigo,
              descripcion: rac.descripcion,
              orden: rac.orden,
              rac_rap: {
                create: rac.rac_rap
                  .filter((relacion) => seleccionados.has(relacion.id_rap))
                  .map((relacion) => ({
                    id_rap: relacion.id_rap,
                    descripcion_contribucion: relacion.descripcion_contribucion,
                  })),
              },
              evaluacion_rac: {
                create: rac.evaluacion_rac.map((actividad) => ({
                  instrumento: actividad.instrumento,
                  descripcion: actividad.descripcion,
                  porcentaje: actividad.porcentaje,
                })),
              },
            },
          });
        }
        return tx.proyecto_docente.findUniqueOrThrow({
          where: { id: nuevo.id },
          include: INCLUIR_DETALLE,
        });
      },
      { timeout: TIEMPO_MAXIMO_TRANSACCION_MS },
    );

    const copiado = contenidoDe({ ...origen, contenido_programatico: semanas });
    // RF-29: la creación por copia, con el proyecto de origen. Fuera de la transacción.
    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: 'proyecto_docente',
      idRegistro: creado.id,
      valorNuevo: {
        origen: ORIGEN_DUPLICADO,
        idProyectoOrigen: origen.id,
        idAsignatura: origen.asignatura.id,
        idPeriodo: periodo.id,
        grupo,
        idsRap: rapsCopia,
        docentes: docentes.map(({ idUsuario, responsable }) => ({
          idUsuario,
          responsable,
        })),
        copiado: { ...copiado },
      },
    });
    await this.proyectos.avisarAsignacion(
      creado,
      docentes.map((docente) => docente.idUsuario),
      usuario.id,
    );
    return aDetalle(creado);
  }

  /**
   * El origen, si el usuario lo ve (404 igual si no existe, para no revelar proyectos ajenos)
   * y es Departamento académico de su programa (403, como en el asistente).
   */
  private async leerOrigen(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<OrigenLeido> {
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    const origen = visibles
      ? await this.prisma.proyecto_docente.findFirst({
          where: { AND: [{ id }, visibles] },
          include: INCLUIR_ORIGEN,
        })
      : null;
    if (!origen?.asignatura) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    const idPrograma = origen.asignatura.plan_estudio.id_programa;
    // Sin programa no hay Departamento que pueda crear: exigirPrograma responde 404.
    await this.asistente.exigirPrograma(usuario.id, idPrograma);
    return {
      ...origen,
      asignatura: origen.asignatura,
      idPrograma: idPrograma as number,
    };
  }
}

function ordenarDocentes(docentes: DocenteAsignadoDto[]): DocenteAsignadoDto[] {
  // El responsable va primero: es quien firma «elaboró» en el formato.
  return [...docentes].sort(
    (a, b) => Number(b.responsable) - Number(a.responsable),
  );
}

export function contenidoDe(
  origen: Pick<
    Origen,
    | 'descripcion'
    | 'rac'
    | 'estrategia_metodologica'
    | 'contenido_programatico'
    | 'bibliografia'
  >,
): ContenidoCopiadoDto {
  return {
    descripcion: Boolean(origen.descripcion?.trim()),
    racs: origen.rac.length,
    relacionesRap: origen.rac.reduce(
      (suma, rac) => suma + rac.rac_rap.length,
      0,
    ),
    estrategias: origen.estrategia_metodologica.length,
    actividadesEvaluacion: origen.rac.reduce(
      (suma, rac) => suma + rac.evaluacion_rac.length,
      0,
    ),
    semanasContenido: origen.contenido_programatico.length,
    referencias: origen.bibliografia.length,
  };
}

export function semanasFuera(
  origen: Origen,
  numeroSemanas: number | null,
): number {
  if (numeroSemanas === null) {
    return 0;
  }
  return origen.contenido_programatico.filter(
    (fila) => (fila.semana ?? 0) > numeroSemanas,
  ).length;
}

/** El mapeo curricular vigente de la asignatura: sus RAP hoy. */
function rapsDelMapeo(origen: Origen): Set<number> {
  return new Set(
    (origen.asignatura?.asignatura_rap ?? [])
      .filter((relacion) => relacion.activo !== false)
      .map((relacion) => relacion.id_rap),
  );
}

/**
 * RF-09, excepción de p4: la asignatura cambió de RAP respecto del proyecto de origen. Cuenta
 * como cambio un RAP del origen que ya no está activo o que salió del mapeo de la asignatura,
 * y un RAP del mapeo que el origen no tenía. Si la asignatura no tiene mapeo registrado, solo
 * cuentan los RAP inactivos: sin mapeo no hay con qué comparar.
 */
export function avisoRap(
  origen: Origen,
  rapsActivos: Prisma.rapGetPayload<object>[],
): AvisoRapDto | null {
  const mapeados = rapsDelMapeo(origen);
  const activos = new Map(rapsActivos.map((rap) => [rap.id, rap]));
  const delOrigen = new Set(origen.proyecto_docente_rap.map((r) => r.id_rap));
  const retirados = origen.proyecto_docente_rap
    .filter(
      (relacion) =>
        !activos.has(relacion.id_rap) ||
        (mapeados.size > 0 && !mapeados.has(relacion.id_rap)),
    )
    .map((relacion) => aRap(relacion.rap));
  const nuevos = [...mapeados]
    .filter((idRap) => !delOrigen.has(idRap) && activos.has(idRap))
    .map((idRap) => aRap(activos.get(idRap) as Prisma.rapGetPayload<object>));
  if (retirados.length === 0 && nuevos.length === 0) {
    return null;
  }
  return { mensaje: MENSAJE_AVISO_RAP, retirados, nuevos };
}
