import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { SaludService } from './salud.service.js';

describe('SaludService', () => {
  const prisma = { $queryRaw: vi.fn() };
  const servicio = new SaludService(prisma as unknown as PrismaService);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('informa disponible cuando la base de datos responde', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ 1: 1 }]);

    await expect(servicio.verificar()).resolves.toMatchObject({
      estado: 'disponible',
    });
  });

  it('responde 503 y registra el fallo cuando la base de datos no responde', async () => {
    const registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.$queryRaw.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:3307'),
    );

    await expect(servicio.verificar()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(registrarError).toHaveBeenCalled();
  });
});
