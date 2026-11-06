import { Injectable, Logger } from '@nestjs/common';
import {
  randomBytes,
  scrypt,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITMO = 'scrypt';
const LONGITUD_SAL = 16;
const LONGITUD_CLAVE = 64;

/**
 * Parámetros de costo de scrypt (N = 2^15, r = 8, p = 1), los mínimos que recomienda OWASP.
 * Viajan dentro de cada hash, así que se pueden subir más adelante sin invalidar las
 * contraseñas ya guardadas: cada una se verifica con los parámetros con que se creó.
 */
const COSTO = { N: 2 ** 15, r: 8, p: 1 } as const;

/**
 * Techo de memoria que acepta un hash guardado (scrypt usa 128 · N · r bytes). Admite varios
 * aumentos de costo sobre COSTO (hasta N = 2^18 con r = 8) y descarta un hash corrupto o
 * manipulado que pediría gigas de memoria en cada intento de inicio de sesión.
 */
const MEMORIA_MAXIMA_HASH = 256 * 1024 * 1024;

/** Límites razonables de r y p: OWASP usa r = 8 y p entre 1 y 5. */
const R_MAXIMO = 32;
const P_MAXIMO = 16;

/** Las claves y sales demasiado cortas no son un hash de este servicio. */
const LONGITUD_MINIMA_SAL = 8;
const LONGITUD_MINIMA_CLAVE = 16;

/**
 * Hash y verificación de contraseñas (NFR-005): scrypt con sal aleatoria por contraseña y
 * comparación en tiempo constante. Formato guardado en `usuario.password_hash`:
 *
 *     scrypt$<N>$<r>$<p>$<sal base64url>$<clave derivada base64url>
 */
@Injectable()
export class ContrasenasService {
  private readonly logger = new Logger(ContrasenasService.name);

  async hashear(contrasena: string): Promise<string> {
    const sal = randomBytes(LONGITUD_SAL);
    const clave = await derivar(contrasena, sal, LONGITUD_CLAVE, COSTO);
    return [
      ALGORITMO,
      COSTO.N,
      COSTO.r,
      COSTO.p,
      sal.toString('base64url'),
      clave.toString('base64url'),
    ].join('$');
  }

  /**
   * Indica si la contraseña corresponde al hash. Un hash vacío, mal formado o con parámetros
   * fuera de rango nunca coincide, pero se responde igual de lento para no revelar que no
   * había contraseña. Nunca lanza: el inicio de sesión responde 401, no 500.
   */
  async verificar(
    contrasena: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    const partes = interpretar(hash);
    if (!partes) {
      if (hash) {
        // Una contraseña ilegible es un problema de datos: queda en el registro técnico.
        this.logger.warn(
          'Se ignoró un hash de contraseña con formato inválido.',
        );
      }
      await derivar(
        contrasena,
        randomBytes(LONGITUD_SAL),
        LONGITUD_CLAVE,
        COSTO,
      );
      return false;
    }
    try {
      const calculada = await derivar(
        contrasena,
        partes.sal,
        partes.clave.length,
        partes.costo,
      );
      return timingSafeEqual(calculada, partes.clave);
    } catch (error) {
      this.logger.error(
        'No se pudo verificar un hash de contraseña.',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}

interface PartesHash {
  costo: { N: number; r: number; p: number };
  sal: Buffer;
  clave: Buffer;
}

function interpretar(hash: string | null | undefined): PartesHash | null {
  const partes = hash?.split('$');
  if (partes?.length !== 6 || partes[0] !== ALGORITMO) {
    return null;
  }
  // Solo enteros decimales: Number('') es 0 y Number('0x10') es 16.
  if (!partes.slice(1, 4).every((valor) => /^[1-9]\d{0,9}$/.test(valor))) {
    return null;
  }
  const [N, r, p] = partes.slice(1, 4).map(Number);
  const sal = Buffer.from(partes[4], 'base64url');
  const clave = Buffer.from(partes[5], 'base64url');
  const valido =
    // scrypt exige que N sea una potencia de 2 mayor que 1.
    N > 1 &&
    (N & (N - 1)) === 0 &&
    r <= R_MAXIMO &&
    p <= P_MAXIMO &&
    memoriaRequerida({ N, r }) <= MEMORIA_MAXIMA_HASH &&
    sal.length >= LONGITUD_MINIMA_SAL &&
    clave.length >= LONGITUD_MINIMA_CLAVE;
  return valido ? { costo: { N, r, p }, sal, clave } : null;
}

function memoriaRequerida({ N, r }: { N: number; r: number }): number {
  return 128 * N * r;
}

function derivar(
  contrasena: string,
  sal: Buffer,
  longitud: number,
  costo: PartesHash['costo'],
): Promise<Buffer> {
  // El límite sale del costo de cada hash: subir COSTO no rompe los inicios de sesión. El
  // doble deja margen para los búferes adicionales que scrypt reserva además de 128 · N · r.
  const opciones: ScryptOptions = {
    ...costo,
    maxmem: 2 * memoriaRequerida(costo),
  };
  return new Promise((resolver, rechazar) => {
    scrypt(
      contrasena.normalize('NFKC'),
      sal,
      longitud,
      opciones,
      (error, clave) => (error ? rechazar(error) : resolver(clave)),
    );
  });
}
