/*
 * Ejecución de los contenidos de un curso (RF-28, HU-12-04): lo planeado frente a lo dictado.
 * Son funciones puras, sin base de datos ni reloj propio, para probar aparte la regla.
 *
 * - Planeado: cada semana del contenido programático (punto 6, RF-15) que tiene tema.
 * - Dictado: el tema se marcó en al menos una clase registrada (RF-20, HU-08-04).
 * - No dictado: no se marcó y su semana ya terminó.
 * - Por dictar: no se marcó y su semana todavía no termina. No es un incumplimiento.
 * - Adicional no planeado: un tema escrito en la clase fuera del contenido (RF-20, excepción de
 *   p4; HU-08-05). Hoy el registro de clase no permite escribirlos: la columna sale en cero
 *   hasta que se construya HU-08-05, y entonces se cuenta sin cambiar este reporte.
 *
 * Cuándo termina una semana lo dice el calendario del curso (RF-19): con la última sesión de esa
 * semana ya en el pasado. Es la misma frontera de RF-23: una sesión de hoy todavía no está
 * vencida. Una semana sin sesiones en el calendario no se da por terminada.
 *
 * Las fechas son textos `YYYY-MM-DD`, como los devuelve `aTextoFecha`.
 */

export type EstadoTema = 'dictado' | 'no_dictado' | 'por_dictar';

export const ETIQUETA_ESTADO_TEMA: Record<EstadoTema, string> = {
  dictado: 'Dictado',
  no_dictado: 'No dictado',
  por_dictar: 'Por dictar',
};

/** Una semana del contenido programático. */
export interface TemaPlaneado {
  idContenido: number;
  semana: number | null;
  tema: string | null;
}

/** Un tema marcado en una clase registrada: del contenido o adicional. */
export interface TemaMarcado {
  idContenido: number | null;
  temaAdicional: string | null;
  /** Fecha de la clase. */
  fecha: string | null;
}

/** Una sesión vigente del calendario del curso, para saber qué semanas ya terminaron. */
export interface SesionCalendario {
  semana: number | null;
  fecha: string | null;
}

export interface EjecucionTema {
  semana: number | null;
  tema: string;
  estado: EstadoTema;
  /** Fechas de las clases en que se dictó, de la más antigua a la más reciente. */
  fechas: string[];
}

export interface TemaAdicional {
  tema: string;
  fechas: string[];
}

export interface EjecucionCurso {
  planeados: number;
  dictados: number;
  noDictados: number;
  porDictar: number;
  adicionales: number;
  /** Dictados sobre planeados; nulo si el curso no tiene temas planeados. */
  porcentajeDictados: number | null;
  temas: EjecucionTema[];
  temasAdicionales: TemaAdicional[];
}

/** Semanas del calendario cuya última sesión ya pasó. */
export function semanasTerminadas(
  sesiones: readonly SesionCalendario[],
  hoy: string,
): Set<number> {
  const ultima = new Map<number, string>();
  for (const { semana, fecha } of sesiones) {
    if (semana === null || fecha === null) {
      continue;
    }
    const actual = ultima.get(semana);
    if (actual === undefined || fecha > actual) {
      ultima.set(semana, fecha);
    }
  }
  return new Set(
    [...ultima].filter(([, fecha]) => fecha < hoy).map(([semana]) => semana),
  );
}

const limpiar = (texto: string | null) =>
  (texto ?? '').trim().replace(/\s+/g, ' ');

/** Fechas sin repetir y en orden; las nulas se descartan. */
function fechasDe(marcas: readonly TemaMarcado[]): string[] {
  return [
    ...new Set(
      marcas.map((marca) => marca.fecha).filter((fecha) => fecha !== null),
    ),
  ].sort();
}

export function ejecucionDelCurso(
  planeados: readonly TemaPlaneado[],
  marcados: readonly TemaMarcado[],
  sesiones: readonly SesionCalendario[],
  hoy: string,
): EjecucionCurso {
  const terminadas = semanasTerminadas(sesiones, hoy);
  const marcasPor = new Map<number, TemaMarcado[]>();
  for (const marca of marcados) {
    if (marca.idContenido !== null) {
      marcasPor.set(marca.idContenido, [
        ...(marcasPor.get(marca.idContenido) ?? []),
        marca,
      ]);
    }
  }

  // Una semana sin tema no es un tema planeado (HU-06-06 la señala como pendiente del punto 6).
  const temas: EjecucionTema[] = planeados
    .filter((planeado) => limpiar(planeado.tema) !== '')
    .sort(
      (a, b) =>
        (a.semana ?? Number.MAX_SAFE_INTEGER) -
          (b.semana ?? Number.MAX_SAFE_INTEGER) ||
        a.idContenido - b.idContenido,
    )
    .map((planeado) => {
      const fechas = fechasDe(marcasPor.get(planeado.idContenido) ?? []);
      const estado: EstadoTema =
        fechas.length > 0 ||
        // Un tema marcado en una clase sin fecha también se dictó.
        (marcasPor.get(planeado.idContenido)?.length ?? 0) > 0
          ? 'dictado'
          : planeado.semana !== null && terminadas.has(planeado.semana)
            ? 'no_dictado'
            : 'por_dictar';
      return {
        semana: planeado.semana,
        tema: limpiar(planeado.tema),
        estado,
        fechas,
      };
    });

  // Los adicionales se agrupan por texto: el mismo tema en dos clases es un solo tema.
  const adicionalesPor = new Map<
    string,
    { tema: string; marcas: TemaMarcado[] }
  >();
  for (const marca of marcados) {
    const tema = limpiar(marca.temaAdicional);
    if (marca.idContenido !== null || tema === '') {
      continue;
    }
    const clave = tema.toLocaleLowerCase('es-CO');
    const grupo = adicionalesPor.get(clave) ?? { tema, marcas: [] };
    grupo.marcas.push(marca);
    adicionalesPor.set(clave, grupo);
  }
  const temasAdicionales = [...adicionalesPor.values()]
    .map(({ tema, marcas }) => ({ tema, fechas: fechasDe(marcas) }))
    .sort(
      (a, b) =>
        (a.fechas[0] ?? '').localeCompare(b.fechas[0] ?? '') ||
        a.tema.localeCompare(b.tema, 'es'),
    );

  const contar = (estado: EstadoTema) =>
    temas.filter((tema) => tema.estado === estado).length;
  const dictados = contar('dictado');
  return {
    planeados: temas.length,
    dictados,
    noDictados: contar('no_dictado'),
    porDictar: contar('por_dictar'),
    adicionales: temasAdicionales.length,
    porcentajeDictados:
      temas.length === 0
        ? null
        : Math.round((dictados * 10_000) / temas.length) / 100,
    temas,
    temasAdicionales,
  };
}
