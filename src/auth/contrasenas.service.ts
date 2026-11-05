import { Injectable } from '@nestjs/common';
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

/** scrypt usa 128 · N · r bytes; el límite por defecto de Node (32 MiB) no alcanza para N = 2^15. */
const MEMORIA_MAXIMA = 64 * 1024 * 1024;

/**
 * Hash y verificación de contraseñas (NFR-005): scrypt con sal aleatoria por contraseña y
 * comparación en tiempo constante. Formato guardado en `usuario.password_hash`:
 *
 *     scrypt$<N>$<r>$<p>$<sal base64url>$<clave derivada base64url>
 */
@Injectable()
export class ContrasenasService {
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
   * Indica si la contraseña corresponde al hash. Un hash vacío o mal formado nunca
   * coincide, pero se responde igual de lento para no revelar que no había contraseña.
   */
  async verificar(
    contrasena: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    const partes = interpretar(hash);
    if (!partes) {
      await derivar(
        contrasena,
        randomBytes(LONGITUD_SAL),
        LONGITUD_CLAVE,
        COSTO,
      );
      return false;
    }
    const calculada = await derivar(
      contrasena,
      partes.sal,
      partes.clave.length,
      partes.costo,
    );
    return timingSafeEqual(calculada, partes.clave);
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
  const [N, r, p] = partes.slice(1, 4).map(Number);
  const sal = Buffer.from(partes[4], 'base64url');
  const clave = Buffer.from(partes[5], 'base64url');
  const valido =
    [N, r, p].every((valor) => Number.isSafeInteger(valor) && valor > 0) &&
    sal.length > 0 &&
    clave.length > 0;
  return valido ? { costo: { N, r, p }, sal, clave } : null;
}

function derivar(
  contrasena: string,
  sal: Buffer,
  longitud: number,
  costo: PartesHash['costo'],
): Promise<Buffer> {
  const opciones: ScryptOptions = { ...costo, maxmem: MEMORIA_MAXIMA };
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
