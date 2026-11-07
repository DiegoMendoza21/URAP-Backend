import {
  enumerarTipos,
  extensionDe,
  reconocerTipo,
  TIPOS_RECONOCIDOS,
  tiposDeLaLista,
} from './tipos-archivo.js';

// Solo las firmas de cada formato: las pruebas no usan fotos de personas.
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.from('%PDF-1.7\n');
const TEXTO = Buffer.from('no es una imagen');

describe('tipos de archivo', () => {
  const { tipos: todos } = tiposDeLaLista(['jpg', 'png', 'pdf']);

  it.each([
    ['foto.jpg', JPG, 'image/jpeg'],
    ['foto.JPEG', JPG, 'image/jpeg'],
    ['captura.png', PNG, 'image/png'],
    ['acta.pdf', PDF, 'application/pdf'],
    ['1000012345', JPG, 'image/jpeg'],
    ['clase.2026', PNG, 'image/png'],
  ])('reconoce %s por su contenido', (nombre, contenido, mime) => {
    expect(reconocerTipo(nombre, contenido, todos)?.mime).toBe(mime);
  });

  it('rechaza un archivo cuyo contenido no es de ningún tipo permitido', () => {
    expect(reconocerTipo('foto.jpg', TEXTO, todos)).toBeNull();
    expect(reconocerTipo('foto.jpg', Buffer.alloc(0), todos)).toBeNull();
  });

  it('rechaza un archivo cuya extensión no corresponde a su contenido', () => {
    expect(reconocerTipo('captura.pdf', PNG, todos)).toBeNull();
    expect(reconocerTipo('script.exe', JPG, todos)).toBeNull();
  });

  it('solo acepta los tipos de la lista del parámetro', () => {
    const { tipos } = tiposDeLaLista(['png']);
    expect(reconocerTipo('foto.jpg', JPG, tipos)).toBeNull();
    expect(reconocerTipo('captura.png', PNG, tipos)?.extension).toBe('png');
  });

  it('acepta los alias del parámetro y aparta lo que no sabe reconocer', () => {
    const { tipos, desconocidas } = tiposDeLaLista([
      'jpeg',
      'jpg',
      'heic',
      'pdf',
    ]);
    expect(tipos.map((tipo) => tipo.extension)).toEqual(['jpg', 'pdf']);
    expect(desconocidas).toEqual(['heic']);
  });

  it('lee la extensión solo si empieza por letra', () => {
    expect(extensionDe('foto.JPG')).toBe('jpg');
    expect(extensionDe('foto')).toBeNull();
    expect(extensionDe('clase.2026')).toBeNull();
  });

  it('enumera los tipos para los mensajes', () => {
    expect(enumerarTipos(TIPOS_RECONOCIDOS)).toBe('JPG, PNG o PDF');
    expect(enumerarTipos(TIPOS_RECONOCIDOS.slice(0, 1))).toBe('JPG');
  });
});
