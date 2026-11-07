import { readSheet } from 'read-excel-file/node';

/**
 * Lectura del archivo con la lista de estudiantes matriculados (RF-22, HU-09-01). Mientras no
 * exista integración con el sistema académico, este archivo es el único origen de la lista
 * (SUP-03). Aquí solo se interpreta y valida: no toca la base.
 *
 * Formato: la primera fila con contenido trae los títulos de las columnas Documento, Nombres,
 * Apellidos y, opcionalmente, Correo, en cualquier orden. Cada fila siguiente es un estudiante.
 */

export interface EstudianteDelArchivo {
  /** Número de fila en el Excel, para los mensajes de error. */
  fila: number;
  documento: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
}

export type ResultadoLectura =
  | { tipo: 'valido'; estudiantes: EstudianteDelArchivo[] }
  | { tipo: 'invalido'; mensaje: string; errores: string[] };

type Columna = 'documento' | 'nombres' | 'apellidos' | 'correo';

export const TITULOS_COLUMNAS: Record<Columna, string> = {
  documento: 'Documento',
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  correo: 'Correo',
};

const COLUMNAS_OBLIGATORIAS: Columna[] = ['documento', 'nombres', 'apellidos'];

export const LONGITUD_MAXIMA_NOMBRE = 100;
export const LONGITUD_MAXIMA_CORREO = 255;
/** Cédula, tarjeta de identidad, cédula de extranjería o pasaporte: letras, números y guion. */
const PATRON_DOCUMENTO = /^[A-Z0-9-]{3,20}$/;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Errores que se detallan uno a uno; del resto solo se dice cuántos son. */
export const ERRORES_MAXIMOS_DETALLADOS = 50;

export const MENSAJE_ARCHIVO_NO_LEGIBLE =
  'No se pudo leer el archivo. Verifique que sea un libro de Excel (.xlsx) y que no esté protegido con contraseña.';
export const MENSAJE_ARCHIVO_VACIO =
  'El archivo no tiene estudiantes. Escriba un estudiante por fila debajo de la fila de títulos.';
export const MENSAJE_FORMATO_COLUMNAS = `La primera fila debe tener los títulos ${TITULOS_COLUMNAS.documento}, ${TITULOS_COLUMNAS.nombres}, ${TITULOS_COLUMNAS.apellidos} y, si quiere, ${TITULOS_COLUMNAS.correo}.`;

/** Lee la primera hoja del libro y valida cada fila. Una sola fila con error invalida el archivo. */
export async function leerListaMatriculados(
  contenido: Buffer,
): Promise<ResultadoLectura> {
  let filas: unknown[][];
  try {
    // parseNumber deja los números como el texto del archivo: un documento largo no pierde
    // dígitos ni se vuelve notación científica.
    filas = await readSheet(contenido, {
      trim: true,
      parseNumber: (texto) => texto,
    });
  } catch {
    return {
      tipo: 'invalido',
      mensaje: MENSAJE_ARCHIVO_NO_LEGIBLE,
      errores: [],
    };
  }
  return validarFilas(filas);
}

/** Valida las filas ya leídas. Separada de la lectura para probarla sin armar un Excel. */
export function validarFilas(filas: readonly unknown[][]): ResultadoLectura {
  const indiceTitulos = filas.findIndex((fila) => !filaVacia(fila));
  if (indiceTitulos === -1) {
    return { tipo: 'invalido', mensaje: MENSAJE_ARCHIVO_VACIO, errores: [] };
  }

  const columnas = ubicarColumnas(filas[indiceTitulos]);
  if (columnas.tipo === 'invalido') {
    return columnas;
  }

  const estudiantes: EstudianteDelArchivo[] = [];
  const errores: string[] = [];
  const filaPorDocumento = new Map<string, number>();

  filas.slice(indiceTitulos + 1).forEach((celdas, desplazamiento) => {
    if (filaVacia(celdas)) {
      return;
    }
    // El índice 0 de la lectura es la fila 1 del Excel.
    const fila = indiceTitulos + 2 + desplazamiento;
    const leer = (columna: Columna) => {
      const indice = columnas.indices[columna];
      return indice === undefined ? '' : textoDe(celdas[indice]);
    };
    const problemas: string[] = [];

    const documento = normalizarDocumento(leer('documento'));
    if (documento === '') {
      problemas.push('falta el documento');
    } else if (!PATRON_DOCUMENTO.test(documento)) {
      problemas.push(
        `el documento «${documento}» no es válido: use solo números, letras o guion, entre 3 y 20 caracteres`,
      );
    } else {
      const anterior = filaPorDocumento.get(documento);
      if (anterior !== undefined) {
        problemas.push(
          `el documento ${documento} está repetido (ya aparece en la fila ${anterior})`,
        );
      } else {
        filaPorDocumento.set(documento, fila);
      }
    }

    const nombres = normalizarEspacios(leer('nombres'));
    const apellidos = normalizarEspacios(leer('apellidos'));
    for (const [valor, nombre] of [
      [nombres, 'los nombres'],
      [apellidos, 'los apellidos'],
    ] as const) {
      if (valor === '') {
        problemas.push(`faltan ${nombre}`);
      } else if (valor.length > LONGITUD_MAXIMA_NOMBRE) {
        problemas.push(
          `${nombre} superan ${LONGITUD_MAXIMA_NOMBRE} caracteres`,
        );
      }
    }

    const correoLeido = leer('correo').toLowerCase();
    const correo = correoLeido === '' ? null : correoLeido;
    if (
      correo !== null &&
      (correo.length > LONGITUD_MAXIMA_CORREO || !PATRON_CORREO.test(correo))
    ) {
      problemas.push(`el correo «${correo}» no es válido`);
    }

    if (problemas.length > 0) {
      errores.push(`Fila ${fila}: ${problemas.join('; ')}.`);
      return;
    }
    estudiantes.push({ fila, documento, nombres, apellidos, correo });
  });

  if (errores.length > 0) {
    return {
      tipo: 'invalido',
      mensaje:
        errores.length === 1
          ? 'Una fila del archivo tiene errores. Corríjala y vuelva a cargarlo: no se guardó ningún estudiante.'
          : `${errores.length} filas del archivo tienen errores. Corríjalas y vuelva a cargarlo: no se guardó ningún estudiante.`,
      errores: resumirErrores(errores),
    };
  }
  if (estudiantes.length === 0) {
    return { tipo: 'invalido', mensaje: MENSAJE_ARCHIVO_VACIO, errores: [] };
  }
  return { tipo: 'valido', estudiantes };
}

function ubicarColumnas(
  titulos: readonly unknown[],
):
  | { tipo: 'valido'; indices: Partial<Record<Columna, number>> }
  | { tipo: 'invalido'; mensaje: string; errores: string[] } {
  const indices: Partial<Record<Columna, number>> = {};
  const errores: string[] = [];

  titulos.forEach((celda, indice) => {
    const titulo = normalizarTitulo(textoDe(celda));
    if (titulo === '') {
      return;
    }
    const columna = columnaDelTitulo(titulo);
    if (columna === 'nombre-completo') {
      errores.push(
        `La columna «${textoDe(celda)}» junta nombres y apellidos: sepárelos en dos columnas.`,
      );
      return;
    }
    if (columna === undefined) {
      return; // Columnas adicionales (código, programa, semestre...) se ignoran.
    }
    if (indices[columna] !== undefined) {
      errores.push(
        `La columna ${TITULOS_COLUMNAS[columna]} aparece dos veces en la fila de títulos.`,
      );
      return;
    }
    indices[columna] = indice;
  });

  const faltantes = COLUMNAS_OBLIGATORIAS.filter(
    (columna) => indices[columna] === undefined,
  );
  if (faltantes.length > 0) {
    errores.unshift(
      `Faltan las columnas: ${faltantes.map((columna) => TITULOS_COLUMNAS[columna]).join(', ')}.`,
    );
  }
  if (errores.length > 0) {
    return { tipo: 'invalido', mensaje: MENSAJE_FORMATO_COLUMNAS, errores };
  }
  return { tipo: 'valido', indices };
}

function columnaDelTitulo(
  titulo: string,
): Columna | 'nombre-completo' | undefined {
  if (/correo|email|mail/.test(titulo)) {
    return 'correo';
  }
  if (/documento|identificacion|cedula/.test(titulo)) {
    return 'documento';
  }
  const tieneNombre = titulo.includes('nombre');
  const tieneApellido = titulo.includes('apellido');
  if (tieneNombre && (tieneApellido || titulo.includes('completo'))) {
    return 'nombre-completo';
  }
  if (tieneApellido) {
    return 'apellidos';
  }
  if (tieneNombre) {
    return 'nombres';
  }
  return undefined;
}

function textoDe(celda: unknown): string {
  if (celda === null || celda === undefined) {
    return '';
  }
  if (celda instanceof Date) {
    return celda.toISOString().slice(0, 10);
  }
  return String(celda).trim();
}

function filaVacia(fila: readonly unknown[]): boolean {
  return fila.every((celda) => textoDe(celda) === '');
}

/** «Número de documento» → «numerodedocumento»: sin tildes, espacios ni signos. */
function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Quita espacios y puntos de miles (1.047.123.456 → 1047123456). */
function normalizarDocumento(documento: string): string {
  return documento.replace(/[\s.]/g, '').toUpperCase();
}

function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function resumirErrores(errores: string[]): string[] {
  if (errores.length <= ERRORES_MAXIMOS_DETALLADOS) {
    return errores;
  }
  const restantes = errores.length - ERRORES_MAXIMOS_DETALLADOS;
  return [
    ...errores.slice(0, ERRORES_MAXIMOS_DETALLADOS),
    `… y ${restantes} ${restantes === 1 ? 'fila más' : 'filas más'} con errores.`,
  ];
}
