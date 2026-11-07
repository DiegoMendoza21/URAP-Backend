import {
  alertaDeSesion,
  type ContextoAlerta,
  diasEntre,
  fechaDeHoy,
  resumirAlertas,
  sumarDias,
} from './alertas.js';

// Hoy es sábado 7 de noviembre de 2026 y el umbral del parámetro es de 2 días (seed).
const abierto: ContextoAlerta = {
  hoy: '2026-11-07',
  umbralDias: 2,
  periodoCerrado: false,
  fechaFinPeriodo: '2026-11-21',
};
const pendiente = { diligenciada: false, esFestivo: false };

describe('alertas de sesiones (RF-23)', () => {
  describe('fechas', () => {
    it('toma la fecha de hoy en Colombia, no en UTC', () => {
      // 8 de noviembre a las 2 a. m. en UTC son las 9 p. m. del 7 en Bogotá.
      expect(fechaDeHoy(new Date('2026-11-08T02:00:00Z'))).toBe('2026-11-07');
      expect(fechaDeHoy(new Date('2026-11-08T05:00:00Z'))).toBe('2026-11-08');
    });

    it('cuenta los días entre dos fechas y suma días, también entre meses', () => {
      expect(diasEntre('2026-10-30', '2026-11-07')).toBe(8);
      expect(diasEntre('2026-11-07', '2026-11-07')).toBe(0);
      expect(diasEntre('2026-11-09', '2026-11-07')).toBe(-2);
      expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
    });
  });

  describe('vencidas (p1 a p3)', () => {
    it('marca vencida una sesión pasada sin registro, con sus días de atraso', () => {
      expect(
        alertaDeSesion({ fecha: '2026-11-04', ...pendiente }, abierto),
      ).toEqual({ alerta: 'vencida', diasAtraso: 3, diasRestantes: null });
    });

    it('ayer ya es vencida, con un día de atraso', () => {
      expect(
        alertaDeSesion({ fecha: '2026-11-06', ...pendiente }, abierto),
      ).toMatchObject({ alerta: 'vencida', diasAtraso: 1 });
    });

    it('una sesión diligenciada no tiene alerta', () => {
      expect(
        alertaDeSesion(
          { fecha: '2026-11-04', diligenciada: true, esFestivo: false },
          abierto,
        ).alerta,
      ).toBeNull();
    });

    it('una sesión de tipo festivo no cuenta como vencida (excepción p2)', () => {
      expect(
        alertaDeSesion(
          { fecha: '2026-11-02', diligenciada: false, esFestivo: true },
          abierto,
        ).alerta,
      ).toBeNull();
    });
  });

  describe('por vencer (p4)', () => {
    it('hoy y los días del umbral están por vencer', () => {
      expect(
        alertaDeSesion({ fecha: '2026-11-07', ...pendiente }, abierto),
      ).toEqual({ alerta: 'por_vencer', diasAtraso: null, diasRestantes: 0 });
      expect(
        alertaDeSesion({ fecha: '2026-11-09', ...pendiente }, abierto),
      ).toMatchObject({ alerta: 'por_vencer', diasRestantes: 2 });
    });

    it('después del umbral no hay alerta', () => {
      expect(
        alertaDeSesion({ fecha: '2026-11-10', ...pendiente }, abierto).alerta,
      ).toBeNull();
    });

    it('el umbral es el del parámetro: con 5 días alcanza más sesiones', () => {
      expect(
        alertaDeSesion(
          { fecha: '2026-11-12', ...pendiente },
          { ...abierto, umbralDias: 5 },
        ),
      ).toMatchObject({ alerta: 'por_vencer', diasRestantes: 5 });
    });

    it('sin el parámetro no marca por vencer, pero sí vencidas', () => {
      const sinUmbral = { ...abierto, umbralDias: null };
      expect(
        alertaDeSesion({ fecha: '2026-11-07', ...pendiente }, sinUmbral).alerta,
      ).toBeNull();
      expect(
        alertaDeSesion({ fecha: '2026-11-06', ...pendiente }, sinUmbral).alerta,
      ).toBe('vencida');
    });

    it('un festivo tampoco queda por vencer', () => {
      expect(
        alertaDeSesion(
          { fecha: '2026-11-09', diligenciada: false, esFestivo: true },
          abierto,
        ).alerta,
      ).toBeNull();
    });
  });

  describe('período cerrado (excepción p4)', () => {
    const cerrado: ContextoAlerta = {
      hoy: '2026-12-15',
      umbralDias: 2,
      periodoCerrado: true,
      fechaFinPeriodo: '2026-11-21',
    };

    it('la vencida pasa a incumplida y deja de acumular días al fin del período', () => {
      expect(
        alertaDeSesion({ fecha: '2026-11-16', ...pendiente }, cerrado),
      ).toEqual({ alerta: 'incumplida', diasAtraso: 5, diasRestantes: null });
    });

    it('los días no cambian aunque pase el tiempo', () => {
      const despues = { ...cerrado, hoy: '2027-02-01' };
      expect(
        alertaDeSesion({ fecha: '2026-11-16', ...pendiente }, despues)
          .diasAtraso,
      ).toBe(5);
    });

    it('no quedan sesiones por vencer', () => {
      const cerradoAntes = { ...cerrado, hoy: '2026-11-20' };
      expect(
        alertaDeSesion({ fecha: '2026-11-21', ...pendiente }, cerradoAntes)
          .alerta,
      ).toBeNull();
    });

    it('lo diligenciado y los festivos siguen sin alerta', () => {
      expect(
        alertaDeSesion(
          { fecha: '2026-11-16', diligenciada: true, esFestivo: false },
          cerrado,
        ).alerta,
      ).toBeNull();
      expect(
        alertaDeSesion(
          { fecha: '2026-11-16', diligenciada: false, esFestivo: true },
          cerrado,
        ).alerta,
      ).toBeNull();
    });
  });

  it('resume las alertas y el mayor atraso', () => {
    expect(
      resumirAlertas([
        { alerta: 'vencida', diasAtraso: 3, diasRestantes: null },
        { alerta: 'vencida', diasAtraso: 10, diasRestantes: null },
        { alerta: 'por_vencer', diasAtraso: null, diasRestantes: 1 },
        { alerta: 'incumplida', diasAtraso: 4, diasRestantes: null },
        { alerta: null, diasAtraso: null, diasRestantes: null },
      ]),
    ).toEqual({ vencidas: 2, porVencer: 1, incumplidas: 1, mayorAtraso: 10 });
    expect(resumirAlertas([]).mayorAtraso).toBeNull();
  });
});
