import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { porcentaje } from '../mediciones/consolidado.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import type {
  ConsultarContribucionDto,
  ConsultarCumplimientoDto,
  RapContribucionDto,
  ReporteContribucionDto,
  ReporteCumplimientoDto,
  ResumenCumplimientoDto,
} from './dto/academicos.dto.js';
import type { ProyectoSeguimientoDto } from './dto/seguimiento.dto.js';
import {
  type ArchivoExcel,
  encabezado,
  fechaGeneracion,
  libro,
  nombreSeguro,
  numero,
  textoLargo,
  titulo,
} from './excel.js';
import { ReportesService, ROLES_PROGRAMA } from './reportes.service.js';
import {
  contarPendientes,
  ETIQUETA_COLOR,
  nombreCompleto,
  SeguimientoService,
} from './seguimiento.service.js';

/** El líder RAP puede haber liderado el RAP en otro período: por eso se nombra el período. */
export const MENSAJE_RAP_NO_EXISTE =
  'El RAP no existe o no tiene acceso a él en el período seleccionado.';

/** Grupo del resumen por estado para los proyectos que todavía no tienen estado. */
export const SIN_ESTADO = {
  codigo: 'sin_estado',
  nombre: 'Sin estado',
} as const;

/** `reporte_academico.tipo` de cada reporte (RF-28, p6). */
export const TIPO_REPORTE = {
  cumplimiento: 'cumplimiento_periodo',
  contribucion: 'contribucion_rac_rap',
} as const;

/**
 * Reportes académicos (RF-28):
 * - Cumplimiento por período (HU-12-03): los proyectos, su estado y su diligenciamiento, con
 *   las mismas reglas del tablero de seguimiento (RF-25). Para el Administrador, el
 *   Departamento y la Dirección, sobre su programa.
 * - Contribución de los RAC a los RAP (HU-12-05): por RAP, las asignaturas del período que
 *   contribuyen, sus docentes, sus RAC asociados y las evidencias cargadas. El Líder RAP solo
 *   ve los RAP que lidera en el período; los roles de programa, los de su programa.
 *
 * Cada reporte generado queda registrado en `reporte_academico`, con el usuario y la fecha
 * (RF-28, p6), y en la auditoría.
 */
@Injectable()
export class ReportesAcademicosService {
  private readonly logger = new Logger(ReportesAcademicosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly seguimiento: SeguimientoService,
    private readonly reportes: ReportesService,
  ) {}

  /** HU-12-03: proyectos, estados y diligenciamiento del período. */
  cumplimiento(
    usuario: UsuarioSesion,
    consulta: ConsultarCumplimientoDto,
  ): Promise<ReporteCumplimientoDto> {
    return this.generarCumplimiento(usuario, consulta, false);
  }

  /**
   * Arma el reporte de cumplimiento y registra su generación. Al exportar, antes de registrar,
   * comprueba que no supere el máximo de filas (RF-25, excepción de p5).
   */
  private async generarCumplimiento(
    usuario: UsuarioSesion,
    consulta: ConsultarCumplimientoDto,
    exportar: boolean,
  ): Promise<ReporteCumplimientoDto> {
    const { estado, ...filtros } = consulta;
    const { periodo, filas } = await this.seguimiento.consultar(
      usuario,
      filtros,
      estado ? { estado_proyecto: { is: { codigo: estado } } } : {},
    );
    if (exportar) {
      await this.seguimiento.exigirTamanoExportable(filas.length);
    }
    const generado = new Date();
    await this.registrar(usuario.id, {
      tipo: TIPO_REPORTE.cumplimiento,
      nombre: `Cumplimiento del período ${periodo?.codigo ?? 'sin definir'}`,
      idPrograma: consulta.idPrograma ?? null,
      idPeriodo: periodo?.id ?? null,
      parametros: { ...consulta, proyectos: filas.length },
      fecha: generado,
    });
    return {
      periodo,
      generado: generado.toISOString(),
      resumen: await this.resumen(filas),
      proyectos: filas,
    };
  }

  async cumplimientoExcel(
    usuario: UsuarioSesion,
    consulta: ConsultarCumplimientoDto,
  ): Promise<ArchivoExcel> {
    const reporte = await this.generarCumplimiento(usuario, consulta, true);
    const { resumen } = reporte;
    const datos = [
      [titulo('Reporte de cumplimiento del diligenciamiento')],
      [`Período académico ${reporte.periodo?.codigo ?? 'sin definir'}`],
      [`Generado el ${fechaGeneracion(new Date(reporte.generado))}`],
      [],
      encabezado(['Indicador', 'Valor']),
      ['Proyectos docentes', numero(resumen.proyectos, false)],
      ...resumen.porEstado.map((fila) => [
        `Estado: ${fila.nombre}`,
        numero(fila.cantidad, false),
      ]),
      [
        'Secciones completas',
        `${resumen.seccionesCompletas} de ${resumen.seccionesTotales}`,
      ],
      ['% de secciones completas', numero(resumen.porcentajeSecciones)],
      [
        'Sesiones registradas',
        `${resumen.sesionesRegistradas} de ${resumen.sesionesProgramadas}`,
      ],
      ['% de sesiones registradas', numero(resumen.porcentajeSesiones)],
      ['Proyectos con pendientes', numero(resumen.conPendientes, false)],
      [],
      encabezado([
        'Asignatura',
        'Grupo',
        'Programa',
        'Docentes',
        'Estado',
        'Secciones completas',
        '% de secciones',
        'Secciones pendientes',
        'Sesiones registradas',
        'Sesiones programadas',
        'Vencidas',
        'Color',
      ]),
      ...reporte.proyectos.map((fila) => [
        fila.asignatura,
        fila.grupo,
        fila.programa,
        fila.docentes.join(', '),
        fila.estado?.nombre ?? null,
        `${fila.secciones.completas} de ${fila.secciones.total}`,
        numero(fila.secciones.porcentaje),
        textoLargo(fila.secciones.incompletas.join('; ')),
        numero(fila.sesiones.registradas, false),
        numero(fila.sesiones.programadas, false),
        numero(fila.sesiones.vencidas + fila.sesiones.incumplidas, false),
        ETIQUETA_COLOR[fila.color],
      ]),
    ];
    return {
      nombreArchivo: `cumplimiento-${nombreSeguro(reporte.periodo?.codigo ?? 'sin-periodo')}.xlsx`,
      contenido: await libro([
        {
          sheet: 'Cumplimiento',
          data: datos,
          columns: [
            { width: 34 },
            { width: 14 },
            { width: 26 },
            { width: 28 },
            { width: 22 },
            { width: 12 },
            { width: 12 },
            { width: 40 },
            { width: 12 },
            { width: 12 },
            { width: 10 },
            { width: 28 },
          ],
        },
      ]),
    };
  }

  /** HU-12-05: contribución de los RAC a los RAP, por RAP. */
  async contribucion(
    usuario: UsuarioSesion,
    { idPeriodo, idRap }: ConsultarContribucionDto,
  ): Promise<ReporteContribucionDto> {
    const periodo = await this.seguimiento.periodo(idPeriodo);
    const generado = new Date();
    if (!periodo) {
      return { periodo, generado: generado.toISOString(), raps: [] };
    }
    const visibles = await this.rapsVisibles(usuario, periodo.id);
    if (!visibles) {
      if (idRap) {
        throw new NotFoundException(MENSAJE_RAP_NO_EXISTE);
      }
      return { periodo, generado: generado.toISOString(), raps: [] };
    }
    const raps = await this.prisma.rap.findMany({
      where: { AND: [visibles, { activo: true }, idRap ? { id: idRap } : {}] },
      select: {
        id: true,
        codigo: true,
        numero: true,
        descripcion: true,
        proyecto_docente_rap: {
          where: { proyecto_docente: { is: { id_periodo: periodo.id } } },
          select: {
            proyecto_docente: {
              select: {
                id: true,
                grupo: true,
                asignatura: { select: { nombre: true } },
                estado_proyecto: { select: { codigo: true, nombre: true } },
                proyecto_docente_docente: {
                  select: {
                    usuario: { select: { nombres: true, apellidos: true } },
                  },
                  orderBy: [{ responsable: 'desc' }, { orden: 'asc' }],
                },
                rac: {
                  select: {
                    codigo: true,
                    descripcion: true,
                    rac_rap: {
                      select: { id_rap: true, descripcion_contribucion: true },
                    },
                  },
                  orderBy: [{ orden: 'asc' }, { id: 'asc' }],
                },
              },
            },
          },
        },
      },
      orderBy: [{ id_programa: 'asc' }, { numero: 'asc' }],
    });
    if (idRap && raps.length === 0) {
      throw new NotFoundException(MENSAJE_RAP_NO_EXISTE);
    }

    const idsProyecto = raps.flatMap((rap) =>
      rap.proyecto_docente_rap.map((fila) => fila.proyecto_docente.id),
    );
    const evidencias =
      idsProyecto.length === 0
        ? []
        : await this.prisma.evidencia_rap.groupBy({
            by: ['id_proyecto_docente', 'id_rap'],
            where: {
              id_proyecto_docente: { in: idsProyecto },
              id_rap: { in: raps.map((rap) => rap.id) },
            },
            _count: { _all: true },
            _max: { fecha_subida: true },
          });
    const evidenciasPor = new Map(
      evidencias.map((fila) => [
        `${fila.id_proyecto_docente}:${fila.id_rap}`,
        fila,
      ]),
    );

    const resultado: RapContribucionDto[] = raps.map((rap) => ({
      id: rap.id,
      codigo: rap.codigo,
      numero: rap.numero,
      descripcion: rap.descripcion,
      asignaturas: rap.proyecto_docente_rap
        .map(({ proyecto_docente: proyecto }) => {
          const evidencia = evidenciasPor.get(`${proyecto.id}:${rap.id}`);
          return {
            idProyecto: proyecto.id,
            asignatura: proyecto.asignatura?.nombre ?? 'Asignatura sin nombre',
            grupo: proyecto.grupo,
            docentes: proyecto.proyecto_docente_docente
              .map((fila) => nombreCompleto(fila.usuario))
              .filter(Boolean),
            estado: proyecto.estado_proyecto
              ? {
                  codigo: proyecto.estado_proyecto.codigo ?? '',
                  nombre: proyecto.estado_proyecto.nombre ?? '',
                }
              : null,
            racs: proyecto.rac.flatMap((rac) => {
              const relacion = rac.rac_rap.find(
                (fila) => fila.id_rap === rap.id,
              );
              return relacion
                ? [
                    {
                      codigo: rac.codigo,
                      descripcion: rac.descripcion,
                      contribucion: relacion.descripcion_contribucion,
                    },
                  ]
                : [];
            }),
            evidencias: evidencia?._count._all ?? 0,
            ultimaEvidencia:
              evidencia?._max.fecha_subida?.toISOString() ?? null,
          };
        })
        .sort((a, b) => a.asignatura.localeCompare(b.asignatura, 'es')),
    }));

    await this.registrar(usuario.id, {
      tipo: TIPO_REPORTE.contribucion,
      nombre: `Contribución RAC-RAP del período ${periodo.codigo}`,
      idPrograma: null,
      idPeriodo: periodo.id,
      parametros: { idPeriodo: periodo.id, idRap: idRap ?? null },
      fecha: generado,
    });
    return { periodo, generado: generado.toISOString(), raps: resultado };
  }

  async contribucionExcel(
    usuario: UsuarioSesion,
    consulta: ConsultarContribucionDto,
  ): Promise<ArchivoExcel> {
    const reporte = await this.contribucion(usuario, consulta);
    const filas = reporte.raps.flatMap((rap) => {
      const nombre = rap.codigo ?? `RAP ${rap.numero ?? ''}`;
      if (rap.asignaturas.length === 0) {
        return [
          [nombre, 'Ninguna asignatura del período contribuye a este RAP'],
        ];
      }
      return rap.asignaturas.map((asignatura) => [
        nombre,
        asignatura.asignatura,
        asignatura.grupo,
        asignatura.docentes.join(', '),
        asignatura.estado?.nombre ?? null,
        textoLargo(
          asignatura.racs
            .map((rac) =>
              [rac.codigo, rac.descripcion].filter(Boolean).join(': '),
            )
            .join('\n') || 'Sin RAC asociados',
        ),
        textoLargo(
          asignatura.racs
            .map((rac) => rac.contribucion)
            .filter(Boolean)
            .join('\n') || null,
        ),
        numero(asignatura.evidencias, false),
      ]);
    });
    return {
      nombreArchivo: `contribucion-rac-rap-${nombreSeguro(reporte.periodo?.codigo ?? 'sin-periodo')}.xlsx`,
      contenido: await libro([
        {
          sheet: 'Contribución RAC-RAP',
          data: [
            [titulo('Reporte de contribución de los RAC a los RAP')],
            [`Período académico ${reporte.periodo?.codigo ?? 'sin definir'}`],
            [`Generado el ${fechaGeneracion(new Date(reporte.generado))}`],
            [],
            encabezado([
              'RAP',
              'Asignatura',
              'Grupo',
              'Docentes',
              'Estado',
              'RAC relacionados',
              'Contribución',
              'Evidencias',
            ]),
            ...filas,
          ],
          columns: [
            { width: 10 },
            { width: 34 },
            { width: 8 },
            { width: 28 },
            { width: 20 },
            { width: 50 },
            { width: 40 },
            { width: 11 },
          ],
        },
      ]),
    };
  }

  /**
   * RAP que el usuario puede consultar en el período, como filtro de Prisma; nulo si ninguno.
   * Los roles de programa ven los RAP de su programa; el Líder RAP, los que lidera en el período.
   */
  private async rapsVisibles(
    usuario: UsuarioSesion,
    idPeriodo: number,
  ): Promise<Prisma.rapWhereInput | null> {
    const [{ global, programas }, liderazgos] = await Promise.all([
      this.alcance.alcance(usuario.id, ROLES_PROGRAMA),
      this.reportes.liderazgos(usuario),
    ]);
    if (global) {
      return {};
    }
    const liderados = [...liderazgos.entries()]
      .filter(([, periodos]) => periodos.has(null) || periodos.has(idPeriodo))
      .map(([id]) => id);
    const condiciones: Prisma.rapWhereInput[] = [];
    if (programas.length > 0) {
      condiciones.push({ id_programa: { in: programas } });
    }
    if (liderados.length > 0) {
      condiciones.push({ id: { in: liderados } });
    }
    return condiciones.length > 0 ? { OR: condiciones } : null;
  }

  private async resumen(
    filas: readonly ProyectoSeguimientoDto[],
  ): Promise<ResumenCumplimientoDto> {
    const estados = await this.prisma.estado_proyecto.findMany({
      select: { codigo: true, nombre: true },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
    const contar = (codigo: string | null) =>
      filas.filter((fila) => (fila.estado?.codigo ?? null) === codigo).length;
    const seccionesCompletas = suma(filas, (fila) => fila.secciones.completas);
    const seccionesTotales = suma(filas, (fila) => fila.secciones.total);
    const sesionesRegistradas = suma(
      filas,
      (fila) => fila.sesiones.registradas,
    );
    const sesionesProgramadas = suma(
      filas,
      (fila) => fila.sesiones.programadas,
    );
    // Los proyectos sin estado van en su propio grupo, para que la suma dé el total.
    return {
      proyectos: filas.length,
      porEstado: [
        ...estados
          .filter((estado) => estado.codigo)
          .map((estado) => ({
            codigo: estado.codigo as string,
            nombre: estado.nombre ?? (estado.codigo as string),
            cantidad: contar(estado.codigo),
          })),
        { ...SIN_ESTADO, cantidad: contar(null) },
      ].filter((estado) => estado.cantidad > 0),
      seccionesCompletas,
      seccionesTotales,
      porcentajeSecciones:
        seccionesTotales === 0
          ? null
          : porcentaje(seccionesCompletas, seccionesTotales),
      sesionesRegistradas,
      sesionesProgramadas,
      porcentajeSesiones:
        sesionesProgramadas === 0
          ? null
          : porcentaje(sesionesRegistradas, sesionesProgramadas),
      conPendientes: contarPendientes(filas),
    };
  }

  /**
   * RF-28, p6: registra la generación del reporte, con el usuario y la fecha, en
   * `reporte_academico` y en la auditoría. Un fallo al registrar no impide entregar el reporte.
   */
  private async registrar(
    idUsuario: number,
    datos: {
      tipo: string;
      nombre: string;
      idPrograma: number | null;
      idPeriodo: number | null;
      parametros: Prisma.InputJsonValue;
      fecha: Date;
    },
  ): Promise<void> {
    try {
      const reporte = await this.prisma.reporte_academico.create({
        data: {
          id_generado_por: idUsuario,
          id_programa: datos.idPrograma,
          id_periodo: datos.idPeriodo,
          tipo: datos.tipo,
          nombre: datos.nombre,
          parametros: datos.parametros,
          fecha_generacion: datos.fecha,
        },
        select: { id: true },
      });
      await this.prisma.auditoria.create({
        data: {
          id_usuario: idUsuario,
          accion: 'generar_reporte',
          tabla_afectada: 'reporte_academico',
          id_registro: reporte.id,
          valor_nuevo: { tipo: datos.tipo, parametros: datos.parametros },
          fecha: datos.fecha,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la generación del reporte «${datos.tipo}».`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function suma<T>(filas: readonly T[], valor: (fila: T) => number): number {
  return filas.reduce((total, fila) => total + valor(fila), 0);
}
