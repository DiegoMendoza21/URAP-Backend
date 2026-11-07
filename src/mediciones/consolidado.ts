/**
 * Consolidado de una medición de RAP (RF-31, HU-11-04 y HU-11-05): la hoja «Evaluación» del
 * formato FO-DO/PC-023. No se guarda en la base: se calcula cada vez desde las valoraciones,
 * para que corregir una valoración actualice el resultado sin recálculos manuales.
 *
 * Reglas (docs/datos-institucionales.md, apartado 3):
 * - El cumplimiento de un indicador es el porcentaje de estudiantes en los niveles desde el
 *   umbral de la escala (`escala_valoracion.umbral_cumplimiento`): «Nivel 3 + 4».
 * - Cada indicador se calcula sobre su muestra: los estudiantes valorados en él (RF-30, p6).
 * - El logro del RAP es un solo número, `logroDelRap`: las valoraciones en cumplimiento entre
 *   todas las valoraciones (estudiante × indicador). Regla provisional, pendiente de
 *   confirmar con el programa: si cambia, se cambia en esa función.
 * - Cada indicador se compara además con la meta, y se señala el que quede por debajo
 *   aunque el RAP cumpla.
 * - Sin porcentaje esperado no hay juicio de cumplimiento (RF-31, excepción de p4).
 * - La cohorte no entra en ningún cálculo; si no se registró, se toma la muestra y se
 *   advierte (RF-31, excepción de p3).
 */

export interface NivelParaConsolidar {
  valor: number;
  etiqueta: string;
}

/** Niveles de una escala (`nivel_escala`) con valor, en el orden de la escala. */
export function nivelesDeEscala(
  niveles: readonly { valor: number | null; etiqueta: string | null }[],
): NivelParaConsolidar[] {
  return niveles
    .filter((nivel) => nivel.valor !== null)
    .map((nivel) => ({
      valor: nivel.valor as number,
      etiqueta: nivel.etiqueta ?? `Nivel ${nivel.valor}`,
    }));
}

export interface IndicadorParaConsolidar {
  idIndicador: number;
  numero: number | null;
  descripcion: string | null;
  instrumento: string | null;
  descripcionInstrumento: string | null;
  /** Estudiantes por valor de nivel. Un valor que no está en la escala no cuenta. */
  conteos: ReadonlyMap<number, number>;
}

export interface EntradaConsolidado {
  niveles: readonly NivelParaConsolidar[];
  umbralCumplimiento: number;
  porcentajeEsperado: number | null;
  tamanoCohorte: number | null;
  /** Estudiantes de la hoja, para contar los sin valorar. Nulo si no se conoce. */
  totalEstudiantes: number | null;
  indicadores: readonly IndicadorParaConsolidar[];
}

export interface ConteoNivel {
  valor: number;
  etiqueta: string;
  cantidad: number;
  /** Sobre la muestra del indicador, con dos decimales. */
  porcentaje: number;
}

export interface IndicadorConsolidado {
  idIndicador: number;
  numero: number | null;
  descripcion: string | null;
  instrumento: string | null;
  descripcionInstrumento: string | null;
  conteos: ConteoNivel[];
  muestra: number;
  /** Estudiantes del indicador en los niveles de cumplimiento. */
  enCumplimiento: number;
  sinValorar: number;
  /** Porcentaje en los niveles de cumplimiento; nulo si nadie fue valorado. */
  porcentajeCumplimiento: number | null;
  /** Nulo si no hay meta o no hay muestra. */
  alcanzado: boolean | null;
}

/** Logro del RAP: el porcentaje y su base. */
export interface LogroRap {
  /** Nulo si no hay valoraciones. */
  porcentaje: number | null;
  /** Valoraciones en los niveles de cumplimiento (87). */
  enCumplimiento: number;
  /** Total de valoraciones (136). */
  valoraciones: number;
}

export interface Consolidado {
  indicadores: IndicadorConsolidado[];
  umbralCumplimiento: number;
  /** Etiquetas de los niveles que cuentan como cumplimiento (Competente, Ejemplar). */
  nivelesCumplimiento: string[];
  /** El mayor de los tamaños de muestra de los indicadores. */
  tamanoMuestra: number;
  tamanoCohorte: number;
  cohorteRegistrada: boolean;
  /** Logro del RAP en la medición (`logroDelRap`); nulo si no hay valoraciones. */
  porcentajeCumplimiento: number | null;
  valoracionesEnCumplimiento: number;
  valoracionesTotales: number;
  porcentajeEsperado: number | null;
  metaDefinida: boolean;
  alcanzado: boolean | null;
  advertencias: string[];
}

export const ADVERTENCIA_SIN_COHORTE =
  'No se registró el tamaño de la cohorte: los porcentajes se calculan sobre los estudiantes valorados (la muestra).';
export const ADVERTENCIA_SIN_META =
  'Meta no definida por el programa: el consolidado se presenta sin juicio de cumplimiento.';
export const ADVERTENCIA_SIN_VALORAR =
  'Hay estudiantes sin valorar en algunos indicadores: quedan fuera de la muestra de ese indicador.';

/** Aviso de los indicadores que no llegan a la meta, aunque el RAP la alcance. */
export function advertenciaBajoMeta(
  numeros: readonly (number | null)[],
): string {
  const lista = numeros.map((numero) => String(numero ?? '?'));
  const texto =
    lista.length === 1
      ? `el ${lista[0]}`
      : `los ${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
  return `${lista.length === 1 ? 'Indicador' : 'Indicadores'} por debajo de la meta: ${texto}.`;
}

/** Porcentaje con dos decimales, sin errores de coma flotante en los casos exactos. */
export function porcentaje(cantidad: number, total: number): number {
  return total === 0 ? 0 : Math.round((cantidad * 10_000) / total) / 100;
}

/**
 * La regla del logro del RAP, en un solo lugar: valoraciones en los niveles de cumplimiento
 * entre el total de valoraciones, sumando todas las partes (los indicadores de una medición
 * o, en el reporte, todas las mediciones cerradas del RAP en el período). Entre asignaturas no
 * se promedian porcentajes: se suman valoraciones, para que un grupo de 8 no pese lo mismo
 * que uno de 39. Con indicadores del mismo tamaño coincide con el promedio simple.
 *
 * Regla provisional, pendiente de confirmar con el programa.
 */
export function logroDelRap(
  partes: readonly { enCumplimiento: number; valoraciones: number }[],
): LogroRap {
  const enCumplimiento = partes.reduce(
    (suma, parte) => suma + parte.enCumplimiento,
    0,
  );
  const valoraciones = partes.reduce(
    (suma, parte) => suma + parte.valoraciones,
    0,
  );
  return {
    porcentaje:
      valoraciones === 0 ? null : porcentaje(enCumplimiento, valoraciones),
    enCumplimiento,
    valoraciones,
  };
}

/** Alcanzado si el porcentaje llega a la meta; nulo sin meta o sin porcentaje. */
export function juicio(
  porcentajeObtenido: number | null,
  porcentajeEsperado: number | null,
): boolean | null {
  return porcentajeObtenido === null || porcentajeEsperado === null
    ? null
    : porcentajeObtenido >= porcentajeEsperado;
}

export function consolidar(entrada: EntradaConsolidado): Consolidado {
  const {
    niveles,
    umbralCumplimiento,
    porcentajeEsperado,
    tamanoCohorte,
    totalEstudiantes,
  } = entrada;
  const metaDefinida = porcentajeEsperado !== null;

  const indicadores = entrada.indicadores.map(
    (indicador): IndicadorConsolidado => {
      const muestra = niveles.reduce(
        (suma, nivel) => suma + (indicador.conteos.get(nivel.valor) ?? 0),
        0,
      );
      const enCumplimiento = niveles
        .filter((nivel) => nivel.valor >= umbralCumplimiento)
        .reduce(
          (suma, nivel) => suma + (indicador.conteos.get(nivel.valor) ?? 0),
          0,
        );
      const porcentajeCumplimiento =
        muestra > 0 ? porcentaje(enCumplimiento, muestra) : null;
      return {
        idIndicador: indicador.idIndicador,
        numero: indicador.numero,
        descripcion: indicador.descripcion,
        instrumento: indicador.instrumento,
        descripcionInstrumento: indicador.descripcionInstrumento,
        conteos: niveles.map((nivel) => {
          const cantidad = indicador.conteos.get(nivel.valor) ?? 0;
          return {
            valor: nivel.valor,
            etiqueta: nivel.etiqueta,
            cantidad,
            porcentaje: porcentaje(cantidad, muestra),
          };
        }),
        muestra,
        enCumplimiento,
        sinValorar:
          totalEstudiantes === null
            ? 0
            : Math.max(0, totalEstudiantes - muestra),
        porcentajeCumplimiento,
        alcanzado: juicio(porcentajeCumplimiento, porcentajeEsperado),
      };
    },
  );

  const logro = logroDelRap(
    indicadores.map((indicador) => ({
      enCumplimiento: indicador.enCumplimiento,
      valoraciones: indicador.muestra,
    })),
  );
  const tamanoMuestra = Math.max(0, ...indicadores.map((i) => i.muestra));

  const advertencias: string[] = [];
  if (tamanoCohorte === null) {
    advertencias.push(ADVERTENCIA_SIN_COHORTE);
  }
  if (!metaDefinida) {
    advertencias.push(ADVERTENCIA_SIN_META);
  }
  const bajoMeta = indicadores.filter((i) => i.alcanzado === false);
  if (bajoMeta.length > 0) {
    advertencias.push(advertenciaBajoMeta(bajoMeta.map((i) => i.numero)));
  }
  if (indicadores.some((indicador) => indicador.sinValorar > 0)) {
    advertencias.push(ADVERTENCIA_SIN_VALORAR);
  }

  return {
    indicadores,
    umbralCumplimiento,
    nivelesCumplimiento: niveles
      .filter((nivel) => nivel.valor >= umbralCumplimiento)
      .map((nivel) => nivel.etiqueta),
    tamanoMuestra,
    tamanoCohorte: tamanoCohorte ?? tamanoMuestra,
    cohorteRegistrada: tamanoCohorte !== null,
    porcentajeCumplimiento: logro.porcentaje,
    valoracionesEnCumplimiento: logro.enCumplimiento,
    valoracionesTotales: logro.valoraciones,
    porcentajeEsperado,
    metaDefinida,
    alcanzado: juicio(logro.porcentaje, porcentajeEsperado),
    advertencias,
  };
}

/** Cuenta valoraciones por indicador y valor de nivel. */
export function contarPorIndicador(
  valoraciones: readonly { idIndicador: number; valor: number }[],
): Map<number, Map<number, number>> {
  const conteos = new Map<number, Map<number, number>>();
  for (const { idIndicador, valor } of valoraciones) {
    const porValor = conteos.get(idIndicador) ?? new Map<number, number>();
    porValor.set(valor, (porValor.get(valor) ?? 0) + 1);
    conteos.set(idIndicador, porValor);
  }
  return conteos;
}
