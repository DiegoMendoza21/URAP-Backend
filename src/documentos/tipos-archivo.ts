/**
 * Tipos de archivo que el backend sabe reconocer por su contenido (NFR-019). Cuáles se
 * permiten lo dice `parametro_sistema`; este catálogo solo sabe cómo distinguirlos. El tipo se
 * decide por los primeros bytes del archivo y no por el nombre ni por el tipo que declara el
 * navegador, que el usuario puede cambiar.
 */
export interface TipoArchivo {
  /** Extensión canónica, tal como se escribe en `parametro_sistema`. */
  extension: string;
  /** Otras extensiones con que llega el mismo tipo. */
  alias: readonly string[];
  mime: string;
  /** Nombre para los mensajes al usuario. */
  nombre: string;
  /** Firma: los primeros bytes de todo archivo de este tipo. */
  firma: readonly number[];
}

export const TIPOS_RECONOCIDOS: readonly TipoArchivo[] = [
  {
    extension: 'jpg',
    alias: ['jpeg'],
    mime: 'image/jpeg',
    nombre: 'JPG',
    firma: [0xff, 0xd8, 0xff],
  },
  {
    extension: 'png',
    alias: [],
    mime: 'image/png',
    nombre: 'PNG',
    firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    extension: 'pdf',
    alias: [],
    mime: 'application/pdf',
    nombre: 'PDF',
    // «%PDF-»
    firma: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
];

/**
 * Tipos reconocidos cuya extensión aparece en la lista del parámetro. Devuelve aparte las
 * extensiones del parámetro que este catálogo no sabe reconocer, para avisarlas en el registro.
 */
export function tiposDeLaLista(extensiones: readonly string[]): {
  tipos: TipoArchivo[];
  desconocidas: string[];
} {
  const tipos: TipoArchivo[] = [];
  const desconocidas: string[] = [];
  for (const extension of new Set(extensiones)) {
    const tipo = TIPOS_RECONOCIDOS.find(
      (candidato) =>
        candidato.extension === extension ||
        candidato.alias.includes(extension),
    );
    if (!tipo) {
      desconocidas.push(extension);
    } else if (!tipos.includes(tipo)) {
      tipos.push(tipo);
    }
  }
  return { tipos, desconocidas };
}

/**
 * Tipo del archivo entre los permitidos, o nulo si no es ninguno. Si el nombre trae una
 * extensión, debe corresponder al contenido: una foto PNG renombrada como «.pdf» se rechaza.
 * Un nombre sin extensión (algunos teléfonos lo envían así) se acepta por su contenido.
 */
export function reconocerTipo(
  nombre: string,
  contenido: Buffer,
  permitidos: readonly TipoArchivo[],
): TipoArchivo | null {
  const tipo = permitidos.find((candidato) =>
    candidato.firma.every((byte, indice) => contenido[indice] === byte),
  );
  if (!tipo) {
    return null;
  }
  const extension = extensionDe(nombre);
  if (
    extension !== null &&
    extension !== tipo.extension &&
    !tipo.alias.includes(extension)
  ) {
    return null;
  }
  return tipo;
}

/**
 * Extensión del nombre en minúscula, sin el punto, o nula si no tiene. Debe empezar por letra:
 * en «clase.2026» el «2026» no es una extensión.
 */
export function extensionDe(nombre: string): string | null {
  const coincidencia = /\.([a-z][a-z0-9]{0,9})$/i.exec(nombre);
  return coincidencia ? coincidencia[1].toLowerCase() : null;
}

/** «JPG, PNG o PDF», para los mensajes. */
export function enumerarTipos(tipos: readonly TipoArchivo[]): string {
  const nombres = tipos.map((tipo) => tipo.nombre);
  return nombres.length <= 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} o ${nombres.at(-1)}`;
}
