import { InternalServerErrorException, Logger } from '@nestjs/common';
import { PARAMETROS } from '../../datos-iniciales/catalogos.js';
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

    await expect(
      servicio.leerEntero(PARAMETRO.inicioSesionIntentosMaximos, rango),
    ).resolves.toBe(5);
    expect(prisma.parametro_sistema.findUnique).toHaveBeenCalledWith({
      where: { clave: PARAMETRO.inicioSesionIntentosMaximos },
      select: { valor: true },
    });
    expect(registrarError).not.toHaveBeenCalled();
  });

  it('devuelve null y registra el error si el parámetro no existe', async () => {
    prisma.parametro_sistema.findUnique.mockResolvedValue(null);

    await expect(
      servicio.leerEntero(PARAMETRO.inicioSesionIntentosMaximos, rango),
    ).resolves.toBeNull();
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining(
        `Falta el parámetro «${PARAMETRO.inicioSesionIntentosMaximos}»`,
      ),
    );
  });

  it.each(['', 'cinco', '5.5', '1e2', '0', '101', '-3', null])(
    'devuelve null y registra el error con un valor inválido (%s)',
    async (valor) => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({ valor });

      await expect(
        servicio.leerEntero(PARAMETRO.inicioSesionIntentosMaximos, rango),
      ).resolves.toBeNull();
      expect(registrarError).toHaveBeenCalledOnce();
    },
  );

  describe('leerSiNo: sin el parámetro, el valor seguro que elige quien lo pide', () => {
    const clave = PARAMETRO.revisionBloquearAutoaprobacion;

    it.each([
      ['si', true],
      [' Sí ', true],
      ['SI', true],
      ['no', false],
      [' No ', false],
    ])('lee «%s» como %s', async (valor, esperado) => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({ valor });

      await expect(servicio.leerSiNo(clave, !esperado)).resolves.toBe(esperado);
      expect(prisma.parametro_sistema.findUnique).toHaveBeenCalledWith({
        where: { clave },
        select: { valor: true },
      });
      expect(registrarError).not.toHaveBeenCalled();
    });

    it.each([null, { valor: null }])(
      'si falta (%o), devuelve el valor por defecto y registra el error',
      async (fila) => {
        prisma.parametro_sistema.findUnique.mockResolvedValue(fila);

        await expect(servicio.leerSiNo(clave, true)).resolves.toBe(true);
        expect(registrarError).toHaveBeenCalledWith(
          expect.stringContaining(`Falta el parámetro «${clave}»`),
        );
      },
    );

    it.each(['', 'quizás', 'true', '1', 'sii'])(
      'con un valor inválido («%s»), devuelve el valor por defecto y registra el error',
      async (valor) => {
        prisma.parametro_sistema.findUnique.mockResolvedValue({ valor });

        await expect(servicio.leerSiNo(clave, false)).resolves.toBe(false);
        expect(registrarError).toHaveBeenCalledOnce();
        expect(registrarError).toHaveBeenCalledWith(
          expect.stringContaining('valor inválido'),
        );
      },
    );
  });

  it('los datos base traen cada parámetro que lee el código, con RF-18 encendido', () => {
    const sembradas = PARAMETROS.map(({ clave }) => clave);
    expect(
      Object.values(PARAMETRO).filter((clave) => !sembradas.includes(clave)),
    ).toEqual([]);
    expect(
      PARAMETROS.find(
        ({ clave }) => clave === PARAMETRO.revisionBloquearAutoaprobacion,
      ),
    ).toMatchObject({ valor: 'si', tipo_dato: 'booleano' });
  });

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

  describe('leerTextos: textos que se muestran, y sin el parámetro la operación sigue', () => {
    it('conserva mayúsculas y tildes, sin espacios de más ni vacíos', async () => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({
        valor: ' Lluvia de ideas,  Matriz C-Q-A ,,Producción   de textos ',
      });

      await expect(
        servicio.leerTextos(PARAMETRO.catalogoEstrategiasAprendizaje),
      ).resolves.toEqual([
        'Lluvia de ideas',
        'Matriz C-Q-A',
        'Producción de textos',
      ]);
      expect(prisma.parametro_sistema.findUnique).toHaveBeenCalledWith({
        where: { clave: PARAMETRO.catalogoEstrategiasAprendizaje },
        select: { valor: true },
      });
      expect(registrarError).not.toHaveBeenCalled();
    });

    it.each([null, { valor: null }])(
      'devuelve una lista vacía y registra el error si el parámetro falta (%o)',
      async (fila) => {
        prisma.parametro_sistema.findUnique.mockResolvedValue(fila);

        await expect(
          servicio.leerTextos(PARAMETRO.catalogoEstrategiasEnsenanza),
        ).resolves.toEqual([]);
        expect(registrarError).toHaveBeenCalledWith(
          expect.stringContaining(
            `Falta el parámetro «${PARAMETRO.catalogoEstrategiasEnsenanza}»`,
          ),
        );
      },
    );

    it('un valor en blanco es una lista vacía, no un error: así se deja sin catálogo', async () => {
      prisma.parametro_sistema.findUnique.mockResolvedValue({ valor: ' ' });

      await expect(
        servicio.leerTextos(PARAMETRO.catalogoEstrategiasEnsenanza),
      ).resolves.toEqual([]);
      expect(registrarError).not.toHaveBeenCalled();
    });
  });
});
