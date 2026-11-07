import { Injectable, NotFoundException } from '@nestjs/common';
import type { Row } from 'write-excel-file/node';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ESTADO_MEDICION,
  PERIODO_TOMA,
  TIPO_VALORACION,
} from '../mediciones/constantes.js';
import {
  type Consolidado,
  juicio,
  logroDelRap,
} from '../mediciones/consolidado.js';
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
import {
  encabezado,
  fechaGeneracion,
  libro,
  nombreSeguro,
  numero,
  titulo,
} from './excel.js';

export const MENSAJE_PROGRAMA_NO_EXISTE =
  'El programa no existe o no tiene acceso a sus reportes.';
export const MENSAJE_PERIODO_NO_EXISTE = 'El período académico no existe.';
export const MENSAJE_RAP_NO_EXISTE =
  'El RAP no existe en el programa o no tiene acceso a él.';
export const MOTIVO_SIN_PERIODOS_ANTERIORES =
  'No hay mediciones cerradas de este RAP en períodos anteriores: no hay con qué comparar.';

/** Roles que consultan el reporte con alcance de programa (matriz de `URAP-34`, «Reportes»). */
export const ROLES_PROGRAMA = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
] as const;

/** RAP que un líder lidera, por período (nulo: todos los períodos). */
export type Liderazgos = Map<number, Set<number | null>>;

const SELECCION_MEDICION = {
  id: true,
  id_rap: true,
  tipo_valoracion: true,
  periodo_toma: true,
  anio_toma: true,
  acciones_implementadas: true,
  resultados_obtenidos: true,
  acciones_propuestas: true,
  rubrica: { select: { version: true } },
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
        // Se suman las valoraciones de todas las asignaturas: no se promedian porcentajes.
        const logro = logroDelRap(
          asignaturas.map((asignatura) => ({
            enCumplimiento: asignatura.valoracionesEnCumplimiento,
            valoraciones: asignatura.valoracionesTotales,
          })),
        );
        const esperado = esperadoDelRap(asignaturas, porcentajeEsperado);
        const versionesRubrica = versiones(
          asignaturas.map((asignatura) => asignatura.versionRubrica),
        );
        const comparacion = compararPeriodos(
          delRap.filter(esAnterior),
          consolidados,
          versionesRubrica,
        );
        return {
          ...rap,
          evaluado: asignaturas.length > 0,
          asignaturas,
          versionesRubrica,
          porcentajeCumplimiento: logro.porcentaje,
          valoracionesEnCumplimiento: logro.enCumplimiento,
          valoracionesTotales: logro.valoraciones,
          porcentajeEsperado: esperado,
          alcanzado: juicio(logro.porcentaje, esperado),
          comparacion,
          motivoSinComparacion:
            comparacion.length === 0 ? MOTIVO_SIN_PERIODOS_ANTERIORES : null,
        };
      }),
    };

    return reporte;
  }

  /** RF-32, p5: el mismo reporte en un libro de Excel. */
  async excel(
    usuario: UsuarioSesion,
    consulta: ConsultarLogroRapDto,
  ): Promise<{ nombreArchivo: string; contenido: Buffer }> {
    const reporte = await this.logroRap(usuario, consulta);
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
      [`Generado el ${fechaGeneracion(new Date(reporte.generado))}`],
      [],
      encabezado([
        'RAP',
        'Asignatura',
        'Grupo',
        'Docentes',
        'Valoración',
        'Muestra',
        '% en niveles de cumplimiento',
        'Valoraciones en cumplimiento',
        'Total de valoraciones',
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
          { value: asignatura.valoracionesEnCumplimiento, type: Number },
          { value: asignatura.valoracionesTotales, type: Number },
          numero(asignatura.porcentajeEsperado),
          resultado(asignatura.alcanzado),
          { value: asignatura.accionesImplementadas ?? undefined, wrap: true },
          { value: asignatura.resultadosObtenidos ?? undefined, wrap: true },
          { value: asignatura.accionesPropuestas ?? undefined, wrap: true },
        ]);
      }
      resumen.push([
        { value: `${nombre} · logro del período`, fontWeight: 'bold' },
        null,
        null,
        null,
        null,
        null,
        numero(rap.porcentajeCumplimiento),
        { value: rap.valoracionesEnCumplimiento, type: Number },
        { value: rap.valoracionesTotales, type: Number },
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
        'Resultado',
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
            resultado(indicador.alcanzado),
          ]);
        }
      }
    }

    const comparacion: Row[] = [
      encabezado([
        'RAP',
        'Período',
        '% en niveles de cumplimiento',
        'Valoraciones en cumplimiento',
        'Total de valoraciones',
        'Mediciones',
        'Versión de la rúbrica',
        'Nota',
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
          { value: fila.valoracionesEnCumplimiento, type: Number },
          { value: fila.valoracionesTotales, type: Number },
          { value: fila.mediciones, type: Number },
          fila.versionesRubrica.join(', '),
          fila.nota,
        ]);
      }
      if (rap.porcentajeCumplimiento !== null) {
        comparacion.push([
          nombre,
          `${reporte.periodo.codigo} (consultado)`,
          numero(rap.porcentajeCumplimiento),
          { value: rap.valoracionesEnCumplimiento, type: Number },
          { value: rap.valoracionesTotales, type: Number },
          { value: rap.asignaturas.length, type: Number },
          rap.versionesRubrica.join(', '),
        ]);
      }
    }

    const contenido = await libro([
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
    ]);

    return {
      nombreArchivo: `logro-rap-${nombreSeguro(reporte.periodo.codigo)}.xlsx`,
      contenido,
    };
  }

  /** RAP que lidera el usuario, con los períodos en que los lidera. */
  async liderazgos(usuario: UsuarioSesion): Promise<Liderazgos> {
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
}

function aAsignatura(
  medicion: MedicionReporte,
  consolidado: Consolidado | undefined,
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
    versionRubrica: medicion.rubrica?.version ?? null,
    porcentajeCumplimiento: consolidado?.porcentajeCumplimiento ?? null,
    valoracionesEnCumplimiento: consolidado?.valoracionesEnCumplimiento ?? 0,
    valoracionesTotales: consolidado?.valoracionesTotales ?? 0,
    porcentajeEsperado: consolidado?.porcentajeEsperado ?? null,
    alcanzado: consolidado?.alcanzado ?? null,
    indicadores: (consolidado?.indicadores ?? []).map((indicador) => ({
      numero: indicador.numero,
      instrumento: indicador.instrumento,
      muestra: indicador.muestra,
      enCumplimiento: indicador.enCumplimiento,
      porcentajeCumplimiento: indicador.porcentajeCumplimiento,
      alcanzado: indicador.alcanzado,
    })),
    accionesImplementadas: medicion.acciones_implementadas,
    resultadosObtenidos: medicion.resultados_obtenidos,
    accionesPropuestas: medicion.acciones_propuestas,
  };
}

/**
 * RF-32, p4: logro de cada período anterior, del más antiguo al más reciente, con la misma
 * regla (`logroDelRap`). Se marca el período medido con otra versión de la rúbrica que el
 * consultado (o, si este no tiene mediciones, que el más reciente): con otros indicadores, el
 * número deja de ser comparable.
 */
function compararPeriodos(
  anteriores: MedicionReporte[],
  consolidados: ReadonlyMap<number, Consolidado>,
  versionesConsultado: readonly number[],
): ComparacionPeriodoDto[] {
  const porPeriodo = new Map<
    string,
    {
      orden: number;
      codigo: string;
      partes: { enCumplimiento: number; valoraciones: number }[];
      versiones: (number | null)[];
    }
  >();
  for (const medicion of anteriores) {
    const periodo = medicion.proyecto_docente?.periodo_academico;
    const consolidado = consolidados.get(medicion.id);
    if (
      !periodo?.codigo ||
      !consolidado ||
      consolidado.valoracionesTotales === 0
    ) {
      continue;
    }
    const grupo = porPeriodo.get(periodo.codigo) ?? {
      orden: periodo.fecha_inicio?.getTime() ?? 0,
      codigo: periodo.codigo,
      partes: [],
      versiones: [],
    };
    grupo.partes.push({
      enCumplimiento: consolidado.valoracionesEnCumplimiento,
      valoraciones: consolidado.valoracionesTotales,
    });
    grupo.versiones.push(medicion.rubrica?.version ?? null);
    porPeriodo.set(periodo.codigo, grupo);
  }
  const grupos = [...porPeriodo.values()].sort(
    (a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo),
  );
  const referencia =
    versionesConsultado.length > 0
      ? versionesConsultado
      : versiones(grupos[grupos.length - 1]?.versiones ?? []);
  return grupos.map((grupo) => {
    const logro = logroDelRap(grupo.partes);
    const versionesRubrica = versiones(grupo.versiones);
    const comparable = mismasVersiones(versionesRubrica, referencia);
    return {
      periodo: grupo.codigo,
      porcentajeCumplimiento: logro.porcentaje as number,
      valoracionesEnCumplimiento: logro.enCumplimiento,
      valoracionesTotales: logro.valoraciones,
      mediciones: grupo.partes.length,
      versionesRubrica,
      comparable,
      nota: comparable
        ? null
        : `Medido con la versión ${versionesRubrica.join(', ') || 'desconocida'} de la rúbrica y comparado con la ${referencia.join(', ')}: con otros indicadores, el número no es comparable.`,
    };
  });
}

/** Versiones de rúbrica distintas y ordenadas, sin las desconocidas. */
function versiones(lista: readonly (number | null)[]): number[] {
  return [
    ...new Set(lista.filter((version): version is number => version !== null)),
  ].sort((a, b) => a - b);
}

function mismasVersiones(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((version, i) => version === b[i]);
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

/**
 * Meta con que se juzga el RAP en el período: la que quedó congelada en sus mediciones, para
 * que cambiar la meta del programa no reescriba los resultados pasados. Si las mediciones
 * tienen metas distintas, o no hay ninguna medida, se usa la meta vigente del programa.
 */
function esperadoDelRap(
  asignaturas: { porcentajeEsperado: number | null }[],
  vigente: number | null,
): number | null {
  const congeladas = new Set(
    asignaturas.map((asignatura) => asignatura.porcentajeEsperado),
  );
  return congeladas.size === 1 ? [...congeladas][0] : vigente;
}
