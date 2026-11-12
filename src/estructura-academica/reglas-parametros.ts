/*
 * HU-03-07: qué valor admite cada parámetro de `parametro_sistema`. Son funciones puras, sin
 * base de datos, para probar aparte cada regla.
 *
 * Solo se editan las claves de `PARAMETRO`: las que el código lee. El secreto y la vigencia del
 * JWT no están ahí ni aquí: son variables de entorno (NFR-003).
 */
import { BadRequestException } from '@nestjs/common';
import {
  type ClaveParametro,
  PARAMETRO,
  type RangoEntero,
  separarTextos,
} from '../common/parametros/parametros.service.js';
import { RANGO_PARAMETRO } from '../common/parametros/rangos-parametros.js';
import { TIPOS_RECONOCIDOS } from '../documentos/tipos-archivo.js';

export const TIPOS_PARAMETRO = ['entero', 'booleano', 'lista'] as const;
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number];

/** `parametro_sistema.valor` es `varchar(255)`: el modelo no se cambia por esta historia. */
export const LONGITUD_MAXIMA_VALOR = 255;
/** Una extensión de archivo: letras y números, sin el punto. */
const EXTENSION = /^[a-z0-9]{1,10}$/;

export type DefinicionParametro =
  | { tipo: 'entero'; rango: RangoEntero }
  | { tipo: 'booleano' }
  | {
      tipo: 'lista';
      /**
       * - `extension`: extensiones de archivo, en minúscula y sin el punto;
       * - `texto`: nombres que se muestran al usuario, tal como se escriben.
       */
      elementos: 'extension' | 'texto';
      /** Si la operación que lo lee puede seguir con la lista vacía. */
      admiteVacia: boolean;
      /** Los únicos elementos que el sistema sabe manejar, si la lista es cerrada. */
      permitidos?: readonly string[];
    };

/** Extensiones que el backend sabe verificar por el contenido del archivo (RF-24). */
const EXTENSIONES_VERIFICABLES = TIPOS_RECONOCIDOS.flatMap((tipo) => [
  tipo.extension,
  ...tipo.alias,
]);

/**
 * Una definición por cada clave de `PARAMETRO`. El tipo `Record` obliga a que una clave nueva
 * no compile sin la suya.
 */
export const DEFINICION_PARAMETRO: Record<ClaveParametro, DefinicionParametro> =
  {
    [PARAMETRO.alertaDiasAnticipacion]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.alertaDiasAnticipacion],
    },
    [PARAMETRO.revisionBloquearAutoaprobacion]: { tipo: 'booleano' },
    [PARAMETRO.inicioSesionIntentosMaximos]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.inicioSesionIntentosMaximos],
    },
    [PARAMETRO.inicioSesionMinutosBloqueo]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.inicioSesionMinutosBloqueo],
    },
    [PARAMETRO.archivoTamanoMaximoMb]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.archivoTamanoMaximoMb],
    },
    // Sin tipos permitidos, toda carga de archivos se rechaza (NFR-019).
    [PARAMETRO.archivoTiposPermitidos]: {
      tipo: 'lista',
      elementos: 'extension',
      admiteVacia: false,
    },
    // Las evidencias se verifican por su contenido: solo valen los tipos que se saben reconocer.
    [PARAMETRO.evidenciaTiposPermitidos]: {
      tipo: 'lista',
      elementos: 'extension',
      admiteVacia: false,
      permitidos: EXTENSIONES_VERIFICABLES,
    },
    [PARAMETRO.descripcionCursoLongitudMaxima]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.descripcionCursoLongitudMaxima],
    },
    [PARAMETRO.reporteExportacionFilasMaxima]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.reporteExportacionFilasMaxima],
    },
    // Vacío, el punto 4 del proyecto docente sigue sin sugerencias (RF-13).
    [PARAMETRO.catalogoEstrategiasEnsenanza]: {
      tipo: 'lista',
      elementos: 'texto',
      admiteVacia: true,
    },
    [PARAMETRO.catalogoEstrategiasAprendizaje]: {
      tipo: 'lista',
      elementos: 'texto',
      admiteVacia: true,
    },
    [PARAMETRO.recordatorioSesionesDias]: {
      tipo: 'entero',
      rango: RANGO_PARAMETRO[PARAMETRO.recordatorioSesionesDias],
    },
  };

/** Las claves editables, en el orden en que se declaran en `PARAMETRO`. */
export const CLAVES_PARAMETRO = Object.values(PARAMETRO);

export function esClaveParametro(clave: string): clave is ClaveParametro {
  return (CLAVES_PARAMETRO as readonly string[]).includes(clave);
}

export const MENSAJE_PARAMETRO_NO_EXISTE = 'El parámetro no existe.';
export const MENSAJE_FALTA_VALOR = 'Escriba el valor del parámetro.';
export const MENSAJE_FALTAN_ELEMENTOS =
  'Este parámetro es una lista: envíe sus elementos.';
export const MENSAJE_NO_ES_LISTA =
  'Este parámetro no es una lista: envíe un solo valor.';
export const MENSAJE_NO_ES_ENTERO =
  'Escriba un número entero, sin puntos, comas ni signos.';
export const MENSAJE_NO_ES_SI_NO = 'Elija «sí» o «no».';
export const MENSAJE_LISTA_VACIA = 'La lista debe tener al menos un elemento.';
export const MENSAJE_ELEMENTO_VACIO =
  'La lista tiene un elemento vacío: escríbalo o quítelo.';

export function mensajeFueraDeRango({ minimo, maximo }: RangoEntero): string {
  return `El valor debe estar entre ${numero(minimo)} y ${numero(maximo)}.`;
}

export function mensajeElementoConComa(elemento: string): string {
  return `«${elemento}» lleva una coma. Un elemento no puede llevarla: la coma separa los elementos de la lista.`;
}

export function mensajeElementoRepetido(elemento: string): string {
  return `«${elemento}» está repetido en la lista.`;
}

export function mensajeExtensionInvalida(elemento: string): string {
  return `«${elemento}» no es una extensión de archivo: escriba solo letras y números, como «pdf».`;
}

export function mensajeExtensionNoVerificable(
  elemento: string,
  permitidos: readonly string[],
): string {
  return `El sistema no sabe verificar archivos «${elemento}». Los tipos disponibles son: ${permitidos.join(', ')}.`;
}

export function mensajeValorLargo(longitud: number): string {
  return (
    `La lista ocupa ${numero(longitud)} caracteres y el máximo es ${LONGITUD_MAXIMA_VALOR}. ` +
    'Quite elementos o acorte sus nombres.'
  );
}

/** Lo que llega del administrador: un valor, o los elementos de una lista. */
export interface EntradaParametro {
  valor?: string;
  elementos?: string[];
}

/**
 * El texto que se guarda en `parametro_sistema.valor`, ya normalizado. Si la entrada no cumple
 * las reglas del parámetro, responde 400 con el motivo en español.
 */
export function validarValor(
  definicion: DefinicionParametro,
  entrada: EntradaParametro,
): string {
  if (definicion.tipo === 'lista') {
    if (entrada.elementos === undefined || entrada.valor !== undefined) {
      throw new BadRequestException(MENSAJE_FALTAN_ELEMENTOS);
    }
    return validarLista(definicion, entrada.elementos);
  }
  if (entrada.elementos !== undefined) {
    throw new BadRequestException(MENSAJE_NO_ES_LISTA);
  }
  const texto = entrada.valor?.trim() ?? '';
  if (texto === '') {
    throw new BadRequestException(MENSAJE_FALTA_VALOR);
  }
  return definicion.tipo === 'entero'
    ? validarEntero(definicion.rango, texto)
    : validarSiNo(texto);
}

function validarEntero(rango: RangoEntero, texto: string): string {
  if (!/^\d+$/.test(texto)) {
    throw new BadRequestException(MENSAJE_NO_ES_ENTERO);
  }
  const valor = Number(texto);
  if (
    !Number.isSafeInteger(valor) ||
    valor < rango.minimo ||
    valor > rango.maximo
  ) {
    throw new BadRequestException(mensajeFueraDeRango(rango));
  }
  // Sin ceros a la izquierda: «007» se guarda como «7».
  return String(valor);
}

/** `si` o `no`, como los lee `ParametrosService.leerSiNo`. */
function validarSiNo(texto: string): string {
  const valor = sinTildes(texto);
  if (valor !== 'si' && valor !== 'no') {
    throw new BadRequestException(MENSAJE_NO_ES_SI_NO);
  }
  return valor;
}

function validarLista(
  definicion: Extract<DefinicionParametro, { tipo: 'lista' }>,
  entrada: readonly string[],
): string {
  const esExtension = definicion.elementos === 'extension';
  const elementos = entrada.map((elemento) =>
    esExtension ? aExtension(elemento) : elemento.trim().replace(/\s+/g, ' '),
  );
  if (elementos.length === 0 && !definicion.admiteVacia) {
    throw new BadRequestException(MENSAJE_LISTA_VACIA);
  }

  const vistos = new Set<string>();
  for (const elemento of elementos) {
    if (elemento === '') {
      throw new BadRequestException(MENSAJE_ELEMENTO_VACIO);
    }
    if (elemento.includes(',')) {
      throw new BadRequestException(mensajeElementoConComa(elemento));
    }
    if (esExtension && !EXTENSION.test(elemento)) {
      throw new BadRequestException(mensajeExtensionInvalida(elemento));
    }
    if (definicion.permitidos && !definicion.permitidos.includes(elemento)) {
      throw new BadRequestException(
        mensajeExtensionNoVerificable(elemento, definicion.permitidos),
      );
    }
    // «Resúmenes» y «resumenes» son el mismo elemento para quien lo lee; «caña» y «cana», no.
    const huella = elemento
      .toLowerCase()
      .normalize('NFD')
      .replace(/[́̈]/g, '')
      .normalize('NFC');
    if (vistos.has(huella)) {
      throw new BadRequestException(mensajeElementoRepetido(elemento));
    }
    vistos.add(huella);
  }

  // Como en los datos iniciales: las extensiones sin espacio, los nombres con él.
  const valor = elementos.join(esExtension ? ',' : ', ');
  // MySQL cuenta caracteres, no bytes ni unidades UTF-16.
  const longitud = [...valor].length;
  if (longitud > LONGITUD_MAXIMA_VALOR) {
    throw new BadRequestException(mensajeValorLargo(longitud));
  }
  return valor;
}

/** «.PDF» y « pdf » son la extensión `pdf`. */
function aExtension(elemento: string): string {
  return elemento.trim().toLowerCase().replace(/^\./, '');
}

function sinTildes(texto: string): string {
  return (
    texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      // Tras NFD, cada tilde es una marca combinante aparte: se quitan las marcas.
      .replace(/\p{M}/gu, '')
  );
}

function numero(valor: number): string {
  return valor.toLocaleString('es-CO');
}

/** Los elementos de un valor guardado de tipo lista, como los devuelve la consulta. */
export function elementosDe(
  definicion: DefinicionParametro,
  valor: string | null,
): string[] {
  return definicion.tipo === 'lista' && valor !== null
    ? separarTextos(valor)
    : [];
}
