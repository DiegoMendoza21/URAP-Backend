import {
  contarCompletas,
  type DatosCompletitud,
  describirSemanas,
  evaluarSecciones,
  MENSAJE_PERIODO_SIN_SEMANAS,
  SECCIONES,
  semanasSinTema,
} from './secciones.js';

const raps = [
  { id: 1, codigo: 'RAP 1', numero: 1 },
  { id: 2, codigo: null, numero: 2 },
];

const vacio: DatosCompletitud = {
  descripcion: null,
  raps: [],
  racs: [],
  estrategias: 0,
  contenidos: { numeroSemanas: 16, semanasConTema: [] },
  bibliografia: 0,
};

const rac = (codigo: string, idsRap: number[], evaluaciones = 0) => ({
  codigo,
  idsRap,
  evaluaciones,
});

function pendientes(
  clave: string,
  cambios: Partial<DatosCompletitud> = {},
): string[] {
  const seccion = SECCIONES.find((s) => s.clave === clave);
  if (!seccion) {
    throw new Error(`No existe la sección ${clave}`);
  }
  return seccion.pendientes({ ...vacio, ...cambios });
}

describe('secciones del proyecto docente', () => {
  it('siguen la numeración del formato FO-DO/PC-001', () => {
    expect(SECCIONES.map(({ numero, clave }) => [numero, clave])).toEqual([
      [2, 'descripcion'],
      [3, 'rac'],
      [4, 'estrategias'],
      [5, 'evaluacion'],
      [6, 'contenidos'],
      [7, 'bibliografia'],
    ]);
  });

  it('la descripción está pendiente si está vacía o solo tiene espacios (RF-11)', () => {
    expect(pendientes('descripcion')).toEqual([
      'Redacte la descripción del curso.',
    ]);
    expect(pendientes('descripcion', { descripcion: ' \n ' })).toHaveLength(1);
    expect(pendientes('descripcion', { descripcion: 'Texto' })).toEqual([]);
  });

  it('señala cada RAP sin RAC (RF-12, p5)', () => {
    expect(pendientes('rac', { raps, racs: [rac('RAC 1', [1])] })).toEqual([
      'RAP 2 no tiene RAC asociados.',
    ]);
  });

  it('un RAC asociado a varios RAP completa todos ellos (HU-06-03)', () => {
    expect(pendientes('rac', { raps, racs: [rac('RAC 1', [1, 2])] })).toEqual(
      [],
    );
  });

  it('las estrategias vacías dejan pendiente el punto 4 (RF-13, p4)', () => {
    expect(pendientes('estrategias')).toEqual([
      'Registre al menos una estrategia metodológica.',
    ]);
    expect(pendientes('estrategias', { estrategias: 1 })).toEqual([]);
  });

  describe('punto 5 · evaluación (RF-14)', () => {
    it('sin RAC, remite al punto 3 (precondición)', () => {
      expect(pendientes('evaluacion')).toEqual([
        'Registre primero los RAC del curso en el punto 3.',
      ]);
    });

    it('señala cada RAC sin actividades de evaluación (p4)', () => {
      expect(
        pendientes('evaluacion', {
          racs: [rac('RAC 1', [1], 2), rac('RAC 2', [2], 0)],
        }),
      ).toEqual(['RAC 2 no tiene actividades de evaluación.']);
    });

    it('queda completa cuando todos los RAC tienen evaluación', () => {
      expect(
        pendientes('evaluacion', { racs: [rac('RAC 1', [1], 1)] }),
      ).toEqual([]);
    });
  });

  describe('punto 6 · contenidos (RF-15)', () => {
    it('señala las semanas sin tema, agrupadas (p5)', () => {
      expect(pendientes('contenidos')).toEqual([
        'Las semanas 1 a 16 no tienen tema.',
      ]);
      const conTema = Array.from({ length: 16 }, (_, i) => i + 1).filter(
        (semana) => semana !== 4,
      );
      expect(
        pendientes('contenidos', {
          contenidos: { numeroSemanas: 16, semanasConTema: conTema },
        }),
      ).toEqual(['La semana 4 no tiene tema.']);
    });

    it('queda completa con todas las semanas del período', () => {
      expect(
        pendientes('contenidos', {
          contenidos: { numeroSemanas: 2, semanasConTema: [1, 2] },
        }),
      ).toEqual([]);
    });

    it('sin número de semanas en el período, lo informa en vez de suponerlo', () => {
      expect(
        pendientes('contenidos', {
          contenidos: { numeroSemanas: null, semanasConTema: [] },
        }),
      ).toEqual([MENSAJE_PERIODO_SIN_SEMANAS]);
    });

    it('ignora temas de semanas fuera del período', () => {
      expect(
        semanasSinTema({ numeroSemanas: 3, semanasConTema: [1, 2, 3, 17] }),
      ).toEqual([]);
    });
  });

  it('la bibliografía vacía deja pendiente el punto 7 (RF-16, p4)', () => {
    expect(pendientes('bibliografia')).toEqual([
      'Registre al menos una referencia.',
    ]);
    expect(pendientes('bibliografia', { bibliografia: 3 })).toEqual([]);
  });
});

describe('estado de cada sección (HU-06-09)', () => {
  const estados = (datos: DatosCompletitud) =>
    Object.fromEntries(
      evaluarSecciones(datos).map(({ seccion, estado }) => [
        seccion.clave,
        estado,
      ]),
    );

  it('un proyecto nuevo tiene todas las secciones vacías, salvo el punto 3 sin RAP', () => {
    expect(estados({ ...vacio, raps })).toEqual({
      descripcion: 'vacia',
      rac: 'vacia',
      estrategias: 'vacia',
      evaluacion: 'vacia',
      contenidos: 'vacia',
      bibliografia: 'vacia',
    });
    // Sin RAP no hay RAC que exigir: el punto 3 no tiene pendientes.
    expect(estados(vacio).rac).toBe('completa');
  });

  it('con algo registrado, pero sin terminar, la sección queda incompleta', () => {
    expect(
      estados({
        ...vacio,
        raps,
        racs: [rac('RAC 1', [1], 2), rac('RAC 2', [1])],
        contenidos: { numeroSemanas: 16, semanasConTema: [1, 2] },
      }),
    ).toMatchObject({
      rac: 'incompleta',
      evaluacion: 'incompleta',
      contenidos: 'incompleta',
    });
  });

  it('una sección sin pendientes está completa', () => {
    expect(
      estados({
        descripcion: 'Curso de finanzas.',
        raps,
        racs: [rac('RAC 1', [1, 2], 1)],
        estrategias: 2,
        contenidos: { numeroSemanas: 2, semanasConTema: [1, 2] },
        bibliografia: 1,
      }),
    ).toEqual({
      descripcion: 'completa',
      rac: 'completa',
      estrategias: 'completa',
      evaluacion: 'completa',
      contenidos: 'completa',
      bibliografia: 'completa',
    });
  });

  it('el período sin semanas deja el punto 6 vacío o incompleto, según haya temas', () => {
    const sinSemanas = { numeroSemanas: null, semanasConTema: [] };
    expect(estados({ ...vacio, contenidos: sinSemanas }).contenidos).toBe(
      'vacia',
    );
    expect(
      estados({
        ...vacio,
        contenidos: { ...sinSemanas, semanasConTema: [1] },
      }).contenidos,
    ).toBe('incompleta');
  });

  it('cuenta las secciones completas con dos decimales', () => {
    const evaluadas = evaluarSecciones({
      ...vacio,
      descripcion: 'Curso de finanzas.',
      estrategias: 1,
      bibliografia: 1,
      raps,
    });
    expect(contarCompletas(evaluadas)).toEqual({
      completas: 3,
      total: 6,
      porcentaje: 50,
    });
    expect(contarCompletas(evaluarSecciones({ ...vacio, raps }))).toEqual({
      completas: 0,
      total: 6,
      porcentaje: 0,
    });
  });
});

describe('describirSemanas', () => {
  it('agrupa las semanas seguidas en tramos de tres o más', () => {
    expect(describirSemanas([1, 2, 3, 5, 7, 8])).toBe('1 a 3, 5, 7 y 8');
    expect(describirSemanas([16, 15, 14, 13])).toBe('13 a 16');
    expect(describirSemanas([2, 4])).toBe('2 y 4');
    expect(describirSemanas([9])).toBe('9');
    expect(describirSemanas([])).toBe('');
  });
});
