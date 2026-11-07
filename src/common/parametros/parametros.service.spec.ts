import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ParametrosService } from './parametros.service.js';

describe('ParametrosService', () => {
  const prisma = { parametro_sistema: { findUnique: vi.fn() } };
  const servicio = new ParametrosService(prisma as unknown as PrismaService);
  const rango = { minimo: 1, maximo: 100 };
  let registrarError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devuelve el valor entero del parámetro', async () => {
    prisma.parametro_sistema.findUnique.mockResolvedValue({ valor: ' 5 ' });

    await expect(servicio.leerEntero('intentos', rango)).resolves.toBe(5);
    expect(prisma.parametro_sistema.findUnique).toHaveBeenCalledWith({
      where: { clave: 'intentos' },
      select: { valor: true },
    });
    expect(registrarError).not.toHaveBeenCalled();
  });

  it('devuelve null y registra el error si el parámetro no existe', async () => {
    prisma.parametro_sistema.findUnique.mockResolvedValue(null);

    await expect(servicio.leerEntero('intentos', rango)).resolves.toBeNull();
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining('Falta el parámetro «intentos»'),
    );
  });

  it.each(['', 'cinco', '5.5', '1e2', '0', '101', '-3', null])(
    'devuelve null y registra el error con un valor inválido (%s)',
    async (valor) => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({ valor });

      await expect(servicio.leerEntero('intentos', rango)).resolves.toBeNull();
      expect(registrarError).toHaveBeenCalledOnce();
    },
  );
});

describe('ParametrosService.entero (RF-23)', () => {
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
