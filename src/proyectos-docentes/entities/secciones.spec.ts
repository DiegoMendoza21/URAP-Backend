import { type DatosCompletitud, SECCIONES } from './secciones.js';

const raps = [
  { id: 1, codigo: 'RAP 1', numero: 1 },
  { id: 2, codigo: null, numero: 2 },
];

function pendientes(clave: string, datos: DatosCompletitud): string[] {
  const seccion = SECCIONES.find((s) => s.clave === clave);
  if (!seccion) {
    throw new Error(`No existe la sección ${clave}`);
  }
  return seccion.pendientes(datos);
}

describe('secciones del proyecto docente', () => {
  it('siguen la numeración del formato FO-DO/PC-001', () => {
    expect(SECCIONES.map(({ numero, clave }) => [numero, clave])).toEqual([
      [2, 'descripcion'],
      [3, 'rac'],
    ]);
  });

  it('la descripción está pendiente si está vacía o solo tiene espacios (RF-11)', () => {
    const base = { raps: [], racs: [] };
    expect(pendientes('descripcion', { ...base, descripcion: null })).toEqual([
      'Redacte la descripción del curso.',
    ]);
    expect(
      pendientes('descripcion', { ...base, descripcion: ' \n ' }),
    ).toHaveLength(1);
    expect(
      pendientes('descripcion', { ...base, descripcion: 'Texto' }),
    ).toEqual([]);
  });

  it('señala cada RAP sin RAC (RF-12, p5)', () => {
    expect(
      pendientes('rac', { descripcion: null, raps, racs: [{ idsRap: [1] }] }),
    ).toEqual(['RAP 2 no tiene RAC asociados.']);
  });

  it('un RAC asociado a varios RAP completa todos ellos (HU-06-03)', () => {
    expect(
      pendientes('rac', {
        descripcion: null,
        raps,
        racs: [{ idsRap: [1, 2] }],
      }),
    ).toEqual([]);
  });
});
