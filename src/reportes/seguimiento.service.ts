import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import {
  PARAMETRO,
  ParametrosService,
  type RangoEntero,
} from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { porcentaje } from '../mediciones/consolidado.js';
import { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import {
  aDatosCompletitud,
  SELECCION_COMPLETITUD,
} from '../proyectos-docentes/diligenciamiento.service.js';
import {
  nombreRap,
  SECCIONES,
} from '../proyectos-docentes/entities/secciones.js';
import {
  alertaDeSesion,
  fechaDeHoy,
  PARAMETRO_UMBRAL_ALERTA,
  RANGO_UMBRAL_ALERTA,
  resumirAlertas,
} from '../sesiones/alertas.js';
import { aTextoFecha } from '../sesiones/calendario.js';
import {
  esDiligenciada,
  SESION_VIGENTE,
  TIPO_FESTIVO,
} from '../sesiones/sesiones.service.js';
import type {
  FiltrarSeguimientoDto,
  FiltrosSeguimientoDto,
  PaginaSeguimientoDto,
  ProyectoSeguimientoDto,
  ResumenSeguimientoDto,
} from './dto/seguimiento.dto.js';
import {
  type ArchivoExcel,
  encabezado,
  fechaGeneracion,
  libro,
  nombreSeguro,
  numero,
  titulo,
} from './excel.js';
import {
  compararGravedad,
  semaforoDelProyecto,
  tienePendientes,
} from './semaforo.js';

/** Roles del tablero (RF-25, precondición), con el alcance de su programa. */
export const ROLES_SEGUIMIENTO = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
] as const;

/** Clave en `parametro_sistema` del máximo de filas de una exportación (RF-25, p5). */
export const PARAMETRO_EXPORTACION_MAXIMA =
  PARAMETRO.reporteExportacionFilasMaxima;

/** Valores admitidos del máximo de filas; fuera de ellos no se aplica tope y queda el error. */
export const RANGO_EXPORTACION_MAXIMA: RangoEntero = {
  minimo: 1,
  maximo: 1_000_000,
};

export const MENSAJE_PERIODO_NO_EXISTE = 'El período académico no existe.';

export function mensajeExportacionGrande(
  filas: number,
  maximo: number,
): string {
  return (
    `La consulta tiene ${filas} proyectos y se pueden exportar hasta ${maximo}. ` +
    'Restrinja los filtros (programa, asignatura o docente) y vuelva a exportar.'
  );
}

/** Lo que hace falta leer de cada proyecto para el tablero. */
const SELECCION_FILA = {
  ...SELECCION_COMPLETITUD,
  id: true,
  grupo: true,
  asignatura: {
    select: { nombre: true, programa: { select: { nombre: true } } },
  },
  periodo_academico: {
    select: {
      codigo: true,
      cerrado: true,
      fecha_fin: true,
      numero_semanas: true,
    },
  },
  estado_proyecto: { select: { codigo: true, nombre: true } },
  proyecto_docente_docente: {
    select: { usuario: { select: { nombres: true, apellidos: true } } },
    orderBy: [{ responsable: 'desc' }, { orden: 'asc' }],
  },
} satisfies Prisma.proyecto_docenteSelect;

/** Lo que necesita la regla de alertas de RF-23 de cada sesión. */
const SELECCION_SESION = {
  id_proyecto_docente: true,
  fecha: true,
  estado: true,
  fecha_registro: true,
  id_registrado_por: true,
  tipo_sesion: { select: { codigo: true } },
} satisfies Prisma.sesion_claseSelect;

/** Período consultado y filas calculadas, para el tablero y los reportes de RF-28. */
export interface ConsultaSeguimiento {
  periodo: { id: number; codigo: string } | null;
  filas: ProyectoSeguimientoDto[];
}

/**
 * Tablero de seguimiento del diligenciamiento (RF-25, HU-12-01 y HU-12-02). Para cada proyecto
 * docente del período calcula:
 * - el porcentaje de secciones completas, con la misma regla del diligenciamiento (`SECCIONES`);
 * - las sesiones registradas frente a las programadas y las vencidas, con la regla de RF-23
 *   (`alertaDeSesion`);
 * - las evidencias cargadas por RAP;
 * - el estado del proyecto y su color (`semaforoDelProyecto`).
 *
 * Quién lo consulta (RF-25 y matriz de `URAP-34`, fila «Reportes»): el Administrador, el
 * Departamento y la Dirección, sobre los programas de su rol.
 */
@Injectable()
export class SeguimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly parametros: ParametrosService,
  ) {}

  /** RF-25, p2: opciones de los filtros dentro del alcance del usuario. */
  async filtros(usuario: UsuarioSesion): Promise<FiltrosSeguimientoDto> {
    const enAlcance = await this.filtroAlcance(usuario);
    if (!enAlcance) {
      return { programas: [], periodos: [], asignaturas: [], docentes: [] };
    }
    const deProyectos: Prisma.proyecto_docenteWhereInput = enAlcance;
    const [programas, periodos, asignaturas, docentes] = await Promise.all([
      this.prisma.programa.findMany({
        where: {
          activo: true,
          asignatura: { some: { proyecto_docente: { some: deProyectos } } },
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.periodo_academico.findMany({
        select: { id: true, codigo: true, activo: true, cerrado: true },
        orderBy: [{ fecha_inicio: 'desc' }, { codigo: 'desc' }],
      }),
      this.prisma.asignatura.findMany({
        where: { proyecto_docente: { some: deProyectos } },
        select: { id: true, nombre: true, id_programa: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.usuario.findMany({
        where: {
          proyecto_docente_docente: {
            some: { proyecto_docente: { is: deProyectos } },
          },
        },
        select: { id: true, nombres: true, apellidos: true },
        orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      }),
    ]);
    return {
      programas: programas.map((programa) => ({
        id: programa.id,
        nombre: programa.nombre ?? 'Programa sin nombre',
      })),
      periodos: periodos.map((periodo) => ({
        id: periodo.id,
        codigo: periodo.codigo ?? `Período ${periodo.id}`,
        vigente: Boolean(periodo.activo) && !periodo.cerrado,
      })),
      asignaturas: asignaturas.map((asignatura) => ({
        id: asignatura.id,
        nombre: asignatura.nombre ?? 'Asignatura sin nombre',
        idPrograma: asignatura.id_programa,
      })),
      docentes: docentes.map((docente) => ({
        id: docente.id,
        nombre: nombreCompleto(docente),
      })),
    };
  }

  /** HU-12-01: todos los proyectos del período, con su color. */
  async tablero(
    usuario: UsuarioSesion,
    consulta: FiltrarSeguimientoDto & { pagina: number; tamano: number },
  ): Promise<PaginaSeguimientoDto> {
    const { periodo, filas } = await this.consultar(usuario, consulta);
    return paginar(periodo, filas, filas, consulta);
  }

  /**
   * HU-12-02: los proyectos con secciones incompletas o sesiones vencidas, del más grave al
   * menos grave (`compararGravedad`).
   */
  async pendientes(
    usuario: UsuarioSesion,
    consulta: FiltrarSeguimientoDto & { pagina: number; tamano: number },
  ): Promise<PaginaSeguimientoDto> {
    const { periodo, filas } = await this.consultar(usuario, consulta);
    return paginar(periodo, filas, conPendientes(filas), consulta);
  }

  /** RF-25, p5: el tablero o la lista de pendientes en Excel. */
  async excel(
    usuario: UsuarioSesion,
    filtros: FiltrarSeguimientoDto,
    soloPendientes: boolean,
  ): Promise<ArchivoExcel> {
    const { periodo, filas: todas } = await this.consultar(usuario, filtros);
    const filas = soloPendientes ? conPendientes(todas) : todas;
    await this.exigirTamanoExportable(filas.length);

    const generado = new Date();
    const datos = [
      [
        titulo(
          soloPendientes
            ? 'Proyectos docentes con pendientes'
            : 'Tablero de seguimiento del diligenciamiento',
        ),
      ],
      [`Período académico ${periodo?.codigo ?? 'sin definir'}`],
      [`Generado el ${fechaGeneracion(generado)}`],
      [],
      encabezado([
        'Color',
        'Por qué',
        'Asignatura',
        'Grupo',
        'Programa',
        'Docentes',
        'Estado',
        'Secciones completas',
        'Total de secciones',
        '% de secciones completas',
        'Secciones pendientes',
        'Sesiones programadas',
        'Sesiones registradas',
        'Vencidas',
        'Incumplidas',
        'Por vencer',
        'Mayor atraso (días)',
        'Evidencias por RAP',
      ]),
      ...filas.map((fila) => [
        ETIQUETA_COLOR[fila.color],
        fila.motivoColor,
        fila.asignatura,
        fila.grupo,
        fila.programa,
        fila.docentes.join(', '),
        fila.estado?.nombre ?? null,
        numero(fila.secciones.completas, false),
        numero(fila.secciones.total, false),
        numero(fila.secciones.porcentaje),
        fila.secciones.incompletas.join('; '),
        numero(fila.sesiones.programadas, false),
        numero(fila.sesiones.registradas, false),
        numero(fila.sesiones.vencidas, false),
        numero(fila.sesiones.incumplidas, false),
        numero(fila.sesiones.porVencer, false),
        numero(fila.sesiones.mayorAtraso, false),
        fila.evidencias
          .map((evidencia) => `${evidencia.rap}: ${evidencia.cantidad}`)
          .join('; '),
      ]),
    ];
    const contenido = await libro([
      {
        sheet: soloPendientes ? 'Pendientes' : 'Tablero',
        data: datos,
        columns: [
          { width: 10 },
          { width: 36 },
          { width: 34 },
          { width: 8 },
          { width: 26 },
          { width: 28 },
          { width: 20 },
          ...Array.from({ length: 3 }, () => ({ width: 12 })),
          { width: 40 },
          ...Array.from({ length: 6 }, () => ({ width: 12 })),
          { width: 28 },
        ],
      },
    ]);
    return {
      nombreArchivo: `${soloPendientes ? 'pendientes' : 'tablero'}-${nombreSeguro(periodo?.codigo ?? 'sin-periodo')}.xlsx`,
      contenido,
    };
  }

  /**
   * RF-25, p3: proyectos del período dentro del alcance y los filtros, con sus indicadores. Lo
   * usan también los reportes de RF-28; `adicional` agrega condiciones (por ejemplo, el estado).
   */
  async consultar(
    usuario: UsuarioSesion,
    filtros: FiltrarSeguimientoDto,
    adicional: Prisma.proyecto_docenteWhereInput = {},
  ): Promise<ConsultaSeguimiento> {
    const [enAlcance, periodo] = await Promise.all([
      this.filtroAlcance(usuario),
      this.periodo(filtros.idPeriodo),
    ]);
    if (!enAlcance || !periodo) {
      return { periodo, filas: [] };
    }
    const proyectos = await this.prisma.proyecto_docente.findMany({
      where: {
        AND: [
          enAlcance,
          adicional,
          { id_periodo: periodo.id },
          filtros.idPrograma
            ? { asignatura: { is: { id_programa: filtros.idPrograma } } }
            : {},
          filtros.idAsignatura ? { id_asignatura: filtros.idAsignatura } : {},
          filtros.idDocente
            ? {
                proyecto_docente_docente: {
                  some: { id_usuario: filtros.idDocente },
                },
              }
            : {},
        ],
      },
      select: SELECCION_FILA,
      orderBy: [
        { asignatura: { nombre: 'asc' } },
        { grupo: 'asc' },
        { id: 'asc' },
      ],
    });
    const ids = proyectos.map((proyecto) => proyecto.id);
    const [sesiones, evidencias, umbralDias] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : this.prisma.sesion_clase.findMany({
            where: { id_proyecto_docente: { in: ids }, ...SESION_VIGENTE },
            select: SELECCION_SESION,
          }),
      ids.length === 0
        ? Promise.resolve([])
        : this.prisma.evidencia_rap.groupBy({
            by: ['id_proyecto_docente', 'id_rap'],
            where: { id_proyecto_docente: { in: ids } },
            _count: { _all: true },
          }),
      this.parametros.leerEntero(PARAMETRO_UMBRAL_ALERTA, RANGO_UMBRAL_ALERTA),
    ]);

    const sesionesPor = agrupar(
      sesiones,
      (sesion) => sesion.id_proyecto_docente,
    );
    const evidenciasPor = new Map<string, number>(
      evidencias.map((fila) => [
        `${fila.id_proyecto_docente}:${fila.id_rap}`,
        fila._count._all,
      ]),
    );
    const hoy = fechaDeHoy();
    const filas = proyectos.map((proyecto) =>
      aFila(proyecto, sesionesPor.get(proyecto.id) ?? [], evidenciasPor, {
        hoy,
        umbralDias,
      }),
    );
    return { periodo, filas };
  }

  /** Proyectos dentro del alcance de los roles del usuario; nulo si no alcanza ninguno. */
  private async filtroAlcance(
    usuario: UsuarioSesion,
  ): Promise<Prisma.proyecto_docenteWhereInput | null> {
    const { global, programas } = await this.alcance.alcance(
      usuario.id,
      ROLES_SEGUIMIENTO,
    );
    if (global) {
      return {};
    }
    return programas.length > 0
      ? { asignatura: { is: { id_programa: { in: programas } } } }
      : null;
  }

  /** El período pedido o, si no se indica, el activo más reciente. */
  private async periodo(
    idPeriodo: number | undefined,
  ): Promise<{ id: number; codigo: string } | null> {
    const periodo = idPeriodo
      ? await this.prisma.periodo_academico.findUnique({
          where: { id: idPeriodo },
          select: { id: true, codigo: true },
        })
      : await this.prisma.periodo_academico.findFirst({
          where: { activo: true },
          orderBy: [
            { cerrado: 'asc' },
            { fecha_inicio: 'desc' },
            { id: 'desc' },
          ],
          select: { id: true, codigo: true },
        });
    if (idPeriodo && !periodo) {
      throw new NotFoundException(MENSAJE_PERIODO_NO_EXISTE);
    }
    return periodo
      ? { id: periodo.id, codigo: periodo.codigo ?? `${periodo.id}` }
      : null;
  }

  /** RF-25, excepción de p5: por encima del máximo se piden filtros más estrechos. */
  async exigirTamanoExportable(filas: number): Promise<void> {
    const maximo = await this.parametros.leerEntero(
      PARAMETRO_EXPORTACION_MAXIMA,
      RANGO_EXPORTACION_MAXIMA,
    );
    if (maximo !== null && filas > maximo) {
      throw new UnprocessableEntityException(
        mensajeExportacionGrande(filas, maximo),
      );
    }
  }
}

export const ETIQUETA_COLOR: Record<ProyectoSeguimientoDto['color'], string> = {
  rojo: 'Rojo',
  amarillo: 'Amarillo',
  verde: 'Verde',
};

type ProyectoLeido = Prisma.proyecto_docenteGetPayload<{
  select: typeof SELECCION_FILA;
}>;
type SesionLeida = Prisma.sesion_claseGetPayload<{
  select: typeof SELECCION_SESION;
}>;

function aFila(
  proyecto: ProyectoLeido,
  sesiones: SesionLeida[],
  evidencias: ReadonlyMap<string, number>,
  { hoy, umbralDias }: { hoy: string; umbralDias: number | null },
): ProyectoSeguimientoDto {
  // Secciones: la misma regla del diligenciamiento (RF-11 a RF-16).
  const datos = aDatosCompletitud(proyecto);
  const incompletas = SECCIONES.filter(
    (seccion) => seccion.pendientes(datos).length > 0,
  ).map((seccion) => `${seccion.numero}. ${seccion.titulo}`);
  const completas = SECCIONES.length - incompletas.length;

  // Sesiones: programadas son las del calendario sin festivos; la alerta es la de RF-23.
  const periodo = proyecto.periodo_academico;
  const contexto = {
    hoy,
    umbralDias,
    periodoCerrado: Boolean(periodo?.cerrado),
    fechaFinPeriodo: periodo?.fecha_fin ? aTextoFecha(periodo.fecha_fin) : null,
  };
  const programadas = sesiones.filter(
    (sesion) => sesion.tipo_sesion?.codigo !== TIPO_FESTIVO,
  );
  const alertas = resumirAlertas(
    programadas
      .filter((sesion) => sesion.fecha !== null)
      .map((sesion) =>
        alertaDeSesion(
          {
            fecha: aTextoFecha(sesion.fecha as Date),
            diligenciada: esDiligenciada(sesion),
            esFestivo: false,
          },
          contexto,
        ),
      ),
  );

  const semaforo = semaforoDelProyecto({
    seccionesIncompletas: incompletas.length,
    vencidas: alertas.vencidas,
    incumplidas: alertas.incumplidas,
    porVencer: alertas.porVencer,
  });
  return {
    idProyecto: proyecto.id,
    asignatura: proyecto.asignatura?.nombre ?? 'Asignatura sin nombre',
    grupo: proyecto.grupo,
    programa: proyecto.asignatura?.programa?.nombre ?? null,
    periodo: periodo?.codigo ?? null,
    docentes: proyecto.proyecto_docente_docente
      .map((fila) => nombreCompleto(fila.usuario))
      .filter(Boolean),
    estado: proyecto.estado_proyecto
      ? {
          codigo: proyecto.estado_proyecto.codigo ?? '',
          nombre: proyecto.estado_proyecto.nombre ?? '',
        }
      : null,
    secciones: {
      completas,
      total: SECCIONES.length,
      porcentaje: porcentaje(completas, SECCIONES.length),
      incompletas,
    },
    sesiones: {
      programadas: programadas.length,
      registradas: programadas.filter((sesion) => esDiligenciada(sesion))
        .length,
      vencidas: alertas.vencidas,
      incumplidas: alertas.incumplidas,
      porVencer: alertas.porVencer,
      mayorAtraso: alertas.mayorAtraso,
    },
    evidencias: datos.raps.map((rap) => ({
      idRap: rap.id,
      rap: nombreRap(rap),
      cantidad: evidencias.get(`${proyecto.id}:${rap.id}`) ?? 0,
    })),
    color: semaforo.color,
    motivoColor: semaforo.motivo,
  };
}

/** HU-12-02: solo los que tienen pendientes, del más grave al menos grave. */
export function conPendientes(
  filas: readonly ProyectoSeguimientoDto[],
): ProyectoSeguimientoDto[] {
  return filas
    .filter((fila) =>
      tienePendientes({
        seccionesIncompletas: fila.secciones.incompletas.length,
        vencidas: fila.sesiones.vencidas,
        incumplidas: fila.sesiones.incumplidas,
        porVencer: fila.sesiones.porVencer,
      }),
    )
    .sort((a, b) => compararGravedad(aGravedad(a), aGravedad(b)));
}

function aGravedad(fila: ProyectoSeguimientoDto) {
  return {
    color: fila.color,
    seccionesIncompletas: fila.secciones.incompletas.length,
    vencidas: fila.sesiones.vencidas,
    incumplidas: fila.sesiones.incumplidas,
    porVencer: fila.sesiones.porVencer,
    mayorAtraso: fila.sesiones.mayorAtraso,
    porcentajeSecciones: fila.secciones.porcentaje,
    nombre: `${fila.asignatura} ${fila.grupo ?? ''}`,
  };
}

export function resumir(
  filas: readonly ProyectoSeguimientoDto[],
): ResumenSeguimientoDto {
  return {
    proyectos: filas.length,
    rojo: filas.filter((fila) => fila.color === 'rojo').length,
    amarillo: filas.filter((fila) => fila.color === 'amarillo').length,
    verde: filas.filter((fila) => fila.color === 'verde').length,
    conPendientes: conPendientes(filas).length,
  };
}

function paginar(
  periodo: ConsultaSeguimiento['periodo'],
  todas: readonly ProyectoSeguimientoDto[],
  lista: readonly ProyectoSeguimientoDto[],
  { pagina, tamano }: { pagina: number; tamano: number },
): PaginaSeguimientoDto {
  return {
    periodo,
    generado: new Date().toISOString(),
    resumen: resumir(todas),
    elementos: lista.slice((pagina - 1) * tamano, pagina * tamano),
    pagina,
    tamano,
    total: lista.length,
  };
}

function agrupar<T>(
  filas: readonly T[],
  clave: (fila: T) => number | null,
): Map<number, T[]> {
  const grupos = new Map<number, T[]>();
  for (const fila of filas) {
    const id = clave(fila);
    if (id === null) {
      continue;
    }
    const grupo = grupos.get(id) ?? [];
    grupo.push(fila);
    grupos.set(id, grupo);
  }
  return grupos;
}

function nombreCompleto(persona: {
  nombres: string | null;
  apellidos: string | null;
}): string {
  return [persona.nombres, persona.apellidos].filter(Boolean).join(' ');
}
