import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ParametrosService } from './parametros.service.js';

describe('ParametrosService', () => {
  const prisma = { parametro_sistema: { findUnique: vi.fn() } };
  const servicio = new ParametrosService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lee un entero', async () => {
    prisma.parametro_sistema.findUnique.mockResolvedValue({ valor: ' 2 ' });

    await expect(servicio.entero('alerta_dias_anticipacion')).resolves.toBe(2);
    expect(prisma.parametro_sistema.findUnique).toHaveBeenCalledWith({
      where: { clave: 'alerta_dias_anticipacion' },
      select: { valor: true },
    });
  });

  it('acepta el cero', async () => {
    prisma.parametro_sistema.findUnique.mockResolvedValue({ valor: '0' });

    await expect(servicio.entero('x')).resolves.toBe(0);
  });

  it.each([
    ['no existe', null],
    ['es negativo', { valor: '-1' }],
    ['tiene decimales', { valor: '1.5' }],
    ['no es un número', { valor: 'dos' }],
    ['está vacío', { valor: null }],
  ])('devuelve nulo y lo registra si %s', async (_caso, fila) => {
    const registrar = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.parametro_sistema.findUnique.mockResolvedValue(fila);

    await expect(servicio.entero('x')).resolves.toBeNull();
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});
