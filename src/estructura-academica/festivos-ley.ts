/**
 * HU-08-01 (RF-19): los festivos de Colombia de un año, según la Ley 51 de 1983 («Ley
 * Emiliani»). Hay tres clases:
 *
 * - Fijos: se celebran el día que caen.
 * - Trasladables: si no caen en lunes, pasan al lunes siguiente.
 * - Los que dependen de la Pascua: Jueves y Viernes Santo, fijos; Ascensión, Corpus Christi y
 *   Sagrado Corazón, trasladados al lunes siguiente.
 *
 * Solo es la propuesta que se carga en la tabla: el administrador puede editarla después, y
 * agregar los días no hábiles de la Universidad.
 */

export interface FestivoCalculado {
  /** `2026-08-07` */
  fecha: string;
  nombre: string;
}

const FIJOS: [mes: number, dia: number, nombre: string][] = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Día de la Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Día de la Inmaculada Concepción'],
  [12, 25, 'Navidad'],
];

const TRASLADABLES: [mes: number, dia: number, nombre: string][] = [
  [1, 6, 'Día de los Reyes Magos'],
  [3, 19, 'Día de San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Día de Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
];

/** Días después del Domingo de Pascua, y si se trasladan al lunes. */
const DE_PASCUA: [dias: number, trasladable: boolean, nombre: string][] = [
  [-3, false, 'Jueves Santo'],
  [-2, false, 'Viernes Santo'],
  [39, true, 'Ascensión del Señor'],
  [60, true, 'Corpus Christi'],
  [68, true, 'Sagrado Corazón de Jesús'],
];

/** Domingo de Pascua del calendario gregoriano (algoritmo anónimo de Meeus, Jones y Butcher). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}

/** El mismo día si es lunes; si no, el lunes siguiente. */
function alLunes(fecha: Date): Date {
  const dia = fecha.getUTCDay(); // 0 = domingo, 1 = lunes
  return sumarDias(fecha, dia === 1 ? 0 : (8 - dia) % 7);
}

const texto = (fecha: Date) => fecha.toISOString().slice(0, 10);

/**
 * Los festivos de ley del año, ordenados por fecha. Son 18, salvo cuando dos trasladados caen en
 * el mismo lunes (en 2025, San Pedro y el Sagrado Corazón, el 30 de junio): la tabla guarda un
 * día por fecha, así que van juntos, con los dos nombres.
 */
export function festivosDeLey(anio: number): FestivoCalculado[] {
  const pascua = domingoDePascua(anio);
  const festivos = [
    ...FIJOS.map(([mes, dia, nombre]) => ({
      fecha: new Date(Date.UTC(anio, mes - 1, dia)),
      nombre,
    })),
    ...TRASLADABLES.map(([mes, dia, nombre]) => ({
      fecha: alLunes(new Date(Date.UTC(anio, mes - 1, dia))),
      nombre,
    })),
    ...DE_PASCUA.map(([dias, trasladable, nombre]) => {
      const fecha = sumarDias(pascua, dias);
      return { fecha: trasladable ? alLunes(fecha) : fecha, nombre };
    }),
  ];
  const porFecha = new Map<string, string[]>();
  for (const { fecha, nombre } of festivos) {
    const clave = texto(fecha);
    porFecha.set(clave, [...(porFecha.get(clave) ?? []), nombre]);
  }
  return [...porFecha]
    .map(([fecha, nombres]) => ({ fecha, nombre: nombres.join(' y ') }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
