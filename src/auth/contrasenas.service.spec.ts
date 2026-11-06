import { Logger } from '@nestjs/common';
import { randomBytes, scryptSync } from 'node:crypto';
import { ContrasenasService } from './contrasenas.service.js';

/** Hash con el formato del servicio pero con los parámetros de costo indicados. */
function hashCon(
  contrasena: string,
  { N, r, p }: { N: number; r: number; p: number },
): string {
  const sal = randomBytes(16);
  const clave = scryptSync(contrasena, sal, 64, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });
  return [
    'scrypt',
    N,
    r,
    p,
    sal.toString('base64url'),
    clave.toString('base64url'),
  ].join('$');
}

const SAL = randomBytes(16).toString('base64url');
const CLAVE = randomBytes(64).toString('base64url');

describe('ContrasenasService', () => {
  const servicio = new ContrasenasService();

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no guarda la contraseña en texto plano y usa una sal distinta cada vez', async () => {
    const primero = await servicio.hashear('Clave-de-prueba-1');
    const segundo = await servicio.hashear('Clave-de-prueba-1');

    expect(primero).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(primero).not.toContain('Clave-de-prueba-1');
    expect(primero).not.toBe(segundo);
  });

  it('verifica la contraseña correcta y rechaza una incorrecta', async () => {
    const hash = await servicio.hashear('Clave-de-prueba-1');

    await expect(servicio.verificar('Clave-de-prueba-1', hash)).resolves.toBe(
      true,
    );
    await expect(servicio.verificar('Clave-de-prueba-2', hash)).resolves.toBe(
      false,
    );
  });

  describe('hashes creados con otros parámetros de costo', () => {
    it.each([
      ['un costo anterior más bajo', { N: 2 ** 14, r: 8, p: 1 }],
      ['el siguiente paso de costo', { N: 2 ** 16, r: 8, p: 1 }],
      ['otra combinación de r y p', { N: 2 ** 12, r: 16, p: 2 }],
    ])('verifica un hash con %s', async (_caso, costo) => {
      const hash = hashCon('Clave-de-prueba-1', costo);

      await expect(servicio.verificar('Clave-de-prueba-1', hash)).resolves.toBe(
        true,
      );
      await expect(servicio.verificar('otra', hash)).resolves.toBe(false);
    });
  });

  describe('hashes ausentes o malformados: nunca coinciden y nunca lanzan', () => {
    it.each([
      ['nulo', null],
      ['indefinido', undefined],
      ['vacío', ''],
      ['texto plano', 'Clave-de-prueba-1'],
      ['de otro algoritmo', `bcrypt$32768$8$1$${SAL}$${CLAVE}`],
      ['con partes de menos', `scrypt$32768$8$1$${SAL}`],
      ['con partes de más', `scrypt$32768$8$1$${SAL}$${CLAVE}$extra`],
      ['con N = 0', `scrypt$0$8$1$${SAL}$${CLAVE}`],
      ['con N = 1', `scrypt$1$8$1$${SAL}$${CLAVE}`],
      ['con N que no es potencia de 2', `scrypt$3$8$1$${SAL}$${CLAVE}`],
      ['con N negativo', `scrypt$-32768$8$1$${SAL}$${CLAVE}`],
      ['con N en hexadecimal', `scrypt$0x8000$8$1$${SAL}$${CLAVE}`],
      ['con N vacío', `scrypt$$8$1$${SAL}$${CLAVE}`],
      ['con N fraccionario', `scrypt$32768.5$8$1$${SAL}$${CLAVE}`],
      ['que pide gigas de memoria', `scrypt$1048576$8$1$${SAL}$${CLAVE}`],
      ['con r fuera de rango', `scrypt$32768$1000$1$${SAL}$${CLAVE}`],
      ['con p fuera de rango', `scrypt$32768$8$1000$${SAL}$${CLAVE}`],
      ['sin sal', `scrypt$32768$8$1$$${CLAVE}`],
      ['sin clave', `scrypt$32768$8$1$${SAL}$`],
      ['con clave demasiado corta', `scrypt$32768$8$1$${SAL}$AAAA`],
    ])('hash %s', async (_caso, hash) => {
      await expect(servicio.verificar('Clave-de-prueba-1', hash)).resolves.toBe(
        false,
      );
    });
  });
});
