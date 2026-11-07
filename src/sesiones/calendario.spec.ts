import {
  aFechaColumna,
  aHoraColumna,
  aniosDe,
  aTextoHora,
  diaSemanaDe,
  planificarSesiones,
} from './calendario.js';

// Período de demostración del seed (no es el calendario oficial): lunes 3 de agosto a sábado
// 21 de noviembre de 2026, 16 semanas.
const periodo = {
  fechaInicio: aFechaColumna('2026-08-03'),
  fechaFin: aFechaColumna('2026-11-21'),
  numeroSemanas: 16,
};

describe('calendario de sesiones (RF-19)', () => {
  it('reconoce el día de la semana: 1 = lunes … 7 = domingo', () => {
    expect(diaSemanaDe(aFechaColumna('2026-08-03'))).toBe(1);
    expect(diaSemanaDe(aFechaColumna('2026-08-08'))).toBe(6);
    expect(diaSemanaDe(aFechaColumna('2026-08-09'))).toBe(7);
  });

  it('convierte horas de y hacia la columna time', () => {
    expect(aTextoHora(aHoraColumna('07:30'))).toBe('07:30');
    expect(aHoraColumna('18:05').toISOString()).toBe(
      '1970-01-01T18:05:00.000Z',
    );
  });

  it('genera una sesión por día de clase, numerada por semana (p2)', () => {
    const sesiones = planificarSesiones({ ...periodo, diasClase: [1, 3] });

    expect(sesiones).toHaveLength(32);
    expect(sesiones.slice(0, 3)).toEqual([
      { fecha: '2026-08-03', semana: 1, diaSemana: 1 },
      { fecha: '2026-08-05', semana: 1, diaSemana: 3 },
      { fecha: '2026-08-10', semana: 2, diaSemana: 1 },
    ]);
    expect(sesiones.at(-1)).toEqual({
      fecha: '2026-11-18',
      semana: 16,
      diaSemana: 3,
    });
  });

  it('cuenta la semana 1 desde la semana en que inicia el período, aunque empiece a mitad', () => {
    const sesiones = planificarSesiones({
      fechaInicio: aFechaColumna('2026-08-05'), // miércoles
      fechaFin: aFechaColumna('2026-08-17'),
      numeroSemanas: null,
      diasClase: [1, 5],
    });

    expect(sesiones).toEqual([
      { fecha: '2026-08-07', semana: 1, diaSemana: 5 },
      { fecha: '2026-08-10', semana: 2, diaSemana: 1 },
      { fecha: '2026-08-14', semana: 2, diaSemana: 5 },
      { fecha: '2026-08-17', semana: 3, diaSemana: 1 },
    ]);
  });

  it('no pasa del número de semanas del período aunque la fecha final sea posterior', () => {
    const sesiones = planificarSesiones({
      ...periodo,
      numeroSemanas: 2,
      diasClase: [2],
    });

    expect(sesiones.map((sesion) => sesion.semana)).toEqual([1, 2]);
  });

  it('incluye el día final del período', () => {
    const sesiones = planificarSesiones({
      ...periodo,
      numeroSemanas: null,
      diasClase: [6],
    });

    expect(sesiones.at(-1)?.fecha).toBe('2026-11-21');
  });

  it('lista los años que abarca el calendario', () => {
    const sesiones = planificarSesiones({
      fechaInicio: aFechaColumna('2026-12-28'),
      fechaFin: aFechaColumna('2027-01-08'),
      numeroSemanas: null,
      diasClase: [1],
    });

    expect(aniosDe(sesiones)).toEqual([2026, 2027]);
  });
});
