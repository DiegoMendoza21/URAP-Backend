import {
  ADVERTENCIA_SIN_COHORTE,
  ADVERTENCIA_SIN_META,
  ADVERTENCIA_SIN_VALORAR,
  consolidar,
  type EntradaConsolidado,
  porcentaje,
} from './consolidado.js';

const NIVELES = [
  { valor: 1, etiqueta: 'Principiante' },
  { valor: 2, etiqueta: 'En Desarrollo' },
  { valor: 3, etiqueta: 'Competente' },
  { valor: 4, etiqueta: 'Ejemplar' },
];

/**
 * Conteos de la medición real del RAP 2 en Finanzas a corto plazo, 2024-1, valoración
 * formativa, 34 estudiantes (docs/datos-institucionales.md, apartado 3). Solo los conteos: la
 * medición original tiene nombres reales y no entra al repositorio (Ley 1581 de 2012).
 */
const CONTEOS_RAP2_2024_1 = [
  [0, 5, 29, 0],
  [0, 10, 24, 0],
  [0, 17, 17, 0],
  [0, 17, 17, 0],
];

function entrada(
  cambios: Partial<EntradaConsolidado> = {},
  conteos = CONTEOS_RAP2_2024_1,
): EntradaConsolidado {
  return {
    niveles: NIVELES,
    umbralCumplimiento: 3,
    porcentajeEsperado: null,
    tamanoCohorte: null,
    totalEstudiantes: 34,
    indicadores: conteos.map((fila, i) => ({
      idIndicador: 100 + i,
      numero: i + 1,
      descripcion: `Indicador ${i + 1}`,
      instrumento: null,
      descripcionInstrumento: null,
      conteos: new Map(fila.map((cantidad, j) => [j + 1, cantidad])),
    })),
    ...cambios,
  };
}

describe('consolidar · RF-31', () => {
  it('reproduce la medición real del RAP 2 de 2024-1 (prueba de aceptación)', () => {
    const resultado = consolidar(entrada());
    expect(resultado.indicadores.map((i) => i.porcentajeCumplimiento)).toEqual([
      85.29, 70.59, 50, 50,
    ]);
    expect(resultado.indicadores.map((i) => i.muestra)).toEqual([
      34, 34, 34, 34,
    ]);
    expect(resultado.indicadores[0].conteos).toEqual([
      { valor: 1, etiqueta: 'Principiante', cantidad: 0, porcentaje: 0 },
      { valor: 2, etiqueta: 'En Desarrollo', cantidad: 5, porcentaje: 14.71 },
      { valor: 3, etiqueta: 'Competente', cantidad: 29, porcentaje: 85.29 },
      { valor: 4, etiqueta: 'Ejemplar', cantidad: 0, porcentaje: 0 },
    ]);
    expect(resultado.tamanoMuestra).toBe(34);
    expect(resultado.nivelesCumplimiento).toEqual(['Competente', 'Ejemplar']);
    // Promedio de los cuatro indicadores: 87 / 136.
    expect(resultado.porcentajeCumplimiento).toBe(63.97);
  });

  it('sin meta definida no emite juicio de cumplimiento (excepción de p4)', () => {
    const resultado = consolidar(entrada());
    expect(resultado.metaDefinida).toBe(false);
    expect(resultado.alcanzado).toBeNull();
    expect(resultado.indicadores.every((i) => i.alcanzado === null)).toBe(true);
    expect(resultado.advertencias).toContain(ADVERTENCIA_SIN_META);
  });

  it('con meta compara cada indicador y el promedio', () => {
    const resultado = consolidar(entrada({ porcentajeEsperado: 70 }));
    expect(resultado.indicadores.map((i) => i.alcanzado)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(resultado.alcanzado).toBe(false);
    expect(resultado.advertencias).not.toContain(ADVERTENCIA_SIN_META);
    expect(consolidar(entrada({ porcentajeEsperado: 63.97 })).alcanzado).toBe(
      true,
    );
  });

  it('sin cohorte registrada toma la muestra y lo advierte (excepción de p3)', () => {
    const sinCohorte = consolidar(entrada());
    expect(sinCohorte.tamanoCohorte).toBe(34);
    expect(sinCohorte.cohorteRegistrada).toBe(false);
    expect(sinCohorte.advertencias).toContain(ADVERTENCIA_SIN_COHORTE);

    const conCohorte = consolidar(entrada({ tamanoCohorte: 40 }));
    expect(conCohorte.tamanoCohorte).toBe(40);
    expect(conCohorte.cohorteRegistrada).toBe(true);
    expect(conCohorte.advertencias).not.toContain(ADVERTENCIA_SIN_COHORTE);
    // La cohorte no cambia ningún porcentaje.
    expect(conCohorte.porcentajeCumplimiento).toBe(63.97);
  });

  it('excluye de la muestra a los sin valorar y los cuenta (RF-30, excepción de p6)', () => {
    const resultado = consolidar(
      entrada({}, [
        [0, 5, 29, 0],
        [0, 10, 24, 0],
        [0, 17, 17, 0],
        [0, 16, 16, 0],
      ]),
    );
    expect(resultado.indicadores[3]).toMatchObject({
      muestra: 32,
      sinValorar: 2,
      porcentajeCumplimiento: 50,
    });
    expect(resultado.advertencias).toContain(ADVERTENCIA_SIN_VALORAR);
  });

  it('un indicador sin valoraciones no tiene porcentaje ni entra al promedio', () => {
    const resultado = consolidar(
      entrada({}, [
        [0, 5, 29, 0],
        [0, 0, 0, 0],
      ]),
    );
    expect(resultado.indicadores[1].porcentajeCumplimiento).toBeNull();
    expect(resultado.porcentajeCumplimiento).toBe(85.29);
  });

  it('usa el umbral de la escala, no un nivel fijo', () => {
    const resultado = consolidar(entrada({ umbralCumplimiento: 2 }));
    expect(resultado.indicadores[0].porcentajeCumplimiento).toBe(100);
    expect(resultado.nivelesCumplimiento).toEqual([
      'En Desarrollo',
      'Competente',
      'Ejemplar',
    ]);
  });

  it('una medición vacía no tiene resultado', () => {
    const resultado = consolidar(entrada({}, []));
    expect(resultado.porcentajeCumplimiento).toBeNull();
    expect(resultado.tamanoMuestra).toBe(0);
    expect(resultado.alcanzado).toBeNull();
  });
});

describe('porcentaje', () => {
  it('redondea a dos decimales', () => {
    expect(porcentaje(29, 34)).toBe(85.29);
    expect(porcentaje(24, 34)).toBe(70.59);
    expect(porcentaje(1, 3)).toBe(33.33);
    expect(porcentaje(2, 3)).toBe(66.67);
    expect(porcentaje(0, 0)).toBe(0);
  });
});
