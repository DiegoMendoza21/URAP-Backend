import { camposFaltantes } from './informacion-institucional.js';

describe('camposFaltantes (RF-08, p7)', () => {
  it('no marca nada si la asignatura tiene créditos y horas, aunque alguna sea 0', () => {
    expect(
      camposFaltantes({
        creditos: 3,
        horas_tde: 48,
        horas_tdp: 0,
        horas_ti: 96,
      }),
    ).toEqual([]);
  });

  it('lista los datos que faltan con nombres para mostrar', () => {
    expect(
      camposFaltantes({
        creditos: null,
        horas_tde: 48,
        horas_tdp: null,
        horas_ti: 96,
      }),
    ).toEqual(['créditos', 'horas TDP']);
  });

  it('marca todo en una asignatura cargada sin créditos ni horas', () => {
    expect(
      camposFaltantes({
        creditos: null,
        horas_tde: null,
        horas_tdp: null,
        horas_ti: null,
      }),
    ).toEqual(['créditos', 'horas TDE', 'horas TDP', 'horas TI']);
  });
});
