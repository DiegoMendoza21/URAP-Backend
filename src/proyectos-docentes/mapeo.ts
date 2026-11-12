import type { Prisma } from '../generated/prisma/client.js';
import type {
  AsignaturaRequisitoDto,
  DocenteProyectoDto,
  InformacionInstitucionalDto,
  PeriodoAcademicoDto,
  ProyectoDocenteDetalleDto,
  ProyectoDocenteResumenDto,
  RapDto,
} from './dto/respuestas.dto.js';
import { camposFaltantes } from './entities/informacion-institucional.js';

/** Tipos de `asignatura_requisito.tipo` (DBML v2.5). */
const TIPO_PRERREQUISITO = 'prerrequisito';
const TIPO_CORREQUISITO = 'correquisito';

/**
 * Lo que hace falta leer de la asignatura para la información institucional (p5). Desde el
 * modelo v2.5 el programa y la facultad se leen a través del plan de estudios.
 */
export const INCLUIR_ASIGNATURA = {
  plan_estudio: { include: { programa: { include: { facultad: true } } } },
  asignatura_requisito_asignatura_requisito_id_asignaturaToasignatura: {
    include: {
      asignatura_asignatura_requisito_id_asignatura_requeridaToasignatura: true,
    },
  },
} satisfies Prisma.asignaturaInclude;

export type AsignaturaConInformacion = Prisma.asignaturaGetPayload<{
  include: typeof INCLUIR_ASIGNATURA;
}>;

/** Lo que hace falta leer de un proyecto para su resumen en la bandeja. */
export const INCLUIR_RESUMEN = {
  asignatura: { include: { plan_estudio: { include: { programa: true } } } },
  periodo_academico: true,
  estado_proyecto: true,
  proyecto_docente_docente: {
    include: { usuario: true },
    orderBy: [{ responsable: 'desc' }, { orden: 'asc' }],
  },
} satisfies Prisma.proyecto_docenteInclude;

/** Lo que hace falta leer de un proyecto para su ficha. */
export const INCLUIR_DETALLE = {
  ...INCLUIR_RESUMEN,
  asignatura: { include: INCLUIR_ASIGNATURA },
  proyecto_docente_rap: {
    include: { rap: true },
    orderBy: { rap: { numero: 'asc' } },
  },
} satisfies Prisma.proyecto_docenteInclude;

type ProyectoResumen = Prisma.proyecto_docenteGetPayload<{
  include: typeof INCLUIR_RESUMEN;
}>;
type ProyectoDetalle = Prisma.proyecto_docenteGetPayload<{
  include: typeof INCLUIR_DETALLE;
}>;

export function fechaSinHora(fecha: Date | null): string | null {
  return fecha ? fecha.toISOString().slice(0, 10) : null;
}

export function aPeriodo(
  periodo: Prisma.periodo_academicoGetPayload<object> | null,
): PeriodoAcademicoDto | null {
  if (!periodo) {
    return null;
  }
  return {
    id: periodo.id,
    codigo: periodo.codigo ?? '',
    fechaInicio: fechaSinHora(periodo.fecha_inicio),
    fechaFin: fechaSinHora(periodo.fecha_fin),
    numeroSemanas: periodo.numero_semanas,
  };
}

export function aRap(rap: Prisma.rapGetPayload<object>): RapDto {
  return {
    id: rap.id,
    codigo: rap.codigo,
    numero: rap.numero,
    descripcion: rap.descripcion,
  };
}

export function aInformacionInstitucional(
  asignatura: AsignaturaConInformacion,
): InformacionInstitucionalDto {
  const requisitos =
    asignatura.asignatura_requisito_asignatura_requisito_id_asignaturaToasignatura;
  const deTipo = (tipo: string): AsignaturaRequisitoDto[] =>
    requisitos
      .filter((requisito) => requisito.tipo === tipo)
      .map((requisito) => {
        const requerida =
          requisito.asignatura_asignatura_requisito_id_asignatura_requeridaToasignatura;
        return {
          id: requerida.id,
          codigo: requerida.codigo_interno,
          nombre: requerida.nombre ?? '',
        };
      });
  const faltantes = camposFaltantes(asignatura);

  return {
    facultad: asignatura.plan_estudio.programa?.facultad?.nombre ?? null,
    programa: asignatura.plan_estudio.programa?.nombre ?? null,
    planEstudio: asignatura.plan_estudio.codigo,
    idAsignatura: asignatura.id,
    codigo: asignatura.codigo_interno,
    asignatura: asignatura.nombre,
    semestre: asignatura.semestre,
    componente: asignatura.componente,
    tipoCurso: asignatura.tipo_curso,
    creditos: asignatura.creditos,
    horasTde: asignatura.horas_tde,
    horasTdp: asignatura.horas_tdp,
    horasTi: asignatura.horas_ti,
    horasTotales: asignatura.horas_totales,
    prerrequisitos: deTipo(TIPO_PRERREQUISITO),
    correquisitos: deTipo(TIPO_CORREQUISITO),
    informacionIncompleta: faltantes.length > 0,
    camposFaltantes: faltantes,
  };
}

function aDocentes(proyecto: ProyectoResumen): DocenteProyectoDto[] {
  return proyecto.proyecto_docente_docente.map((asignacion) => ({
    id: asignacion.usuario.id,
    nombres: asignacion.usuario.nombres,
    apellidos: asignacion.usuario.apellidos,
    responsable: asignacion.responsable === true,
  }));
}

export function aResumen(proyecto: ProyectoResumen): ProyectoDocenteResumenDto {
  const { asignatura } = proyecto;
  return {
    id: proyecto.id,
    idAsignatura: asignatura?.id ?? 0,
    codigoAsignatura: asignatura?.codigo_interno ?? null,
    asignatura: asignatura?.nombre ?? null,
    programa: asignatura?.plan_estudio.programa?.nombre ?? null,
    planEstudio: asignatura?.plan_estudio.codigo ?? null,
    periodo: proyecto.periodo_academico?.codigo ?? null,
    grupo: proyecto.grupo,
    estado: proyecto.estado_proyecto
      ? {
          codigo: proyecto.estado_proyecto.codigo ?? '',
          nombre: proyecto.estado_proyecto.nombre ?? '',
        }
      : null,
    docentes: aDocentes(proyecto),
    informacionIncompleta: asignatura
      ? camposFaltantes(asignatura).length > 0
      : true,
    fechaCreacion: proyecto.fecha_creacion?.toISOString() ?? null,
  };
}

export function aDetalle(proyecto: ProyectoDetalle): ProyectoDocenteDetalleDto {
  // El proyecto siempre se crea con su asignatura; la columna admite nulos solo por el DDL.
  const asignatura = proyecto.asignatura as AsignaturaConInformacion;
  return {
    ...aResumen(proyecto),
    origen: proyecto.origen,
    idProyectoOrigen: proyecto.id_proyecto_origen,
    periodoAcademico: aPeriodo(proyecto.periodo_academico),
    informacion: aInformacionInstitucional(asignatura),
    raps: proyecto.proyecto_docente_rap.map((relacion) => aRap(relacion.rap)),
  };
}
