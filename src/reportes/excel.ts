import writeXlsxFile, { type Row } from 'write-excel-file/node';

/* Piezas comunes de las exportaciones a Excel de los reportes (RF-25, RF-28 y RF-32). */

export const TIPO_EXCEL =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Archivo listo para descargar. */
export interface ArchivoExcel {
  nombreArchivo: string;
  contenido: Buffer;
}

export function titulo(texto: string) {
  return { value: texto, fontWeight: 'bold' as const };
}

/** Fila de títulos de columna, en negrita y con fondo. */
export function encabezado(textos: string[]): Row {
  return textos.map((texto) => ({
    value: texto,
    fontWeight: 'bold' as const,
    backgroundColor: '#E2E8F0',
    wrap: true,
  }));
}

/** Celda numérica; las de porcentaje van con dos decimales. Nula: vacía. */
export function numero(valor: number | null, decimales = true) {
  return valor === null
    ? null
    : decimales
      ? { value: valor, type: Number, format: '0.00' }
      : { value: valor, type: Number };
}

/** Celda de texto largo que se ajusta al ancho de la columna. */
export function textoLargo(valor: string | null) {
  return { value: valor ?? undefined, wrap: true };
}

export function nombreSeguro(texto: string): string {
  return texto.replace(/[^A-Za-z0-9-]+/g, '-');
}

/** «7 de noviembre de 2026, 3:30 p. m.», en la hora de Colombia. */
export function fechaGeneracion(fecha: Date): string {
  return fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

export interface HojaExcel {
  sheet: string;
  data: Row[];
  /** Ancho de cada columna, en caracteres. */
  columns?: { width: number }[];
}

export function libro(hojas: HojaExcel[]): Promise<Buffer> {
  return writeXlsxFile(hojas).toBuffer();
}
