import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import writeXlsxFile, { type Row } from 'write-excel-file/node';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ESTADO_MEDICION,
  PERIODO_TOMA,
  TIPO_VALORACION,
} from '../mediciones/constantes.js';
import { ConsolidadoService } from '../mediciones/consolidado.service.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import type {
  AsignaturaEvaluadaDto,
  ComparacionPeriodoDto,
  ConsultarLogroRapDto,
  FiltrosLogroRapDto,
  RapReporteDto,
  ReporteLogroRapDto,
} from './dto/logro-rap.dto.js';

export const MENSAJE_PROGRAMA_NO_EXISTE =
  'El programa no existe o no tiene acceso a sus reportes.';
export const MENSAJE_PERIODO_NO_EXISTE = 'El período académico no existe.';
export const MENSAJE_RAP_NO_EXISTE =
  'El RAP no existe en el programa o no tiene acceso a él.';
export const MOTIVO_SIN_PERIODOS_ANTERIORES =
  'No hay mediciones cerradas de este RAP en períodos anteriores: no hay con qué comparar.';

/** Roles que consultan el reporte con alcance de programa (matriz de `URAP-34`, «Reportes»). */
const ROLES_PROGRAMA = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
] as const;

/** RAP que un líder lidera, por período (nulo: todos los períodos). */
type Liderazgos = Map<number, Set<number | null>>;

const SELECCION_MEDICION = {
  id: true,
  id_rap: true,
  tipo_valoracion: true,
  periodo_toma: true,
  anio_toma: true,
  acciones_implementadas: true,
  resultados_obtenidos: true,
  acciones_propuestas: true,
  proyecto_docente: {
    select: {
      id_periodo: true,
      grupo: true,
      asignatura: { select: { nombre: true } },
      periodo_academico: { select: { codigo: true, fecha_inicio: true } },
      proyecto_docente_docente: {
        select: { usuario: { select: { nombres: true, apellidos: true } } },
        orderBy: [{ responsable: 'desc' }, { orden: 'asc' }],
      },
    },
  },
} satisfies Prisma.medicion_rapSelect;

type MedicionReporte = Prisma.medicion_rapGetPayload<{
  select: typeof SELECCION_MEDICION;
}>;

/**
 * Reporte de logro de los RAP del programa (RF-32, HU-11-08). Consolida las mediciones
 * cerradas del período: por cada RAP, las asignaturas que lo evaluaron y su porcentaje en los
 * niveles de cumplimiento frente al esperado, y la comparación con los períodos anteriores.
 *
 * Quién lo consulta (matriz de `URAP-34`, fila «Reportes»): el Administrador, el Departamento
 * y la Dirección, sobre su programa; el Líder RAP, sobre los RAP que lidera en el período. El
 * Docente ve el consolidado de sus propias mediciones en la hoja de cada una.
 */
@Injectable()
export class ReportesService {
  private readonly logger = new Logger(ReportesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly consolidados: ConsolidadoService,
  ) {}

  /** RF-32, p1: programas, RAP y períodos que el usuario puede consultar. */
  async filtros(usuario: UsuarioSesion): Promise<FiltrosLogroRapDto> {
    const [{ global, programas }, liderazgos] = await Promise.all([
      this.alcance.alcance(usuario.id, ROLES_PROGRAMA),
      this.liderazgos(usuario),
    ]);
    const [filas, periodos] = await Promise.all([
      this.prisma.programa.findMany({
        where: {
          activo: true,
          ...(global
            ? {}
            : {
                OR: [
                  { id: { in: programas } },
                  { rap: { some: { id: { in: [...liderazgos.keys()] } } } },
                ],
              }),
        },
        select: {
          id: true,
          nombre: true,
          rap: {
            where: { activo: true },
            select: { id: true, codigo: true, numero: true },
            orderBy: { numero: 'asc' },
          },
        },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.periodo_academico.findMany({
        select: { id: true, codigo: true },
        orderBy: [{ fecha_inicio: 'desc' }, { codigo: 'desc' }],
      }),
    ]);
    return {
      programas: filas.map((programa) => ({
        id: programa.id,
        nombre: programa.nombre ?? 'Programa sin nombre',
        raps:
          global || programas.includes(programa.id)
            ? programa.rap
            : programa.rap.filter((rap) => liderazgos.has(rap.id)),
      })),
      periodos: periodos.map((periodo) => ({
        id: periodo.id,
        codigo: periodo.codigo ?? `Período ${periodo.id}`,
      })),
    };
  }

  async logroRap(
    usuario: UsuarioSesion,
    { idPrograma, idPeriodo, idRap }: ConsultarLogroRapDto,
  ): Promise<ReporteLogroRapDto> {
    const [programa, periodo, completo, liderazgos] = await Promise.all([
      this.prisma.programa.findUnique({
        where: { id: idPrograma },
        select: {
          id: true,
          nombre: true,
          escala_valoracion_programa_id_escala_activaToescala_valoracion: {
            select: { porcentaje_esperado: true },
          },
        },
      }),
      this.prisma.periodo_academico.findUnique({
        where: { id: idPeriodo },
        select: { id: true, codigo: true, fecha_inicio: true },
      }),
      this.alcance.alcanzaPrograma(usuario.id, ROLES_PROGRAMA, idPrograma),
      this.liderazgos(usuario),
    ]);
    if (!programa) {
      throw new NotFoundException(MENSAJE_PROGRAMA_NO_EXISTE);
    }
    if (!periodo) {
      throw new NotFoundException(MENSAJE_PERIODO_NO_EXISTE);
    }
    // El líder solo ve los RAP que lidera en el período consultado.
    const liderados = [...liderazgos.entries()]
      .filter(([, periodos]) => periodos.has(null) || periodos.has(idPeriodo))
      .map(([id]) => id);
    const raps = await this.prisma.rap.findMany({
      where: {
        id_programa: idPrograma,
        activo: true,
        ...(completo ? {} : { id: { in: liderados } }),
        ...(idRap ? { AND: [{ id: idRap }] } : {}),
      },
      select: { id: true, codigo: true, numero: true, descripcion: true },
      orderBy: { numero: 'asc' },
    });
    if (raps.length === 0) {
      throw new NotFoundException(
        idRap ? MENSAJE_RAP_NO_EXISTE : MENSAJE_PROGRAMA_NO_EXISTE,
      );
    }

    // RF-32, p2: solo mediciones cerradas, de cursos del programa.
    const mediciones = await this.prisma.medicion_rap.findMany({
      where: {
        estado: ESTADO_MEDICION.cerrada,
        id_rap: { in: raps.map((rap) => rap.id) },
        proyecto_docente: {
          is: { asignatura: { is: { id_programa: idPrograma } } },
        },
      },
      select: SELECCION_MEDICION,
      orderBy: { id: 'asc' },
    });
    const consolidados = await this.consolidados.deMediciones(
      mediciones.map((medicion) => medicion.id),
    );
    const esperadoActual =
      programa.escala_valoracion_programa_id_escala_activaToescala_valoracion
        ?.porcentaje_esperado ?? null;
    const porcentajeEsperado =
      esperadoActual === null ? null : Number(esperadoActual);

    const esAnterior = (medicion: MedicionReporte) =>
      anteriorA(medicion.proyecto_docente?.periodo_academico ?? null, periodo);

    const reporte: ReporteLogroRapDto = {
      programa: {
        id: programa.id,
        nombre: programa.nombre ?? 'Programa sin nombre',
      },
      periodo: { id: periodo.id, codigo: periodo.codigo ?? `${periodo.id}` },
      generado: new Date().toISOString(),
      metaDefinida: porcentajeEsperado !== null,
      raps: raps.map((rap): RapReporteDto => {
        const delRap = mediciones.filter(
          (medicion) => medicion.id_rap === rap.id,
        );
        const asignaturas = delRap
          .filter(
            (medicion) => medicion.proyecto_docente?.id_periodo === idPeriodo,
          )
          .map((medicion) =>
            aAsignatura(medicion, consolidados.get(medicion.id)),
          );
        const porcentaje = promedio(
          asignaturas.map((asignatura) => asignatura.porcentajeCumplimiento),
        );
        const comparacion = compararPeriodos(
          delRap.filter(esAnterior),
          consolidados,
        );
        return {
          ...rap,
          evaluado: asignaturas.length > 0,
          asignaturas,
          porcentajeCumplimiento: porcentaje,
          porcentajeEsperado,
          alcanzado:
            porcentaje === null || porcentajeEsperado === null
              ? null
              : porcentaje >= porcentajeEsperado,
          comparacion,
          motivoSinComparacion:
            comparacion.length === 0 ? MOTIVO_SIN_PERIODOS_ANTERIORES : null,
        };
      }),
    };

    await this.auditar(usuario.id, idPrograma, {
      idPeriodo,
      idRap: idRap ?? null,
    });
    return reporte;
  }

  /** RF-32, p5: el mismo reporte en un libro de Excel. */
  async excel(
    usuario: UsuarioSesion,
    consulta: ConsultarLogroRapDto,
  ): Promise<{ nombreArchivo: string; contenido: Buffer }> {
    const reporte = await this.logroRap(usuario, consulta);
    const titulo = (texto: string) => ({
      value: texto,
      fontWeight: 'bold' as const,
    });
    const encabezado = (textos: string[]): Row =>
      textos.map((texto) => ({
        value: texto,
        fontWeight: 'bold' as const,
        backgroundColor: '#E2E8F0',
        wrap: true,
      }));
    const numero = (valor: number | null) =>
      valor === null ? null : { value: valor, type: Number, format: '0.00' };
    const resultado = (alcanzado: boolean | null) =>
      alcanzado === null
        ? reporte.metaDefinida
          ? 'Sin resultado'
          : 'Meta no definida por el programa'
        : alcanzado
          ? 'Alcanzado'
          : 'No alcanzado';

    const resumen: Row[] = [
      [titulo(`Reporte de logro de los RAP · ${reporte.programa.nombre}`)],
      [`Período académico ${reporte.periodo.codigo}`],
      [
        `Generado el ${new Date(reporte.generado).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
      ],
      [],
      encabezado([
        'RAP',
        'Asignatura',
        'Grupo',
        'Docentes',
        'Valoración',
        'Muestra',
        '% en niveles de cumplimiento',
        '% esperado',
        'Resultado',
        'Acciones implementadas',
        'Resultados obtenidos',
        'Acciones propuestas',
      ]),
    ];
    for (const rap of reporte.raps) {
      const nombre = rap.codigo ?? `RAP ${rap.numero ?? ''}`;
      if (!rap.evaluado) {
        resumen.push([nombre, 'No evaluado en el período']);
        continue;
      }
      for (const asignatura of rap.asignaturas) {
        resumen.push([
          nombre,
          asignatura.asignatura,
          asignatura.grupo,
          asignatura.docentes.join(', '),
          asignatura.tipoValoracion === TIPO_VALORACION.sumativa
            ? 'Sumativa'
            : 'Formativa',
          { value: asignatura.tamanoMuestra, type: Number },
          numero(asignatura.porcentajeCumplimiento),
          numero(asignatura.porcentajeEsperado),
          resultado(asignatura.alcanzado),
          { value: asignatura.accionesImplementadas ?? undefined, wrap: true },
          { value: asignatura.resultadosObtenidos ?? undefined, wrap: true },
          { value: asignatura.accionesPropuestas ?? undefined, wrap: true },
        ]);
      }
      resumen.push([
        { value: `${nombre} · promedio del período`, fontWeight: 'bold' },
        null,
        null,
        null,
        null,
        null,
        numero(rap.porcentajeCumplimiento),
        numero(rap.porcentajeEsperado),
        resultado(rap.alcanzado),
      ]);
    }

    const indicadores: Row[] = [
      encabezado([
        'RAP',
        'Asignatura',
        'Grupo',
        'Indicador',
        'Instrumento',
        'Muestra',
        '% en niveles de cumplimiento',
      ]),
    ];
    for (const rap of reporte.raps) {
      for (const asignatura of rap.asignaturas) {
        for (const indicador of asignatura.indicadores) {
          indicadores.push([
            rap.codigo ?? `RAP ${rap.numero ?? ''}`,
            asignatura.asignatura,
            asignatura.grupo,
            { value: indicador.numero ?? undefined, type: Number },
            indicador.instrumento,
            { value: indicador.muestra, type: Number },
            numero(indicador.porcentajeCumplimiento),
          ]);
        }
      }
    }

    const comparacion: Row[] = [
      encabezado([
        'RAP',
        'Período',
        '% en niveles de cumplimiento',
        'Mediciones',
      ]),
    ];
    for (const rap of reporte.raps) {
      const nombre = rap.codigo ?? `RAP ${rap.numero ?? ''}`;
      if (rap.comparacion.length === 0) {
        comparacion.push([nombre, rap.motivoSinComparacion]);
      }
      for (const fila of rap.comparacion) {
        comparacion.push([
          nombre,
          fila.periodo,
          numero(fila.porcentajeCumplimiento),
          { value: fila.mediciones, type: Number },
        ]);
      }
      if (rap.porcentajeCumplimiento !== null) {
        comparacion.push([
          nombre,
          `${reporte.periodo.codigo} (consultado)`,
          numero(rap.porcentajeCumplimiento),
          { value: rap.asignaturas.length, type: Number },
        ]);
      }
    }

    const contenido = await writeXlsxFile([
      {
        data: resumen,
        sheet: 'Logro por RAP',
        columns: [
          { width: 12 },
          { width: 36 },
          { width: 8 },
          { width: 28 },
          { width: 12 },
          { width: 10 },
          { width: 16 },
          { width: 12 },
          { width: 20 },
          { width: 40 },
          { width: 40 },
          { width: 40 },
        ],
      },
      {
        data: indicadores,
        sheet: 'Indicadores',
        columns: [
          { width: 12 },
          { width: 36 },
          { width: 8 },
          { width: 10 },
          { width: 36 },
          { width: 10 },
          { width: 16 },
        ],
      },
      {
        data: comparacion,
        sheet: 'Comparación',
        columns: [{ width: 12 }, { width: 60 }, { width: 16 }, { width: 12 }],
      },
    ]).toBuffer();

    return {
      nombreArchivo: `logro-rap-${nombreSeguro(reporte.periodo.codigo)}.xlsx`,
      contenido,
    };
  }

  /** RAP que lidera el usuario, con los períodos en que los lidera. */
  private async liderazgos(usuario: UsuarioSesion): Promise<Liderazgos> {
    const liderazgos: Liderazgos = new Map();
    if (!usuario.roles.includes(ROL.liderRap)) {
      return liderazgos;
    }
    const filas = await this.prisma.lider_rap.findMany({
      where: { id_usuario: usuario.id, activo: true, id_rap: { not: null } },
      select: { id_rap: true, id_periodo: true },
    });
    for (const { id_rap: idRap, id_periodo: idPeriodo } of filas) {
      const periodos = liderazgos.get(idRap as number) ?? new Set();
      periodos.add(idPeriodo);
      liderazgos.set(idRap as number, periodos);
    }
    return liderazgos;
  }

  /** Generar un reporte queda en la auditoría (RF-29); un fallo al auditar no lo impide. */
  private async auditar(
    idUsuario: number,
    idPrograma: number,
    valorNuevo: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: {
          id_usuario: idUsuario,
          accion: 'generar_reporte_logro_rap',
          tabla_afectada: 'programa',
          id_registro: idPrograma,
          valor_nuevo: valorNuevo,
          fecha: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar el reporte de logro del programa ${idPrograma}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function aAsignatura(
  medicion: MedicionReporte,
  consolidado:
    | {
        tamanoMuestra: number;
        porcentajeCumplimiento: number | null;
        porcentajeEsperado: number | null;
        alcanzado: boolean | null;
        indicadores: {
          numero: number | null;
          instrumento: string | null;
          muestra: number;
          porcentajeCumplimiento: number | null;
        }[];
      }
    | undefined,
): AsignaturaEvaluadaDto {
  const proyecto = medicion.proyecto_docente;
  return {
    idMedicion: medicion.id,
    asignatura: proyecto?.asignatura?.nombre ?? 'Asignatura sin nombre',
    grupo: proyecto?.grupo ?? null,
    docentes: (proyecto?.proyecto_docente_docente ?? [])
      .map((fila) =>
        [fila.usuario.nombres, fila.usuario.apellidos]
          .filter(Boolean)
          .join(' '),
      )
      .filter(Boolean),
    tipoValoracion:
      medicion.tipo_valoracion === TIPO_VALORACION.sumativa
        ? TIPO_VALORACION.sumativa
        : TIPO_VALORACION.formativa,
    periodoToma:
      medicion.periodo_toma === PERIODO_TOMA.primer
        ? PERIODO_TOMA.primer
        : PERIODO_TOMA.segundo,
    anioToma: medicion.anio_toma ?? 0,
    tamanoMuestra: consolidado?.tamanoMuestra ?? 0,
    porcentajeCumplimiento: consolidado?.porcentajeCumplimiento ?? null,
    porcentajeEsperado: consolidado?.porcentajeEsperado ?? null,
    alcanzado: consolidado?.alcanzado ?? null,
    indicadores: (consolidado?.indicadores ?? []).map((indicador) => ({
      numero: indicador.numero,
      instrumento: indicador.instrumento,
      muestra: indicador.muestra,
      porcentajeCumplimiento: indicador.porcentajeCumplimiento,
    })),
    accionesImplementadas: medicion.acciones_implementadas,
    resultadosObtenidos: medicion.resultados_obtenidos,
    accionesPropuestas: medicion.acciones_propuestas,
  };
}

/** RF-32, p4: promedio por período anterior, del más antiguo al más reciente. */
function compararPeriodos(
  anteriores: MedicionReporte[],
  consolidados: ReadonlyMap<number, { porcentajeCumplimiento: number | null }>,
): ComparacionPeriodoDto[] {
  const porPeriodo = new Map<
    string,
    { orden: number; codigo: string; porcentajes: number[] }
  >();
  for (const medicion of anteriores) {
    const periodo = medicion.proyecto_docente?.periodo_academico;
    const porcentaje = consolidados.get(medicion.id)?.porcentajeCumplimiento;
    if (!periodo?.codigo || porcentaje == null) {
      continue;
    }
    const grupo = porPeriodo.get(periodo.codigo) ?? {
      orden: periodo.fecha_inicio?.getTime() ?? 0,
      codigo: periodo.codigo,
      porcentajes: [],
    };
    grupo.porcentajes.push(porcentaje);
    porPeriodo.set(periodo.codigo, grupo);
  }
  return [...porPeriodo.values()]
    .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
    .map((grupo) => ({
      periodo: grupo.codigo,
      porcentajeCumplimiento: promedio(grupo.porcentajes) as number,
      mediciones: grupo.porcentajes.length,
    }));
}

/** Si el período de una medición es anterior al consultado: por fecha de inicio o por código. */
function anteriorA(
  periodo: { codigo: string | null; fecha_inicio: Date | null } | null,
  consultado: { codigo: string | null; fecha_inicio: Date | null },
): boolean {
  if (!periodo) {
    return false;
  }
  if (periodo.fecha_inicio && consultado.fecha_inicio) {
    return periodo.fecha_inicio.getTime() < consultado.fecha_inicio.getTime();
  }
  return (
    periodo.codigo !== null &&
    consultado.codigo !== null &&
    periodo.codigo < consultado.codigo
  );
}

/** Promedio con dos decimales de los valores no nulos; nulo si no hay ninguno. */
function promedio(valores: (number | null)[]): number | null {
  const presentes = valores.filter((valor): valor is number => valor !== null);
  if (presentes.length === 0) {
    return null;
  }
  const suma = presentes.reduce((total, valor) => total + valor, 0);
  return Math.round((suma * 100) / presentes.length) / 100;
}

function nombreSeguro(texto: string): string {
  return texto.replace(/[^A-Za-z0-9-]+/g, '-');
}
