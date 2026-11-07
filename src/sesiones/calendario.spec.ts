import {
  aFechaColumna,
  aHoraColumna,
  aniosDe,
  aTextoHora,
  diaSemanaDe,
  planificarSesiones,
  semanasDeReceso,
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

  describe('calendario académico 2026-2 (Acuerdo 46 de 2026)', () => {
    // Datos del apartado 6 de datos-institucionales.md: período del 3 de agosto al 27 de
    // noviembre con 16 semanas de clase, cinco festivos de ley dentro del período y el receso
    // de fiestas novembrinas del 9 al 14 de noviembre, cargado con origen institucional.
    const festivosLey = [
      '2026-08-07',
      '2026-08-17',
      '2026-10-12',
      '2026-11-02',
      '2026-11-16',
      '2026-12-08',
    ];
    const receso = [
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ];
    const diasSinClase = new Set([...festivosLey, ...receso]);
    const periodo2026_2 = {
      fechaInicio: aFechaColumna('2026-08-03'),
      fechaFin: aFechaColumna('2026-11-27'),
      numeroSemanas: 16,
      diasSinClase,
    };
    const conUnDia = (dia: number) =>
      planificarSesiones({ ...periodo2026_2, diasClase: [dia] });

    it.each([
      // [día, sesiones generadas, marcadas «Festivo», sesiones de clase]
      ['lunes', 1, 16, 4, 12],
      ['martes', 2, 16, 0, 16],
      ['miércoles', 3, 16, 0, 16],
      ['jueves', 4, 16, 0, 16],
      ['viernes', 5, 16, 1, 15],
    ])(
      'un curso de los %s: %i sesiones, %i festivos y %i de clase',
      (_nombre, dia, generadas, festivos, deClase) => {
        const sesiones = conUnDia(dia);
        const marcadas = sesiones.filter((sesion) =>
          festivosLey.includes(sesion.fecha),
        );

        // RF-19, p2: una sesión por encuentro previsto; el festivo suelto se genera y se marca.
        expect(sesiones).toHaveLength(generadas);
        expect(marcadas).toHaveLength(festivos);
        expect(sesiones.length - marcadas.length).toBe(deClase);
      },
    );

    it('los lunes pierden la semana de receso y quedan cuatro festivos marcados', () => {
      const sesiones = conUnDia(1);

      expect(
        sesiones
          .filter((sesion) => festivosLey.includes(sesion.fecha))
          .map((sesion) => sesion.fecha),
      ).toEqual(['2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16']);
      expect(sesiones.map((sesion) => sesion.fecha)).not.toContain(
        '2026-11-09',
      );
    });

    it('la semana de receso no cuenta: la semana 15 empieza el 16 de noviembre', () => {
      const sesiones = planificarSesiones({
        ...periodo2026_2,
        diasClase: [1, 2, 3, 4, 5, 6],
      });

      expect(
        sesiones.some(
          (sesion) =>
            sesion.fecha >= '2026-11-09' && sesion.fecha <= '2026-11-14',
        ),
      ).toBe(false);
      expect(sesiones.find((s) => s.fecha === '2026-11-07')?.semana).toBe(14);
      expect(sesiones.find((s) => s.fecha === '2026-11-16')?.semana).toBe(15);
      expect(sesiones.at(-1)).toEqual({
        fecha: '2026-11-27',
        semana: 16,
        diaSemana: 5,
      });
      // 16 semanas de clase, sin huecos en la numeración.
      expect([...new Set(sesiones.map((s) => s.semana))]).toEqual(
        Array.from({ length: 16 }, (_, i) => i + 1),
      );
    });

    it('un festivo suelto no corre la numeración', () => {
      const sesiones = conUnDia(1);

      expect(sesiones.find((s) => s.fecha === '2026-08-17')?.semana).toBe(3);
      expect(sesiones.find((s) => s.fecha === '2026-08-24')?.semana).toBe(4);
    });

    it('lista la semana de receso del período', () => {
      expect(
        semanasDeReceso(
          periodo2026_2.fechaInicio,
          periodo2026_2.fechaFin,
          diasSinClase,
        ),
      ).toEqual([{ desde: '2026-11-09', hasta: '2026-11-14' }]);
    });

    it('una semana con clase el sábado no es de receso', () => {
      const sinSabado = new Set(receso.slice(0, 5));

      expect(
        semanasDeReceso(
          periodo2026_2.fechaInicio,
          periodo2026_2.fechaFin,
          sinSabado,
        ),
      ).toEqual([]);
      // Sin receso, hay 17 semanas calendario, pero el período solo tiene 16 de clase.
      expect(
        planificarSesiones({
          ...periodo2026_2,
          diasSinClase: sinSabado,
          diasClase: [6],
        }).map((s) => s.fecha),
      ).toContain('2026-11-14');
    });

    it('una semana de receso puede combinar festivos de ley e institucionales', () => {
      // Jueves y viernes santos de ley y el resto de la semana institucional.
      const semanaSanta = new Set([
        '2026-03-30',
        '2026-03-31',
        '2026-04-01',
        '2026-04-02',
        '2026-04-03',
        '2026-04-04',
      ]);

      expect(
        semanasDeReceso(
          aFechaColumna('2026-02-02'),
          aFechaColumna('2026-05-30'),
          semanaSanta,
        ),
      ).toEqual([{ desde: '2026-03-30', hasta: '2026-04-04' }]);
    });
  });
});
