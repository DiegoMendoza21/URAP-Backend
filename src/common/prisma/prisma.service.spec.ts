import { Entorno } from '../configuracion/variables-entorno.js';
import { opcionesConexion } from './prisma.service.js';

const leerCa = (ruta: string) => `CA leída de ${ruta}`;

describe('opcionesConexion', () => {
  it('con sslcert cifra la conexión y verifica el certificado del servidor (RDS, NFR-006)', () => {
    const opciones = opcionesConexion(
      'mysql://urap:cl%40ve@urap.abc123.us-east-1.rds.amazonaws.com:3306/urap' +
        '?sslcert=/certificados/rds.pem&sslaccept=strict',
      Entorno.Produccion,
      leerCa,
    );
    expect(opciones).toEqual({
      host: 'urap.abc123.us-east-1.rds.amazonaws.com',
      port: 3306,
      user: 'urap',
      password: 'cl@ve',
      database: 'urap',
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
        leerCa,
      ),
    ).toMatchObject({ allowPublicKeyRetrieval: false });
  });
});
