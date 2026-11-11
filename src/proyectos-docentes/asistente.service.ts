import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AlcanceService } from './alcance.service.js';
import type {
  AsignaturaOpcionDto,
  DocenteOpcionDto,
  InformacionAsignaturaDto,
  ProgramaOpcionDto,
  ProyectoExistenteDto,
} from './dto/respuestas.dto.js';
import {
  aInformacionInstitucional,
  aPeriodo,
  aResumen,
  INCLUIR_ASIGNATURA,
  INCLUIR_RESUMEN,
} from './mapeo.js';

export const MENSAJE_PROGRAMA_FUERA_DE_ALCANCE =
  'No tiene permiso para crear proyectos docentes en este programa.';
export const MENSAJE_ASIGNATURA_NO_EXISTE =
  'La asignatura no existe o está inactiva.';
export const MENSAJE_PROGRAMA_NO_EXISTE =
  'El programa no existe o está inactivo.';

const ROLES_CREACION = [ROL.departamento] as const;

/**
 * Lecturas que alimentan los pasos del asistente de creación del proyecto docente (RF-08).
 * Solo devuelven lo del programa sobre el que el usuario es Departamento académico.
 *
 * Las listas de opciones no se paginan: están acotadas por el catálogo de un programa (sus
 * asignaturas, sus RAP, sus docentes) y el asistente las necesita completas para elegir.
 */
@Injectable()
export class AsistenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
  ) {}

  /** Paso 1: programas activos donde el usuario es Departamento académico. */
  async programas(idUsuario: number): Promise<ProgramaOpcionDto[]> {
    const { global, programas } = await this.alcance.alcance(
      idUsuario,
      ROLES_CREACION,
    );
    const filas = await this.prisma.programa.findMany({
      where: { activo: true, ...(global ? {} : { id: { in: programas } }) },
      include: { facultad: true },
      orderBy: { nombre: 'asc' },
    });
    return filas.map((programa) => ({
      id: programa.id,
      nombre: programa.nombre ?? '',
      facultad: programa.facultad?.nombre ?? null,
    }));
  }

  /**
   * Paso 2: asignaturas activas del programa, de todos sus planes de estudio. Cada una lleva
   * su plan, porque la misma asignatura puede estar en dos planes con códigos distintos
   * (modelo v2.5). Van ordenadas por plan y, dentro de él, por semestre y por nombre. Dos con
   * el mismo nombre en un semestre (las «Formación humana» del 2502) van por código, para que
   * no cambien de lugar de una consulta a otra.
   */
  async asignaturas(
    idUsuario: number,
    idPrograma: number,
  ): Promise<AsignaturaOpcionDto[]> {
    await this.exigirPrograma(idUsuario, idPrograma);
    const filas = await this.prisma.asignatura.findMany({
      where: { plan_estudio: { id_programa: idPrograma }, activo: true },
      include: { plan_estudio: true },
      orderBy: [
        { plan_estudio: { codigo: 'asc' } },
        { semestre: 'asc' },
        { nombre: 'asc' },
        { codigo_interno: 'asc' },
      ],
    });
    return filas.map((asignatura) => ({
      id: asignatura.id,
      codigo: asignatura.codigo_interno,
      nombre: asignatura.nombre ?? '',
      semestre: asignatura.semestre,
      planEstudio: {
        id: asignatura.plan_estudio.id,
        codigo: asignatura.plan_estudio.codigo,
        nombre: asignatura.plan_estudio.nombre,
      },
    }));
  }

  /**
   * Pasos 3 y 4: información institucional que se autocompleta (p5), período vigente y RAP
   * del programa, con los del mapeo curricular marcados.
   */
  async informacionAsignatura(
    idUsuario: number,
    idAsignatura: number,
  ): Promise<InformacionAsignaturaDto> {
    const asignatura = await this.prisma.asignatura.findFirst({
      where: { id: idAsignatura, activo: true },
      include: { ...INCLUIR_ASIGNATURA, asignatura_rap: true },
    });
    if (!asignatura) {
      throw new NotFoundException(MENSAJE_ASIGNATURA_NO_EXISTE);
    }
    // Los RAP siguen siendo del programa (SUP-16): se ofrecen todos los del programa del plan.
    const idPrograma = asignatura.plan_estudio.id_programa;
    await this.exigirPrograma(idUsuario, idPrograma);

    const [periodo, raps] = await Promise.all([
      this.periodoVigente(),
      this.prisma.rap.findMany({
        where: { id_programa: idPrograma, activo: true },
        orderBy: { numero: 'asc' },
      }),
    ]);
    const mapeados = new Set(
      asignatura.asignatura_rap
        .filter((relacion) => relacion.activo !== false)
        .map((relacion) => relacion.id_rap),
    );

    return {
      informacion: aInformacionInstitucional(asignatura),
      periodo: aPeriodo(periodo),
      raps: raps.map((rap) => ({
        id: rap.id,
        codigo: rap.codigo,
        numero: rap.numero,
        descripcion: rap.descripcion,
        mapeado: mapeados.has(rap.id),
      })),
    };
  }

  /** Docentes activos del programa que se pueden asignar al proyecto (HU-05-03). */
  async docentes(
    idUsuario: number,
    idPrograma: number,
  ): Promise<DocenteOpcionDto[]> {
    await this.exigirPrograma(idUsuario, idPrograma);
    const filas = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        usuario_rol_usuario_rol_id_usuarioTousuario: {
          some: filtroDocenteDelPrograma(idPrograma),
        },
      },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    });
    return filas.map((usuario) => ({
      id: usuario.id,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      correo: usuario.email ?? '',
    }));
  }

  /** RF-08, p6: proyecto ya creado para la asignatura, el período vigente y el grupo. */
  async proyectoExistente(
    idUsuario: number,
    idAsignatura: number,
    grupo: string | undefined,
  ): Promise<ProyectoExistenteDto> {
    const asignatura = await this.prisma.asignatura.findFirst({
      where: { id: idAsignatura, activo: true },
      select: { plan_estudio: { select: { id_programa: true } } },
    });
    if (!asignatura) {
      throw new NotFoundException(MENSAJE_ASIGNATURA_NO_EXISTE);
    }
    await this.exigirPrograma(idUsuario, asignatura.plan_estudio.id_programa);
    const periodo = await this.periodoVigente();
    if (!periodo) {
      return { proyecto: null };
    }
    const proyecto = await this.prisma.proyecto_docente.findFirst({
      where: {
        id_asignatura: idAsignatura,
        id_periodo: periodo.id,
        grupo: grupo ?? null,
      },
      include: INCLUIR_RESUMEN,
    });
    return { proyecto: proyecto ? aResumen(proyecto) : null };
  }

  /**
   * Período académico vigente: activo y sin cerrar. Si por error hubiera más de uno, se toma
   * el que empieza más tarde.
   */
  periodoVigente() {
    return this.prisma.periodo_academico.findFirst({
      where: { activo: true, cerrado: false },
      orderBy: { fecha_inicio: 'desc' },
    });
  }

  /** Niega el programa si no existe, está inactivo o el usuario no es su Departamento. */
  async exigirPrograma(
    idUsuario: number,
    idPrograma: number | null,
  ): Promise<void> {
    const programa =
      idPrograma === null
        ? null
        : await this.prisma.programa.findFirst({
            where: { id: idPrograma, activo: true },
          });
    if (!programa) {
      throw new NotFoundException(MENSAJE_PROGRAMA_NO_EXISTE);
    }
    if (
      !(await this.alcance.alcanzaPrograma(
        idUsuario,
        ROLES_CREACION,
        programa.id,
      ))
    ) {
      throw new ForbiddenException(MENSAJE_PROGRAMA_FUERA_DE_ALCANCE);
    }
  }
}

/** Rol Docente responsable vigente en el programa (o sin programa, de alcance global). */
export function filtroDocenteDelPrograma(idPrograma: number) {
  return {
    activo: true,
    fecha_revocacion: null,
    rol: { is: { activo: true, nombre: ROL.docente } },
    OR: [{ id_programa: idPrograma }, { id_programa: null }],
  };
}
