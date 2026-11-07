import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  type AlmacenamientoDocumental,
  ArchivoNoEncontrado,
} from './almacenamiento-documental.js';

/**
 * Segmentos en minúscula, separados por «/», que empiezan por letra o número. Así una clave
 * nunca es absoluta ni contiene «..», y no puede salir de la carpeta raíz.
 */
const CLAVE_VALIDA = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9.-]*)*$/;

/**
 * Adaptador de disco local del almacenamiento documental, para el prototipo. Guarda cada
 * archivo en `<carpeta raíz>/<clave>`. La carpeta raíz sale de la variable de entorno
 * `ALMACENAMIENTO_DIRECTORIO` y debe estar fuera de cualquier carpeta que se sirva por web.
 */
export class AlmacenamientoLocal implements AlmacenamientoDocumental {
  readonly raiz: string;

  constructor(directorio: string) {
    this.raiz = path.resolve(directorio);
  }

  /** Crea la carpeta raíz si no existe y comprueba que se pueda leer y escribir en ella. */
  async preparar(): Promise<void> {
    await mkdir(this.raiz, { recursive: true });
    await access(this.raiz, constants.R_OK | constants.W_OK);
  }

  async guardar(clave: string, contenido: Buffer): Promise<void> {
    const destino = this.ruta(clave);
    await mkdir(path.dirname(destino), { recursive: true });
    // Se escribe en un temporal y luego se renombra: si el proceso se cae a mitad de la
    // escritura, nunca queda un archivo incompleto con la clave definitiva.
    const temporal = `${destino}.${randomUUID()}.parcial`;
    try {
      await writeFile(temporal, contenido, { flag: 'wx' });
      await rename(temporal, destino);
    } catch (error) {
      await rm(temporal, { force: true });
      throw error;
    }
  }

  async abrir(clave: string): Promise<Readable> {
    const origen = this.ruta(clave);
    try {
      await stat(origen);
    } catch (error) {
      if (esNoExiste(error)) {
        throw new ArchivoNoEncontrado(clave);
      }
      throw error;
    }
    return createReadStream(origen);
  }

  async eliminar(clave: string): Promise<void> {
    await rm(this.ruta(clave), { force: true });
  }

  /** Ruta absoluta de una clave, que siempre queda dentro de la carpeta raíz. */
  private ruta(clave: string): string {
    if (!CLAVE_VALIDA.test(clave)) {
      throw new Error(`Clave de almacenamiento inválida: «${clave}».`);
    }
    const ruta = path.join(this.raiz, ...clave.split('/'));
    if (!ruta.startsWith(this.raiz + path.sep)) {
      throw new Error(
        `Clave de almacenamiento fuera de la carpeta: «${clave}».`,
      );
    }
    return ruta;
  }
}

function esNoExiste(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
