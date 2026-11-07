import { InternalServerErrorException, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PARAMETRO, ParametrosService } from './parametros.service.js';

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

  describe('enteroPositivo y lista: sin el parámetro, la operación se niega', () => {
    it('lee un entero positivo', async () => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({ valor: '10' });

      await expect(
        servicio.enteroPositivo(PARAMETRO.archivoTamanoMaximoMb),
      ).resolves.toBe(10);
    });

    it.each(['0', '-1', 'diez', '1.5', ''])(
      'responde 500 con un valor que no es un entero positivo (%s)',
      async (valor) => {
        prisma.parametro_sistema.findUnique.mockResolvedValue({ valor });

        await expect(
          servicio.enteroPositivo(PARAMETRO.archivoTamanoMaximoMb),
        ).rejects.toThrow(InternalServerErrorException);
        expect(registrarError).toHaveBeenCalledOnce();
      },
    );

    it('lee una lista en minúscula y sin vacíos', async () => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({
        valor: ' JPG, png,,pdf ',
      });

      await expect(
        servicio.lista(PARAMETRO.archivoTiposPermitidos),
      ).resolves.toEqual(['jpg', 'png', 'pdf']);
    });

    it('responde 500 si el parámetro no existe', async () => {
      prisma.parametro_sistema.findUnique.mockResolvedValue(null);

      await expect(
        servicio.lista(PARAMETRO.archivoTiposPermitidos),
      ).rejects.toThrow(InternalServerErrorException);
      expect(registrarError).toHaveBeenCalledWith(
        expect.stringContaining('archivo_tipos_permitidos'),
      );
    });
  });
});
