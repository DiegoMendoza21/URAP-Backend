import {
  compararGravedad,
  type DatosGravedad,
  semaforoDelProyecto,
  tienePendientes,
} from './semaforo.js';

const AL_DIA = {
  seccionesIncompletas: 0,
  vencidas: 0,
  incumplidas: 0,
  porVencer: 0,
};

function fila(cambios: Partial<DatosGravedad>): DatosGravedad {
  const datos = { ...AL_DIA, ...cambios };
  return {
    mayorAtraso: null,
    porcentajeSecciones: 100,
    nombre: 'Asignatura',
    ...datos,
    color: cambios.color ?? semaforoDelProyecto(datos).color,
  };
}

describe('semaforoDelProyecto · RF-25, p4', () => {
  it('verde: todo completo y sin sesiones atrasadas ni por vencer', () => {
    expect(semaforoDelProyecto(AL_DIA)).toEqual({
      color: 'verde',
      motivo: 'Al día.',
    });
  });

  it('rojo: hay sesiones vencidas o incumplidas, aunque lo demás esté al día', () => {
    expect(semaforoDelProyecto({ ...AL_DIA, vencidas: 2 })).toEqual({
      color: 'rojo',
      motivo: '2 sesiones vencidas sin registrar.',
    });
    expect(semaforoDelProyecto({ ...AL_DIA, incumplidas: 1 }).color).toBe(
      'rojo',
    );
  });

  it('amarillo: secciones por completar o sesiones por vencer', () => {
    expect(
      semaforoDelProyecto({ ...AL_DIA, seccionesIncompletas: 1, porVencer: 2 }),
    ).toEqual({
      color: 'amarillo',
      motivo: '1 sección del proyecto por completar y 2 sesiones por vencer.',
    });
    expect(semaforoDelProyecto({ ...AL_DIA, porVencer: 1 }).color).toBe(
      'amarillo',
    );
  });
});

describe('compararGravedad · HU-12-02', () => {
  it('ordena rojo, amarillo y verde, y dentro de cada color por atraso', () => {
    const ordenadas = [
      fila({ nombre: 'Verde' }),
      fila({
        nombre: 'Amarillo',
        seccionesIncompletas: 3,
        porcentajeSecciones: 50,
      }),
      fila({ nombre: 'Rojo leve', vencidas: 1, mayorAtraso: 2 }),
      fila({ nombre: 'Rojo grave', vencidas: 4, mayorAtraso: 20 }),
      fila({ nombre: 'Rojo antiguo', vencidas: 1, mayorAtraso: 9 }),
    ].sort(compararGravedad);
    expect(ordenadas.map((f) => f.nombre)).toEqual([
      'Rojo grave',
      'Rojo antiguo',
      'Rojo leve',
      'Amarillo',
      'Verde',
    ]);
  });

  it('con el mismo atraso, va antes el que tiene más secciones incompletas', () => {
    const ordenadas = [
      fila({
        nombre: 'B',
        seccionesIncompletas: 1,
        porcentajeSecciones: 83.33,
      }),
      fila({
        nombre: 'A',
        seccionesIncompletas: 4,
        porcentajeSecciones: 33.33,
      }),
    ].sort(compararGravedad);
    expect(ordenadas.map((f) => f.nombre)).toEqual(['A', 'B']);
  });
});

describe('tienePendientes', () => {
  it('cuenta secciones incompletas y sesiones atrasadas, no las por vencer', () => {
    expect(tienePendientes(AL_DIA)).toBe(false);
    expect(tienePendientes({ ...AL_DIA, porVencer: 3 })).toBe(false);
    expect(tienePendientes({ ...AL_DIA, seccionesIncompletas: 1 })).toBe(true);
    expect(tienePendientes({ ...AL_DIA, incumplidas: 1 })).toBe(true);
  });
});
