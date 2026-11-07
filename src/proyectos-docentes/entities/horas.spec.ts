import { compararHoras, type HorasSemana } from './horas.js';

const semana = (
  horasTde: number | null,
  horasTdp: number | null,
  horasTi: number | null,
): HorasSemana => ({ horasTde, horasTdp, horasTi });

/** Gestión ambiental: 2 créditos, 32 TDE, 0 TDP, 64 TI, 96 h (datos institucionales, §4). */
const gestionAmbiental = {
  horas_tde: 32,
  horas_tdp: 0,
  horas_ti: 64,
  horas_totales: 96,
};

const dieciseis = (fila: HorasSemana) => Array.from({ length: 16 }, () => fila);

describe('compararHoras (RF-15, p4)', () => {
  it('coincide con 16 semanas de 2 TDE y 4 TI en una asignatura de 2 créditos', () => {
    const { comparacion, horasCoinciden } = compararHoras(
      dieciseis(semana(2, 0, 4)),
      gestionAmbiental,
    );
    expect(horasCoinciden).toBe(true);
    expect(comparacion).toEqual([
      { tipo: 'TDE', contenidos: 32, asignatura: 32, diferencia: 0 },
      { tipo: 'TDP', contenidos: 0, asignatura: 0, diferencia: 0 },
      { tipo: 'TI', contenidos: 64, asignatura: 64, diferencia: 0 },
      { tipo: 'Total', contenidos: 96, asignatura: 96, diferencia: 0 },
    ]);
  });

  it('advierte la diferencia sin impedir nada', () => {
    const semanas = dieciseis(semana(2, null, 4)).map((fila, indice) =>
      indice === 15 ? semana(null, null, null) : fila,
    );
    const { comparacion, horasCoinciden } = compararHoras(
      semanas,
      gestionAmbiental,
    );
    expect(horasCoinciden).toBe(false);
    expect(comparacion.find((fila) => fila.tipo === 'TDE')?.diferencia).toBe(
      -2,
    );
    expect(comparacion.find((fila) => fila.tipo === 'Total')).toMatchObject({
      contenidos: 90,
      diferencia: -6,
    });
  });

  it('sin horas en la asignatura no compara ni inventa un valor (RF-08, p7)', () => {
    const { comparacion, horasCoinciden } = compararHoras(
      dieciseis(semana(3, 0, 6)),
      { horas_tde: null, horas_tdp: null, horas_ti: null, horas_totales: null },
    );
    expect(horasCoinciden).toBeNull();
    expect(comparacion.every((fila) => fila.asignatura === null)).toBe(true);
    expect(comparacion.every((fila) => fila.diferencia === null)).toBe(true);
    expect(comparacion.find((fila) => fila.tipo === 'Total')?.contenidos).toBe(
      144,
    );
  });

  it('compara solo lo que la asignatura trae; el total sale de sumar si falta', () => {
    const parcial = compararHoras(dieciseis(semana(2, 0, 4)), {
      horas_tde: 32,
      horas_tdp: null,
      horas_ti: 64,
      horas_totales: null,
    });
    expect(parcial.horasCoinciden).toBe(true);
    expect(
      parcial.comparacion.find((fila) => fila.tipo === 'Total')?.asignatura,
    ).toBeNull();

    const sinTotal = compararHoras(dieciseis(semana(2, 0, 4)), {
      ...gestionAmbiental,
      horas_totales: null,
    });
    expect(
      sinTotal.comparacion.find((fila) => fila.tipo === 'Total')?.asignatura,
    ).toBe(96);
  });
});
