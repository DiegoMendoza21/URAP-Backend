import type { Readable } from 'node:stream';

/**
 * Servicio de almacenamiento documental (RF-24, NFR-007). La base de datos guarda solo la
 * clave de cada archivo; el contenido vive aquí. En el prototipo lo atiende un adaptador de
 * disco local (`AlmacenamientoLocal`); en producción se puede cambiar por Amazon S3 con otro
 * adaptador que cumpla esta misma interfaz, sin tocar los servicios que la usan.
 *
 * Ningún adaptador publica los archivos: se leen solo a través del backend, que valida la
 * sesión y los permisos antes de entregarlos.
 */
export interface AlmacenamientoDocumental {
  /**
   * Guarda el contenido bajo `clave`. Las claves las genera el backend y son únicas: nunca
   * vienen del usuario.
   */
  guardar(clave: string, contenido: Buffer): Promise<void>;
  /** Abre el archivo para leerlo. Lanza `ArchivoNoEncontrado` si no existe. */
  abrir(clave: string): Promise<Readable>;
  /** Elimina el archivo. No falla si ya no existe. */
  eliminar(clave: string): Promise<void>;
}

/** Token de inyección del adaptador de almacenamiento. */
export const ALMACENAMIENTO_DOCUMENTAL = Symbol('AlmacenamientoDocumental');

export class ArchivoNoEncontrado extends Error {
  constructor(clave: string) {
    super(`No existe el archivo «${clave}» en el almacenamiento documental.`);
    this.name = 'ArchivoNoEncontrado';
  }
}
