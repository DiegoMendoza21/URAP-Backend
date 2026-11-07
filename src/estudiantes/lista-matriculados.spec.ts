import writeXlsxFile from 'write-excel-file/node';
import {
  ERRORES_MAXIMOS_DETALLADOS,
  leerListaMatriculados,
  MENSAJE_ARCHIVO_NO_LEGIBLE,
  MENSAJE_ARCHIVO_VACIO,
  MENSAJE_FORMATO_COLUMNAS,
  validarFilas,
} from './lista-matriculados.js';

// Estudiantes ficticios: nunca datos reales (Ley 1581 de 2012).
const TITULOS = ['Documento', 'Nombres', 'Apellidos', 'Correo'];

describe('lista de matriculados (RF-22, HU-09-01)', () => {
  it('lee las filas y normaliza documento, espacios y correo', () => {
    const resultado = validarFilas([
      TITULOS,
      [
        '1.000.000.001',
        ' Estudiante   Uno ',
        'Ficticio Demo',
        'UNO@EJEMPLO.EDU.CO',
      ],
      ['ce-2000002', 'Estudiante Dos', 'Ficticio Demo', null],
    ]);

    expect(resultado).toEqual({
      tipo: 'valido',
      estudiantes: [
        {
          fila: 2,
          documento: '1000000001',
          nombres: 'Estudiante Uno',
          apellidos: 'Ficticio Demo',
          correo: 'uno@ejemplo.edu.co',
        },
        {
          fila: 3,
          documento: 'CE-2000002',
          nombres: 'Estudiante Dos',
          apellidos: 'Ficticio Demo',
          correo: null,
        },
      ],
    });
  });

  it('acepta títulos en otro orden, con tildes, y omite columnas extra y filas vacías', () => {
    const resultado = validarFilas([
      [null, null, null, null],
      ['Apellidos', 'Programa', 'Número de identificación', 'Nombre(s)'],
      ['Ficticio', 'Adm. Industrial', '1000000003', 'Estudiante Tres'],
      [null, '', null, null],
    ]);

    expect(resultado).toEqual({
      tipo: 'valido',
      estudiantes: [
        {
          fila: 3,
          documento: '1000000003',
          nombres: 'Estudiante Tres',
          apellidos: 'Ficticio',
          correo: null,
        },
      ],
    });
  });

  it('rechaza el archivo completo si hay documentos repetidos y dice en qué filas', () => {
    const resultado = validarFilas([
      TITULOS,
      ['1000000001', 'Estudiante Uno', 'Ficticio', null],
      ['1000000002', 'Estudiante Dos', 'Ficticio', null],
      ['1.000.000.001', 'Estudiante Uno Bis', 'Ficticio', null],
    ]);

    expect(resultado).toEqual({
      tipo: 'invalido',
      mensaje: expect.stringContaining(
        'no se guardó ningún estudiante',
      ) as string,
      errores: [
        'Fila 4: el documento 1000000001 está repetido (ya aparece en la fila 2).',
      ],
    });
  });

  it('explica cada problema de cada fila', () => {
    const resultado = validarFilas([
      TITULOS,
      [null, 'Estudiante', 'Ficticio', null],
      ['10#20', null, 'Ficticio', 'sin-arroba'],
      ['1000000004', 'Estudiante', 'x'.repeat(101), null],
    ]);

    expect(resultado).toMatchObject({
      tipo: 'invalido',
      mensaje: expect.stringMatching(
        /^3 filas del archivo tienen errores/,
      ) as string,
      errores: [
        'Fila 2: falta el documento.',
        'Fila 3: el documento «10#20» no es válido: use solo números, letras o guion, entre 3 y 20 caracteres; faltan los nombres; el correo «sin-arroba» no es válido.',
        'Fila 4: los apellidos superan 100 caracteres.',
      ],
    });
  });

  it('pide las columnas que faltan', () => {
    expect(
      validarFilas([
        ['Documento', 'Correo'],
        ['1000000001', null],
      ]),
    ).toEqual({
      tipo: 'invalido',
      mensaje: MENSAJE_FORMATO_COLUMNAS,
      errores: ['Faltan las columnas: Nombres, Apellidos.'],
    });
  });

  it('pide separar nombres y apellidos cuando vienen juntos', () => {
    expect(
      validarFilas([
        ['Documento', 'Nombres y apellidos'],
        ['1', 'x'],
      ]),
    ).toMatchObject({
      tipo: 'invalido',
      errores: [
        'Faltan las columnas: Nombres, Apellidos.',
        'La columna «Nombres y apellidos» junta nombres y apellidos: sepárelos en dos columnas.',
      ],
    });
  });

  it('rechaza una columna repetida', () => {
    expect(
      validarFilas([['Documento', 'Nombres', 'Apellidos', 'Cédula'], []]),
    ).toMatchObject({
      tipo: 'invalido',
      errores: [
        'La columna Documento aparece dos veces en la fila de títulos.',
      ],
    });
  });

  it('rechaza un archivo sin estudiantes', () => {
    expect(validarFilas([])).toMatchObject({ mensaje: MENSAJE_ARCHIVO_VACIO });
    expect(validarFilas([TITULOS, [null, null, null, null]])).toMatchObject({
      mensaje: MENSAJE_ARCHIVO_VACIO,
    });
  });

  it('detalla hasta un máximo de errores y cuenta el resto', () => {
    const filas = [
      TITULOS,
      ...Array.from({ length: ERRORES_MAXIMOS_DETALLADOS + 3 }, () => [
        null,
        'Estudiante',
        'Ficticio',
        null,
      ]),
    ];
    const resultado = validarFilas(filas);

    expect(resultado.tipo).toBe('invalido');
    if (resultado.tipo === 'invalido') {
      expect(resultado.errores).toHaveLength(ERRORES_MAXIMOS_DETALLADOS + 1);
      expect(resultado.errores.at(-1)).toBe('… y 3 filas más con errores.');
    }
  });

  it('lee un libro de Excel real sin perder dígitos del documento', async () => {
    const libro = await writeXlsxFile([
      TITULOS.map((titulo) => ({ value: titulo })),
      [
        { value: 1000000001234 },
        { value: 'Estudiante Uno' },
        { value: 'Ficticio' },
        null,
      ],
    ]).toBuffer();

    expect(await leerListaMatriculados(libro)).toMatchObject({
      tipo: 'valido',
      estudiantes: [{ fila: 2, documento: '1000000001234' }],
    });
  });

  it('rechaza un archivo que no es un libro de Excel', async () => {
    expect(
      await leerListaMatriculados(Buffer.from('Documento,Nombres\n1,Uno')),
    ).toEqual({
      tipo: 'invalido',
      mensaje: MENSAJE_ARCHIVO_NO_LEGIBLE,
      errores: [],
    });
  });
});
