import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ALMACENAMIENTO_DIRECTORIO_DESARROLLO,
  directorioAlmacenamiento,
  Entorno,
  MENSAJE_BASE_SIN_TLS,
  MENSAJE_URL_BASE_ILEGIBLE,
  validarVariablesEntorno,
  type VariablesEntorno,
} from './variables-entorno.js';

const VARIABLES_VALIDAS: Record<string, unknown> = {
  DATABASE_URL: 'mysql://urap:clave@localhost:3307/urap',
  JWT_SECRETO: 'x'.repeat(32),
  JWT_EXPIRACION_MINUTOS: '480',
  CORS_ORIGENES: 'http://localhost:3000, https://urap.ejemplo.edu.co',
};

/** Como Amazon RDS: la URL lleva la CA del servidor, y la conexión va cifrada. */
const URL_CON_TLS =
  'mysql://urap:clave@urap.abc123.us-east-1.rds.amazonaws.com:3306/urap' +
  '?sslcert=/certificados/rds.pem&sslaccept=strict';

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
        DATABASE_URL: URL_CON_TLS,
        ALMACENAMIENTO_DIRECTORIO: '/srv/urap/almacenamiento',
      }).ALMACENAMIENTO_DIRECTORIO,
    ).toBe('/srv/urap/almacenamiento');
  });

  it('en producción exige que la conexión con la base vaya cifrada (NFR-006)', () => {
    expect(() =>
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        NODE_ENV: Entorno.Produccion,
        ALMACENAMIENTO_DIRECTORIO: '/srv/urap/almacenamiento',
      }),
    ).toThrow(MENSAJE_BASE_SIN_TLS);
    expect(
      validarVariablesEntorno({
        ...VARIABLES_VALIDAS,
        NODE_ENV: Entorno.Produccion,
        DATABASE_URL: URL_CON_TLS,
        ALMACENAMIENTO_DIRECTORIO: '/srv/urap/almacenamiento',
      }).DATABASE_URL,
    ).toBe(URL_CON_TLS);
  });

  it.each([
    ['sin sslaccept', '?sslcert=/certificados/rds.pem'],
    [
      'con sslaccept distinto de strict',
      '?sslcert=/certificados/rds.pem&sslaccept=accept_invalid_certs',
    ],
    ['con sslcert vacío', '?sslcert=&sslaccept=strict'],
  ])(
    'en producción rechaza la URL de la base %s: el CLI de Prisma no verificaría el certificado',
    (_caso, parametros) => {
      expect(() =>
        validarVariablesEntorno({
          ...VARIABLES_VALIDAS,
          NODE_ENV: Entorno.Produccion,
          DATABASE_URL: `mysql://urap:clave@urap.abc123.us-east-1.rds.amazonaws.com:3306/urap${parametros}`,
          ALMACENAMIENTO_DIRECTORIO: '/srv/urap/almacenamiento',
        }),
      ).toThrow(MENSAJE_BASE_SIN_TLS);
    },
  );

  it.each([Entorno.Desarrollo, Entorno.Produccion])(
    'en %s rechaza una URL de la base que no se puede leer, sin mostrar la contraseña',
    (entorno) => {
      const contrasena = 'secreta/con?barra';
      let error: unknown;
      try {
        validarVariablesEntorno({
          ...VARIABLES_VALIDAS,
          NODE_ENV: entorno,
          DATABASE_URL: `mysql://urap:${contrasena}@localhost:3307/urap`,
          ALMACENAMIENTO_DIRECTORIO: '/srv/urap/almacenamiento',
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(MENSAJE_URL_BASE_ILEGIBLE);
      expect((error as Error).message).not.toContain(contrasena);
      expect((error as Error).message).not.toContain(MENSAJE_BASE_SIN_TLS);
    },
  );

  it('fuera de producción no exige TLS: la base local no lo tiene', () => {
    expect(validarVariablesEntorno(VARIABLES_VALIDAS).DATABASE_URL).toBe(
      'mysql://urap:clave@localhost:3307/urap',
    );
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

describe('directorioAlmacenamiento', () => {
  it.each([
    ['no está definida', undefined],
    ['está vacía', ''],
    ['solo tiene espacios', '   '],
  ])('usa la carpeta por defecto si la variable %s', (_caso, valor) => {
    expect(directorioAlmacenamiento(valor)).toBe(
      ALMACENAMIENTO_DIRECTORIO_DESARROLLO,
    );
  });

  it('respeta la carpeta configurada', () => {
    expect(directorioAlmacenamiento('/srv/urap/almacenamiento')).toBe(
      '/srv/urap/almacenamiento',
    );
  });

  describe('con la variable vacía en el entorno, como viene en .env.example', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    // La validación deja la variable en undefined, pero ConfigService.get vuelve a leerla de
    // process.env y entrega la cadena vacía: la carpeta raíz sería la carpeta de trabajo.
    it.each(['', '   '])(
      'la carpeta que se obtiene de ConfigService es la por defecto («%s»)',
      async (valor) => {
        for (const [clave, texto] of Object.entries(VARIABLES_VALIDAS)) {
          vi.stubEnv(clave, String(texto));
        }
        vi.stubEnv('NODE_ENV', Entorno.Pruebas);
        vi.stubEnv('ALMACENAMIENTO_DIRECTORIO', valor);

        const modulo = await Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              ignoreEnvFile: true,
              validate: validarVariablesEntorno,
            }),
          ],
        }).compile();
        const config =
          modulo.get<ConfigService<VariablesEntorno, true>>(ConfigService);

        expect(
          directorioAlmacenamiento(
            config.get('ALMACENAMIENTO_DIRECTORIO', { infer: true }),
          ),
        ).toBe(ALMACENAMIENTO_DIRECTORIO_DESARROLLO);
        await modulo.close();
      },
    );
  });
});
