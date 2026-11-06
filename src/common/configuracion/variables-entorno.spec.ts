import { Entorno, validarVariablesEntorno } from './variables-entorno.js';

const VARIABLES_VALIDAS: Record<string, unknown> = {
  DATABASE_URL: 'mysql://urap:clave@localhost:3307/urap',
  JWT_SECRETO: 'x'.repeat(32),
  JWT_EXPIRACION_MINUTOS: '480',
  CORS_ORIGENES: 'http://localhost:3000, https://urap.ejemplo.edu.co',
};

function sin(clave: string): Record<string, unknown> {
  const copia = { ...VARIABLES_VALIDAS };
  delete copia[clave];
  return copia;
}

describe('validarVariablesEntorno', () => {
  it('convierte los tipos, separa los orígenes y aplica los valores por defecto', () => {
    const variables = validarVariablesEntorno(VARIABLES_VALIDAS);

    expect(variables.NODE_ENV).toBe(Entorno.Desarrollo);
    expect(variables.PUERTO).toBe(3001);
    expect(variables.JWT_EXPIRACION_MINUTOS).toBe(480);
    expect(variables.CORS_ORIGENES).toEqual([
      'http://localhost:3000',
      'https://urap.ejemplo.edu.co',
    ]);
  });

  it('por defecto no confía en ningún proxy', () => {
    expect(validarVariablesEntorno(VARIABLES_VALIDAS).PROXIES_CONFIABLES).toBe(
      0,
    );
  });

  it('acepta el número de proxies delante de la API', () => {
    expect(
      validarVariablesEntorno({ ...VARIABLES_VALIDAS, PROXIES_CONFIABLES: '1' })
        .PROXIES_CONFIABLES,
    ).toBe(1);
  });

  it.each(['-1', 'si', '1.5', '11'])(
    'rechaza PROXIES_CONFIABLES inválido (%s)',
    (valor) => {
      expect(() =>
        validarVariablesEntorno({
          ...VARIABLES_VALIDAS,
          PROXIES_CONFIABLES: valor,
        }),
      ).toThrow(/PROXIES_CONFIABLES/);
    },
  );

  it('impide arrancar sin secreto JWT', () => {
    expect(() => validarVariablesEntorno(sin('JWT_SECRETO'))).toThrow(
      /JWT_SECRETO/,
    );
  });

  it('rechaza un secreto JWT de menos de 32 caracteres', () => {
    expect(() =>
      validarVariablesEntorno({ ...VARIABLES_VALIDAS, JWT_SECRETO: 'corto' }),
    ).toThrow(/al menos 32 caracteres/);
  });

  it('exige la expiración del token en el entorno', () => {
    expect(() =>
      validarVariablesEntorno(sin('JWT_EXPIRACION_MINUTOS')),
    ).toThrow(/JWT_EXPIRACION_MINUTOS/);
  });

  it('rechaza una URL de base de datos que no es de MySQL', () => {
    expect(() =>
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        DATABASE_URL: 'postgres://urap:clave@localhost:5432/urap',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rechaza orígenes CORS que no son URLs', () => {
    expect(() =>
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        CORS_ORIGENES: 'localhost',
      }),
    ).toThrow(/CORS_ORIGENES/);
  });
});
