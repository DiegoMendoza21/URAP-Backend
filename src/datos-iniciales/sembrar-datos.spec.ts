import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  LIMITE_TRANSACCION_SEMBRADO_MS,
  sembrarDatosIniciales,
} from './sembrar-datos.js';

/** Un Prisma que solo tiene `$transaction`, con el comportamiento que indique la prueba. */
function prismaCon(transaccion: (...args: unknown[]) => Promise<unknown>) {
  const $transaction = vi.fn(transaccion);
  return { prisma: { $transaction } as unknown as PrismaService, $transaction };
}

describe('sembrarDatosIniciales', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre una sola transacción con el límite del sembrado', async () => {
    const resultado = { resumen: { usuarios: 6 }, archivos: [] };
    const { prisma, $transaction } = prismaCon(() =>
      Promise.resolve(resultado),
    );

    await expect(sembrarDatosIniciales(prisma)).resolves.toBe(resultado);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: LIMITE_TRANSACCION_SEMBRADO_MS,
    });
  });

  it('deja margen para un servidor pequeño: al menos diez minutos', () => {
    expect(LIMITE_TRANSACCION_SEMBRADO_MS).toBeGreaterThanOrEqual(600_000);
  });

  it('si la transacción vence, dice que se pasó el límite y conserva el error original', async () => {
    // Lo que llega al vencer depende de la consulta en curso; aquí, una clave foránea.
    const original = new Error('Foreign key constraint violated');
    const { prisma } = prismaCon(() => {
      vi.setSystemTime(Date.now() + LIMITE_TRANSACCION_SEMBRADO_MS + 500);
      return Promise.reject(original);
    });

    const fallo = await sembrarDatosIniciales(prisma).catch(
      (error: unknown) => error,
    );

    expect(fallo).toBeInstanceOf(Error);
    expect((fallo as Error).message).toMatch(
      /pasó el límite de 10 minutos.*la base quedó como estaba/,
    );
    expect((fallo as Error).cause).toBe(original);
  });

  it('un error antes del límite llega tal cual', async () => {
    const original = new Error('No existe la asignatura «Mercados».');
    const { prisma } = prismaCon(() => {
      vi.setSystemTime(Date.now() + 30_000);
      return Promise.reject(original);
    });

    await expect(sembrarDatosIniciales(prisma)).rejects.toBe(original);
  });
});
