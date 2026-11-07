/*
 * RF-23: alerta de sesiones vencidas sin diligenciar y de sesiones por vencer. Son funciones
 * puras, sin base de datos ni reloj propio, para probar aparte la regla. El calendario del
 * curso y el panel del docente usan esta misma regla, así nunca cuentan distinto.
 *
 * Las fechas son textos `YYYY-MM-DD`, como las devuelve `aTextoFecha` de una columna `date`.
 */
import { PARAMETRO } from '../common/parametros/parametros.service.js';
import { aFechaColumna, aTextoFecha, MILISEGUNDOS_DIA } from './calendario.js';

/**
 * Zona horaria con la que se decide qué día es «hoy». Las clases ocurren en Colombia: un
 * servidor en UTC (por ejemplo en AWS) ya estaría en el día siguiente a las 7 p. m.
 */
export const ZONA_HORARIA = 'America/Bogota';

/** Clave en `parametro_sistema` del umbral de «Por vencer», en días (RF-23, HU-08-08). */
export const PARAMETRO_UMBRAL_ALERTA = PARAMETRO.alertaDiasAnticipacion;

/**
 * - `vencida`: la fecha ya pasó y la sesión no tiene registro (p2), en rojo.
 * - `por_vencer`: la fecha es hoy o cae dentro del umbral (p4), en color de advertencia.
 * - `incumplida`: era vencida y el período ya se cerró; deja de acumular días (excepción p4).
 */
export type TipoAlerta = 'vencida' | 'por_vencer' | 'incumplida';
export const TIPOS_ALERTA: readonly TipoAlerta[] = [
  'vencida',
  'por_vencer',
  'incumplida',
];

export interface AlertaSesion {
  alerta: TipoAlerta | null;
  /** Días desde la fecha de la sesión (p3). Solo para vencidas e incumplidas. */
  diasAtraso: number | null;
  /** Días que faltan para la fecha de la sesión: 0 es hoy. Solo para por vencer. */
  diasRestantes: number | null;
}

export interface SesionParaAlerta {
  /** `YYYY-MM-DD` */
  fecha: string;
  diligenciada: boolean;
  /** Las de tipo «Festivo» no cuentan como vencidas (excepción p2), ni como por vencer. */
  esFestivo: boolean;
}

export interface ContextoAlerta {
  /** `YYYY-MM-DD`, en la zona horaria de la institución. */
  hoy: string;
  /** Días del umbral de «Por vencer»; nulo si el parámetro falta: no se marca ninguna. */
  umbralDias: number | null;
  periodoCerrado: boolean;
  /** `YYYY-MM-DD`; con el período cerrado, los días de atraso se cuentan hasta esta fecha. */
  fechaFinPeriodo: string | null;
}

const SIN_ALERTA: AlertaSesion = {
  alerta: null,
  diasAtraso: null,
  diasRestantes: null,
};

/** La fecha de hoy en la zona horaria de la institución, `YYYY-MM-DD`. */
export function fechaDeHoy(ahora: Date = new Date()): string {
  // en-CA da el formato ISO (2026-11-07); el resto de la interfaz va en español.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Días enteros de `desde` a `hasta`: positivo si `hasta` es posterior. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (aFechaColumna(hasta).getTime() - aFechaColumna(desde).getTime()) /
      MILISEGUNDOS_DIA,
  );
}

export function sumarDias(fecha: string, dias: number): string {
  return aTextoFecha(
    new Date(aFechaColumna(fecha).getTime() + dias * MILISEGUNDOS_DIA),
  );
}

/** La fecha más temprana de dos `YYYY-MM-DD`: el formato ISO se ordena como texto. */
function anterior(a: string, b: string): string {
  return a < b ? a : b;
}

/**
 * RF-23, p1 a p4: compara la fecha de la sesión con la de hoy.
 *
 * Con el período cerrado (excepción p4), las vencidas pasan a «incumplida» y dejan de acumular
 * días: el atraso se cuenta hasta la fecha de fin del período, porque el modelo no guarda la
 * fecha en que se cerró. Tampoco hay sesiones por vencer: ya no se puede diligenciar.
 */
export function alertaDeSesion(
  sesion: SesionParaAlerta,
  contexto: ContextoAlerta,
): AlertaSesion {
  if (sesion.diligenciada || sesion.esFestivo) {
    return SIN_ALERTA;
  }
  const { hoy, umbralDias, periodoCerrado, fechaFinPeriodo } = contexto;

  if (periodoCerrado) {
    if (sesion.fecha >= hoy) {
      return SIN_ALERTA;
    }
    const corte = fechaFinPeriodo ? anterior(hoy, fechaFinPeriodo) : hoy;
    return {
      alerta: 'incumplida',
      diasAtraso: Math.max(0, diasEntre(sesion.fecha, corte)),
      diasRestantes: null,
    };
  }

  if (sesion.fecha < hoy) {
    return {
      alerta: 'vencida',
      diasAtraso: diasEntre(sesion.fecha, hoy),
      diasRestantes: null,
    };
  }
  const diasRestantes = diasEntre(hoy, sesion.fecha);
  if (umbralDias !== null && diasRestantes <= umbralDias) {
    return { alerta: 'por_vencer', diasAtraso: null, diasRestantes };
  }
  return SIN_ALERTA;
}

export interface ResumenAlertas {
  vencidas: number;
  porVencer: number;
  incumplidas: number;
  /** Días de atraso de la vencida más antigua; nulo si no hay vencidas. */
  mayorAtraso: number | null;
}

export function resumirAlertas(
  alertas: readonly AlertaSesion[],
): ResumenAlertas {
  const resumen: ResumenAlertas = {
    vencidas: 0,
    porVencer: 0,
    incumplidas: 0,
    mayorAtraso: null,
  };
  for (const { alerta, diasAtraso } of alertas) {
    if (alerta === 'vencida') {
      resumen.vencidas++;
      resumen.mayorAtraso = Math.max(resumen.mayorAtraso ?? 0, diasAtraso ?? 0);
    } else if (alerta === 'por_vencer') {
      resumen.porVencer++;
    } else if (alerta === 'incumplida') {
      resumen.incumplidas++;
    }
  }
  return resumen;
}
