import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { ArchivoNoEncontrado } from './almacenamiento-documental.js';
import { AlmacenamientoLocal } from './almacenamiento-local.js';

describe('AlmacenamientoLocal', () => {
  let carpeta: string;
  let almacenamiento: AlmacenamientoLocal;

  beforeEach(async () => {
    carpeta = await mkdtemp(path.join(tmpdir(), 'urap-almacenamiento-'));
    almacenamiento = new AlmacenamientoLocal(path.join(carpeta, 'raiz'));
    await almacenamiento.preparar();
  });

  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('guarda, abre y elimina un archivo dentro de la carpeta raíz', async () => {
    const clave = 'evidencias/proyecto-1/archivo.png';
    await almacenamiento.guardar(clave, Buffer.from('contenido'));

    expect(
      await readFile(
        path.join(carpeta, 'raiz', 'evidencias', 'proyecto-1', 'archivo.png'),
        'utf8',
      ),
    ).toBe('contenido');
    expect(await text(await almacenamiento.abrir(clave))).toBe('contenido');

    await almacenamiento.eliminar(clave);
    await expect(almacenamiento.abrir(clave)).rejects.toBeInstanceOf(
      ArchivoNoEncontrado,
    );
  });

  it('no deja temporales después de guardar', async () => {
    await almacenamiento.guardar('evidencias/a.pdf', Buffer.from('%PDF-'));
    expect(await readdir(path.join(carpeta, 'raiz', 'evidencias'))).toEqual([
      'a.pdf',
    ]);
  });

  it('avisa cuando el archivo no existe', async () => {
    await expect(
      almacenamiento.abrir('evidencias/no-existe.png'),
    ).rejects.toBeInstanceOf(ArchivoNoEncontrado);
  });

  it('eliminar un archivo que no existe no falla', async () => {
    await expect(
      almacenamiento.eliminar('evidencias/no-existe.png'),
    ).resolves.toBeUndefined();
  });

  it.each([
    '../fuera.png',
    'evidencias/../../fuera.png',
    '/etc/passwd',
    'C:/Windows/archivo.png',
    'evidencias\\..\\fuera.png',
    '',
  ])('rechaza la clave «%s», que podría salir de la carpeta', async (clave) => {
    await expect(
      almacenamiento.guardar(clave, Buffer.from('x')),
    ).rejects.toThrow(/Clave de almacenamiento/);
    await expect(almacenamiento.abrir(clave)).rejects.toThrow(
      /Clave de almacenamiento/,
    );
  });
});
