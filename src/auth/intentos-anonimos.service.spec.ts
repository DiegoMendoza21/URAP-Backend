import {
  finDelBloqueo,
  IntentosAnonimosService,
  MAXIMO_CORREOS_RECORDADOS,
} from './intentos-anonimos.service.js';

describe('IntentosAnonimosService', () => {
  const limites = { intentosMaximos: 3, minutosBloqueo: 15 };
  const ahora = new Date('2026-11-06T10:00:00Z');
  const enMinutos = (minutos: number) =>
    new Date(ahora.getTime() + minutos * 60_000);

  it('bloquea al llegar al límite, como una cuenta registrada', () => {
    const servicio = new IntentosAnonimosService();

    expect(servicio.registrarFallo('nadie@x.co', limites, ahora)).toBeNull();
    expect(servicio.registrarFallo('nadie@x.co', limites, ahora)).toBeNull();
    expect(servicio.registrarFallo('nadie@x.co', limites, ahora)).toEqual(
      enMinutos(15),
    );
    expect(servicio.bloqueadoHasta('nadie@x.co', enMinutos(14))).toEqual(
      enMinutos(15),
    );
  });

  it('no distingue mayúsculas ni espacios del correo', () => {
    const servicio = new IntentosAnonimosService();
    servicio.registrarFallo('Nadie@X.co', limites, ahora);
    servicio.registrarFallo(' nadie@x.co ', limites, ahora);

    expect(
      servicio.registrarFallo('NADIE@x.CO', limites, ahora),
    ).not.toBeNull();
  });

  it('al vencer el bloqueo, el conteo empieza de nuevo', () => {
    const servicio = new IntentosAnonimosService();
    for (let i = 0; i < 3; i++) {
      servicio.registrarFallo('nadie@x.co', limites, ahora);
    }

    const despues = enMinutos(16);
    expect(servicio.bloqueadoHasta('nadie@x.co', despues)).toBeNull();
    expect(servicio.registrarFallo('nadie@x.co', limites, despues)).toBeNull();
    expect(servicio.registrarFallo('nadie@x.co', limites, despues)).toBeNull();
  });

  it('no guarda el correo en claro', () => {
    const servicio = new IntentosAnonimosService();
    servicio.registrarFallo('nadie@x.co', limites, ahora);

    const claves = [
      ...(
        servicio as unknown as { registros: Map<string, unknown> }
      ).registros.keys(),
    ];
    expect(claves).toHaveLength(1);
    expect(claves[0]).not.toContain('nadie');
    expect(claves[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it(`recuerda como máximo ${MAXIMO_CORREOS_RECORDADOS} correos y olvida primero el más antiguo`, () => {
    const servicio = new IntentosAnonimosService();
    servicio.registrarFallo('primero@x.co', limites, ahora);
    servicio.registrarFallo('primero@x.co', limites, ahora);
    for (let i = 0; i < MAXIMO_CORREOS_RECORDADOS; i++) {
      servicio.registrarFallo(`otro${i}@x.co`, limites, ahora);
    }

    const registros = (
      servicio as unknown as { registros: Map<string, unknown> }
    ).registros;
    expect(registros.size).toBe(MAXIMO_CORREOS_RECORDADOS);
    // «primero» se olvidó: su siguiente fallo vuelve a ser el primero, no el tercero.
    expect(servicio.registrarFallo('primero@x.co', limites, ahora)).toBeNull();
  });
});

describe('finDelBloqueo', () => {
  it('cae en un segundo entero, para que la base no lo redondee hacia arriba', () => {
    const fin = finDelBloqueo(new Date('2026-11-06T10:00:00.750Z'), 15);
    expect(fin.toISOString()).toBe('2026-11-06T10:15:00.000Z');
  });
});
