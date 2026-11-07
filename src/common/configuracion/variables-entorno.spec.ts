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

  it('no exige la carpeta del almacenamiento documental fuera de producción', () => {
    expect(
      validarVariablesEntorno(VARIABLES_VALIDAS).ALMACENAMIENTO_DIRECTORIO,
    ).toBeUndefined();
  });

  it('impide arrancar en producción sin la carpeta del almacenamiento documental', () => {
    expect(() =>
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        NODE_ENV: Entorno.Produccion,
      }),
    ).toThrow(/ALMACENAMIENTO_DIRECTORIO/);
    expect(() =>
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        NODE_ENV: Entorno.Produccion,
        ALMACENAMIENTO_DIRECTORIO: '',
      }),
    ).toThrow(/ALMACENAMIENTO_DIRECTORIO/);
  });

  it('acepta la carpeta del almacenamiento documental en producción', () => {
    expect(
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        NODE_ENV: Entorno.Produccion,
        ALMACENAMIENTO_DIRECTORIO: '/srv/urap/almacenamiento',
      }).ALMACENAMIENTO_DIRECTORIO,
    ).toBe('/srv/urap/almacenamiento');
  });

  it('aplica el límite de inicio de sesión por IP por defecto: 10 cada 60 s', () => {
    const variables = validarVariablesEntorno(VARIABLES_VALIDAS);
    expect(variables.INICIO_SESION_LIMITE_POR_IP).toBe(10);
    expect(variables.INICIO_SESION_VENTANA_SEGUNDOS).toBe(60);
  });

  it.each([
    ['INICIO_SESION_LIMITE_POR_IP', '0'],
    ['INICIO_SESION_LIMITE_POR_IP', 'muchos'],
    ['INICIO_SESION_VENTANA_SEGUNDOS', '0'],
    ['INICIO_SESION_VENTANA_SEGUNDOS', '7200'],
  ])('rechaza %s inválido (%s)', (clave, valor) => {
    expect(() =>
      validarVariablesEntorno({ ...VARIABLES_VALIDAS, [clave]: valor }),
    ).toThrow(new RegExp(clave));
  });

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
