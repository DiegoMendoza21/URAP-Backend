import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { porcentaje } from '../mediciones/consolidado.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import { fechaDeHoy } from '../sesiones/alertas.js';
import { aTextoFecha } from '../sesiones/calendario.js';
import {
  ESTADO_REGISTRADA,
  SESION_VIGENTE,
} from '../sesiones/sesiones.service.js';
import type {
  ConsultarContribucionDto,
  ConsultarCumplimientoDto,
  RapContribucionDto,
  ReporteContribucionDto,
  ReporteCumplimientoDto,
  ResumenCumplimientoDto,
} from './dto/academicos.dto.js';
import type {
  ConsultarEjecucionDto,
  CursoEjecucionDto,
  ReporteEjecucionDto,
  ResumenEjecucionDto,
} from './dto/ejecucion.dto.js';
import type { ProyectoSeguimientoDto } from './dto/seguimiento.dto.js';
import {
  ejecucionDelCurso,
  ETIQUETA_ESTADO_TEMA,
  type SesionCalendario,
  type TemaMarcado,
  type TemaPlaneado,
} from './ejecucion-contenidos.js';
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
  type FilasExportacion,
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
  ejecucion: 'ejecucion_contenidos',
} as const;

/** HU-12-04: el máximo exportable cuenta las filas de temas del archivo. */
export const FILAS_TEMAS: FilasExportacion = {
  unidad: 'temas',
  filtros: 'programa o asignatura',
};

/**
 * Reportes académicos (RF-28):
 * - Cumplimiento por período (HU-12-03): los proyectos, su estado y su diligenciamiento, con
 *   las mismas reglas del tablero de seguimiento (RF-25). Para el Administrador, el
 *   Departamento y la Dirección, sobre su programa.
 * - Ejecución de contenidos (HU-12-04): por curso, los temas planeados en el punto 6 frente a
 *   los marcados en las clases registradas (ver `ejecucion-contenidos.ts`). Con los roles y el
 *   alcance del de cumplimiento: es un reporte del programa.
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
    private readonly auditoria: AuditoriaService,
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

  /** HU-12-04: temas planeados, dictados, no dictados y adicionales, por curso. */
  ejecucion(
    usuario: UsuarioSesion,
    consulta: ConsultarEjecucionDto,
  ): Promise<ReporteEjecucionDto> {
    return this.generarEjecucion(usuario, consulta, false);
  }

  /**
   * Arma el reporte de ejecución y registra su generación. Los cursos y el alcance son los del
   * tablero de seguimiento (RF-25), como en el reporte de cumplimiento. Al exportar, antes de
   * registrar, comprueba el máximo de filas con las filas de temas que lleva el archivo.
   */
  private async generarEjecucion(
    usuario: UsuarioSesion,
    consulta: ConsultarEjecucionDto,
    exportar: boolean,
  ): Promise<ReporteEjecucionDto> {
    const { periodo, filas } = await this.seguimiento.consultar(
      usuario,
      consulta,
    );
    const ids = filas.map((fila) => fila.idProyecto);
    const [contenidos, sesiones] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            this.prisma.contenido_programatico.findMany({
              where: { id_proyecto_docente: { in: ids } },
              select: {
                id: true,
                id_proyecto_docente: true,
                semana: true,
                tema: true,
              },
            }),
            this.prisma.sesion_clase.findMany({
              where: { id_proyecto_docente: { in: ids }, ...SESION_VIGENTE },
              select: {
                id_proyecto_docente: true,
                semana: true,
                fecha: true,
                estado: true,
                sesion_tema: {
                  select: { id_contenido: true, tema_adicional: true },
                },
              },
            }),
          ]);

    const planeadosPor = new Map<number, TemaPlaneado[]>();
    for (const contenido of contenidos) {
      const id = contenido.id_proyecto_docente as number;
      planeadosPor.set(id, [
        ...(planeadosPor.get(id) ?? []),
        {
          idContenido: contenido.id,
          semana: contenido.semana,
          tema: contenido.tema,
        },
      ]);
    }
    const calendarioPor = new Map<number, SesionCalendario[]>();
    const marcadosPor = new Map<number, TemaMarcado[]>();
    for (const sesion of sesiones) {
      const id = sesion.id_proyecto_docente as number;
      const fecha = sesion.fecha ? aTextoFecha(sesion.fecha) : null;
      calendarioPor.set(id, [
        ...(calendarioPor.get(id) ?? []),
        // La semana y la fecha las asignó el calendario de RF-19, que no cuenta el receso.
        {
          semana: sesion.semana,
          fecha,
          registrada: sesion.estado === ESTADO_REGISTRADA,
        },
      ]);
      marcadosPor.set(id, [
        ...(marcadosPor.get(id) ?? []),
        ...sesion.sesion_tema.map((tema) => ({
          idContenido: tema.id_contenido,
          temaAdicional: tema.tema_adicional,
          fecha,
        })),
      ]);
    }

    const hoy = fechaDeHoy();
    const cursos: CursoEjecucionDto[] = filas.map((fila) => ({
      idProyecto: fila.idProyecto,
      asignatura: fila.asignatura,
      grupo: fila.grupo,
      programa: fila.programa,
      docentes: fila.docentes,
      estado: fila.estado,
      ...ejecucionDelCurso(
        planeadosPor.get(fila.idProyecto) ?? [],
        marcadosPor.get(fila.idProyecto) ?? [],
        calendarioPor.get(fila.idProyecto) ?? [],
        hoy,
      ),
    }));

    if (exportar) {
      await this.seguimiento.exigirTamanoExportable(
        filasExportables(cursos),
        FILAS_TEMAS,
      );
    }
    const generado = new Date();
    await this.registrar(usuario.id, {
      tipo: TIPO_REPORTE.ejecucion,
      nombre: `Ejecución de contenidos del período ${periodo?.codigo ?? 'sin definir'}`,
      idPrograma: consulta.idPrograma ?? null,
      idPeriodo: periodo?.id ?? null,
      parametros: { ...consulta, cursos: cursos.length },
      fecha: generado,
    });
    return {
      periodo,
      generado: generado.toISOString(),
      resumen: resumenEjecucion(cursos),
      cursos,
    };
  }

  async ejecucionExcel(
    usuario: UsuarioSesion,
    consulta: ConsultarEjecucionDto,
  ): Promise<ArchivoExcel> {
    const reporte = await this.generarEjecucion(usuario, consulta, true);
    const { resumen } = reporte;
    const curso = (fila: CursoEjecucionDto) => [
      fila.asignatura,
      fila.grupo,
      fila.docentes.join(', '),
    ];
    const datos = [
      [titulo('Reporte de ejecución de contenidos')],
      [`Período académico ${reporte.periodo?.codigo ?? 'sin definir'}`],
      [`Generado el ${fechaGeneracion(new Date(reporte.generado))}`],
      [],
      encabezado(['Indicador', 'Valor']),
      ['Cursos', numero(resumen.cursos, false)],
      ['Temas planeados', numero(resumen.planeados, false)],
      ['Temas dictados', numero(resumen.dictados, false)],
      ['% de temas dictados', numero(resumen.porcentajeDictados)],
      ['Temas no dictados', numero(resumen.noDictados, false)],
      ['Temas por dictar', numero(resumen.porDictar, false)],
      ['Temas adicionales no planeados', numero(resumen.adicionales, false)],
      [],
      encabezado([
        'Asignatura',
        'Grupo',
        'Docentes',
        'Clases registradas',
        'Planeados',
        'Dictados',
        '% dictados',
        'No dictados',
        'Por dictar',
        'Adicionales',
      ]),
      ...reporte.cursos.map((fila) => [
        ...curso(fila),
        // Sin clases registradas, el reporte no puede saber qué se dictó: se dice en vez de un 0.
        fila.clasesRegistradas > 0
          ? numero(fila.clasesRegistradas, false)
          : fila.sesiones > 0
            ? 'Ninguna todavía'
            : 'Sin calendario todavía',
        numero(fila.planeados, false),
        numero(fila.dictados, false),
        numero(fila.porcentajeDictados),
        numero(fila.noDictados, false),
        numero(fila.porDictar, false),
        numero(fila.adicionales, false),
      ]),
      [],
      encabezado([
        'Asignatura',
        'Grupo',
        'Docentes',
        'Semana',
        'Tema',
        'Estado',
        'Fechas en que se dictó',
      ]),
      ...reporte.cursos.flatMap((fila) => [
        ...fila.temas.map((tema) => [
          ...curso(fila),
          numero(tema.semana, false),
          textoLargo(tema.tema),
          ETIQUETA_ESTADO_TEMA[tema.estado],
          tema.fechas.join(', ') || null,
        ]),
        ...fila.temasAdicionales.map((tema) => [
          ...curso(fila),
          null,
          textoLargo(tema.tema),
          'Adicional no planeado',
          tema.fechas.join(', ') || null,
        ]),
      ]),
    ];
    return {
      nombreArchivo: `ejecucion-contenidos-${nombreSeguro(reporte.periodo?.codigo ?? 'sin-periodo')}.xlsx`,
      contenido: await libro([
        {
          sheet: 'Ejecución de contenidos',
          data: datos,
          columns: [
            { width: 34 },
            { width: 10 },
            { width: 28 },
            { width: 11 },
            { width: 40 },
            { width: 14 },
            { width: 24 },
            { width: 11 },
            { width: 11 },
            { width: 12 },
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
   * `reporte_academico`, y la creación de esa fila en la auditoría (AuditoriaService, con la IP).
   * Un fallo al registrar no impide entregar el reporte.
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
    let idReporte: number;
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
      idReporte = reporte.id;
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la generación del reporte «${datos.tipo}».`,
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }
    // Después de confirmar la fila; AuditoriaService nunca lanza (RF-29, excepción de p3).
    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: 'reporte_academico',
      idRegistro: idReporte,
      valorNuevo: { tipo: datos.tipo, parametros: datos.parametros },
    });
  }
}

/** Filas de temas que lleva la exportación: las que cuenta el máximo exportable (RF-25, p5). */
export function filasExportables(cursos: readonly CursoEjecucionDto[]): number {
  return suma(
    cursos,
    (curso) => curso.temas.length + curso.temasAdicionales.length,
  );
}

/** El resumen suma temas de todos los cursos: no promedia porcentajes. */
export function resumenEjecucion(
  cursos: readonly CursoEjecucionDto[],
): ResumenEjecucionDto {
  const planeados = suma(cursos, (curso) => curso.planeados);
  const dictados = suma(cursos, (curso) => curso.dictados);
  return {
    cursos: cursos.length,
    planeados,
    dictados,
    noDictados: suma(cursos, (curso) => curso.noDictados),
    porDictar: suma(cursos, (curso) => curso.porDictar),
    adicionales: suma(cursos, (curso) => curso.adicionales),
    porcentajeDictados:
      planeados === 0 ? null : porcentaje(dictados, planeados),
  };
}

function suma<T>(filas: readonly T[], valor: (fila: T) => number): number {
  return filas.reduce((total, fila) => total + valor(fila), 0);
}
