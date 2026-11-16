import {
  BASE_DATOS_CONEXIONES_POR_DEFECTO,
  Entorno,
} from '../configuracion/variables-entorno.js';
import { opcionesConexion } from './prisma.service.js';

const leerCa = (ruta: string) => `CA leída de ${ruta}`;

describe('opcionesConexion', () => {
  it('con sslcert cifra la conexión y verifica el certificado del servidor (RDS, NFR-006)', () => {
    const opciones = opcionesConexion(
      'mysql://urap:cl%40ve@urap.abc123.us-east-1.rds.amazonaws.com:3306/urap' +
        '?sslcert=/certificados/rds.pem&sslaccept=strict',
      Entorno.Produccion,
      20,
      leerCa,
    );
    expect(opciones).toEqual({
      host: 'urap.abc123.us-east-1.rds.amazonaws.com',
      port: 3306,
      user: 'urap',
      password: 'cl@ve',
      database: 'urap',
      connectionLimit: 20,
      ssl: {
        ca: 'CA leída de /certificados/rds.pem',
        rejectUnauthorized: true,
      },
      allowPublicKeyRetrieval: false,
    });
  });

  it('sin sslcert, en local pide la llave pública para caching_sha2_password', () => {
    const opciones = opcionesConexion(
      'mysql://urap:urap_local@localhost:3307/urap',
      Entorno.Desarrollo,
      20,
      leerCa,
    );
    expect(opciones).toMatchObject({
      host: 'localhost',
      port: 3307,
      allowPublicKeyRetrieval: true,
    });
    expect(opciones).not.toHaveProperty('ssl');
  });

  it('en producción nunca pide la llave pública en claro', () => {
    expect(
      opcionesConexion(
        'mysql://urap:clave@db:3306/urap',
        Entorno.Produccion,
        20,
        leerCa,
      ),
    ).toMatchObject({ allowPublicKeyRetrieval: false });
  });

  it('el grupo de conexiones tiene el tamaño de BASE_DATOS_CONEXIONES_MAXIMAS (NFR-001)', () => {
    expect(
      opcionesConexion(
        'mysql://urap:clave@db:3306/urap',
        Entorno.Desarrollo,
        7,
        leerCa,
      ),
    ).toMatchObject({ connectionLimit: 7 });
  });

  it('sin el valor, usa el tamaño por defecto, y no cambia el cifrado', () => {
    const opciones = opcionesConexion(
      'mysql://urap:clave@urap.abc123.us-east-1.rds.amazonaws.com:3306/urap' +
        '?sslcert=/certificados/rds.pem&sslaccept=strict',
      Entorno.Produccion,
      undefined,
      leerCa,
    );
    expect(opciones).toMatchObject({
      connectionLimit: BASE_DATOS_CONEXIONES_POR_DEFECTO,
      ssl: { rejectUnauthorized: true },
      allowPublicKeyRetrieval: false,
    });
  });
});
