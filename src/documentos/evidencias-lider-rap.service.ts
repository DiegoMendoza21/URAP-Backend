import { ForbiddenException, Injectable } from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ConsultarProyectosDocentesDto } from '../proyectos-docentes/dto/consultas.dto.js';
import { ProyectosDocentesService } from '../proyectos-docentes/proyectos-docentes.service.js';
import type {
  EvidenciaRapACargoDto,
  PaginaEvidenciasRapACargoDto,
  RapACargoDto,
  RapsACargoDto,
} from './dto/raps-a-cargo.dto.js';
import {
  aEvidencia,
  INCLUIR_EVIDENCIA,
  MENSAJE_SIN_RAP_A_CARGO,
} from './evidencias.service.js';

export const MENSAJE_RAP_NO_A_CARGO =
  'Solo puede consultar las evidencias de los RAP a su cargo, y este RAP no es uno de ellos.';

/** Los períodos en que el usuario lidera un RAP. `todos`: lo lidera sin período. */
export interface Liderazgo {
  todos: boolean;
  periodos: number[];
}

const INCLUIR_EVIDENCIA_CON_PROYECTO = {
  ...INCLUIR_EVIDENCIA,
  proyecto_docente: {
    select: {
      id: true,
      grupo: true,
      asignatura: { select: { nombre: true } },
      periodo_academico: { select: { codigo: true } },
      proyecto_docente_docente: {
        where: { responsable: true },
        select: {
          usuario: { select: { id: true, nombres: true, apellidos: true } },
        },
        take: 1,
      },
    },
  },
} as const satisfies Prisma.evidencia_rapInclude;

type EvidenciaConProyecto = Prisma.evidencia_rapGetPayload<{
  include: typeof INCLUIR_EVIDENCIA_CON_PROYECTO;
}>;

/**
 * HU-10-04 (RF-24): el Líder RAP consulta las evidencias de los RAP a su cargo en todas las
 * asignaturas del programa. «A su cargo» es `lider_rap` vigente: el RAP en los períodos en que
 * lo lidera, o en todos si la fila no tiene período. Los proyectos son los que el usuario ve
 * (`filtroVisibilidad`: el Líder RAP ve los de su programa).
 *
 * Es el mismo criterio que la galería de cada proyecto (`EvidenciasService.acceso`), así que la
 * descarga de cada archivo, que sigue pasando por el endpoint protegido del proyecto, autoriza
 * exactamente las evidencias que se listan aquí.
 */
@Injectable()
export class EvidenciasLiderRapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectos: ProyectosDocentesService,
  ) {}

  /** Los RAP a cargo, con cuántas evidencias y proyectos tiene cada uno. */
  async rapsACargo(usuario: UsuarioSesion): Promise<RapsACargoDto> {
    const liderazgos = await this.liderazgos(usuario);
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    if (liderazgos.size === 0 || !visibles) {
      return { raps: [] };
    }

    const idsPeriodo = [
      ...new Set([...liderazgos.values()].flatMap((l) => l.periodos)),
    ];
    const [raps, periodos] = await Promise.all([
      this.prisma.rap.findMany({
        where: { id: { in: [...liderazgos.keys()] } },
        select: { id: true, numero: true, codigo: true, descripcion: true },
        orderBy: [{ numero: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.periodo_academico.findMany({
        where: { id: { in: idsPeriodo } },
        select: { id: true, codigo: true, fecha_inicio: true },
        orderBy: [{ fecha_inicio: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const resumen: RapACargoDto[] = [];
    for (const rap of raps) {
      const liderazgo = liderazgos.get(rap.id) as Liderazgo;
      const proyectosDelRap = filtroProyectos(visibles, liderazgo);
      const [totalEvidencias, totalProyectos, proyectosConEvidencias] =
        await Promise.all([
          this.prisma.evidencia_rap.count({
            where: {
              id_rap: rap.id,
              proyecto_docente: { is: proyectosDelRap },
            },
          }),
          this.prisma.proyecto_docente.count({
            where: {
              AND: [
                proyectosDelRap,
                { proyecto_docente_rap: { some: { id_rap: rap.id } } },
              ],
            },
          }),
          this.prisma.proyecto_docente.count({
            where: {
              AND: [
                proyectosDelRap,
                { evidencia_rap: { some: { id_rap: rap.id } } },
              ],
            },
          }),
        ]);
      resumen.push({
        ...rap,
        todosLosPeriodos: liderazgo.todos,
        periodos: liderazgo.todos
          ? []
          : periodos
              .filter((periodo) => liderazgo.periodos.includes(periodo.id))
              .map(({ id, codigo }) => ({ id, codigo })),
        totalEvidencias,
        totalProyectos,
        proyectosConEvidencias,
      });
    }
    return { raps: resumen };
  }

  /**
   * Evidencias de un RAP a cargo, de todos los proyectos docentes que tributan a él, las más
   * recientes primero. 403 si el RAP no está a cargo del usuario. La consulta la audita el
   * controlador (`@AuditarConsulta`): son fotos de clase, datos personales (Ley 1581).
   */
  async evidenciasDeRap(
    usuario: UsuarioSesion,
    idRap: number,
    { pagina, tamano }: ConsultarProyectosDocentesDto,
  ): Promise<PaginaEvidenciasRapACargoDto> {
    const liderazgo = (await this.liderazgos(usuario)).get(idRap);
    if (!liderazgo) {
      throw new ForbiddenException(MENSAJE_RAP_NO_A_CARGO);
    }
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    if (!visibles) {
      throw new ForbiddenException(MENSAJE_SIN_RAP_A_CARGO);
    }

    const donde: Prisma.evidencia_rapWhereInput = {
      id_rap: idRap,
      proyecto_docente: { is: filtroProyectos(visibles, liderazgo) },
    };
    const [total, filas] = await Promise.all([
      this.prisma.evidencia_rap.count({ where: donde }),
      this.prisma.evidencia_rap.findMany({
        where: donde,
        include: INCLUIR_EVIDENCIA_CON_PROYECTO,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return {
      elementos: filas.map(aEvidenciaConProyecto),
      pagina,
      tamano,
      total,
    };
  }

  /** RAP que lidera el usuario (filas vigentes de `lider_rap`), con sus períodos. */
  private async liderazgos(
    usuario: UsuarioSesion,
  ): Promise<Map<number, Liderazgo>> {
    const liderazgos = new Map<number, Liderazgo>();
    if (!usuario.roles.includes(ROL.liderRap)) {
      return liderazgos;
    }
    const filas = await this.prisma.lider_rap.findMany({
      where: { id_usuario: usuario.id, activo: true, id_rap: { not: null } },
      select: { id_rap: true, id_periodo: true },
    });
    for (const { id_rap: idRap, id_periodo: idPeriodo } of filas) {
      const liderazgo = liderazgos.get(idRap as number) ?? {
        todos: false,
        periodos: [],
      };
      if (idPeriodo === null) {
        liderazgo.todos = true;
      } else if (!liderazgo.periodos.includes(idPeriodo)) {
        liderazgo.periodos.push(idPeriodo);
      }
      liderazgos.set(idRap as number, liderazgo);
    }
    return liderazgos;
  }
}

/** Proyectos que el usuario ve, de los períodos en que lidera el RAP. */
export function filtroProyectos(
  visibles: Prisma.proyecto_docenteWhereInput,
  liderazgo: Liderazgo,
): Prisma.proyecto_docenteWhereInput {
  return liderazgo.todos
    ? visibles
    : { AND: [visibles, { id_periodo: { in: liderazgo.periodos } }] };
}

function aEvidenciaConProyecto(
  evidencia: EvidenciaConProyecto,
): EvidenciaRapACargoDto {
  const proyecto = evidencia.proyecto_docente;
  const responsable = proyecto?.proyecto_docente_docente[0]?.usuario ?? null;
  return {
    ...aEvidencia(evidencia),
    proyecto: {
      id: proyecto?.id ?? evidencia.id_proyecto_docente ?? 0,
      asignatura: proyecto?.asignatura?.nombre ?? null,
      grupo: proyecto?.grupo ?? null,
      periodo: proyecto?.periodo_academico?.codigo ?? null,
      docenteResponsable: responsable,
    },
  };
}
