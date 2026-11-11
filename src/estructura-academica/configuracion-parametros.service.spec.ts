import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PARAMETRO } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { PARAMETROS } from '../datos-iniciales/catalogos.js';
import { ConfiguracionParametrosService } from './configuracion-parametros.service.js';
import {
  CLAVES_PARAMETRO,
  MENSAJE_PARAMETRO_NO_EXISTE,
} from './reglas-parametros.js';

describe('ConfiguracionParametrosService (HU-03-07)', () => {
  const prisma = {
    parametro_sistema: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const auditoria = { registrar: vi.fn() };
  const servicio = new ConfiguracionParametrosService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );
  const administrador = { id: 9 } as UsuarioSesion;
  const fecha = new Date('2026-11-10T15:20:00.000Z');

  const fila = (clave: string, valor: string | null, id = 3) => ({
    id,
    clave,
    valor,
    descripcion: `Descripción de ${clave}`,
    updated_at: fecha,
    usuario: null,
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listar', () => {
    it('devuelve todos los parámetros de PARAMETRO, en su orden, con tipo, rango y autor', async () => {
      prisma.parametro_sistema.findMany.mockResolvedValue([
        {
          ...fila(PARAMETRO.archivoTiposPermitidos, 'jpg,png'),
          usuario: { nombres: 'Administrador', apellidos: 'Demostración' },
        },
        fila(PARAMETRO.alertaDiasAnticipacion, '2'),
        fila(PARAMETRO.revisionBloquearAutoaprobacion, 'si'),
      ]);

      const { elementos } = await servicio.listar();

      expect(prisma.parametro_sistema.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clave: { in: [...CLAVES_PARAMETRO] } },
        }),
      );
      expect(elementos.map(({ clave }) => clave)).toEqual(CLAVES_PARAMETRO);
      expect(elementos[0]).toEqual({
        clave: PARAMETRO.alertaDiasAnticipacion,
        tipoDato: 'entero',
        valor: '2',
        elementos: [],
        descripcion: `Descripción de ${PARAMETRO.alertaDiasAnticipacion}`,
        minimo: 0,
        maximo: 365,
        admiteVacia: false,
        elementosPermitidos: null,
        actualizadoEn: fecha.toISOString(),
        actualizadoPor: null,
      });
      expect(
        elementos.find(
          ({ clave }) => clave === PARAMETRO.revisionBloquearAutoaprobacion,
        ),
      ).toMatchObject({ tipoDato: 'booleano', valor: 'si', minimo: null });
      expect(
        elementos.find(
          ({ clave }) => clave === PARAMETRO.archivoTiposPermitidos,
        ),
      ).toMatchObject({
        tipoDato: 'lista',
        valor: 'jpg,png',
        elementos: ['jpg', 'png'],
        admiteVacia: false,
        actualizadoPor: 'Administrador Demostración',
      });
    });

    it('un parámetro que falta en la base sale sin valor, no desaparece', async () => {
      prisma.parametro_sistema.findMany.mockResolvedValue([]);

      const { elementos } = await servicio.listar();

      expect(elementos).toHaveLength(CLAVES_PARAMETRO.length);
      expect(elementos[0]).toMatchObject({
        valor: null,
        descripcion: null,
        actualizadoEn: null,
        actualizadoPor: null,
      });
    });

    it('dice qué tipos de evidencia se saben verificar y que el catálogo puede quedar vacío', async () => {
      prisma.parametro_sistema.findMany.mockResolvedValue([]);

      const { elementos } = await servicio.listar();
      const de = (clave: string) =>
        elementos.find((elemento) => elemento.clave === clave);

      expect(
        de(PARAMETRO.evidenciaTiposPermitidos)?.elementosPermitidos,
      ).toEqual(['jpg', 'jpeg', 'png', 'pdf']);
      expect(de(PARAMETRO.catalogoEstrategiasEnsenanza)?.admiteVacia).toBe(
        true,
      );
    });
  });

  describe('cambiar', () => {
    it('guarda el valor a nombre de quien lo cambia y lo audita con el anterior y el nuevo', async () => {
      const clave = PARAMETRO.alertaDiasAnticipacion;
      prisma.parametro_sistema.findUnique.mockResolvedValue(fila(clave, '2'));
      prisma.parametro_sistema.upsert.mockResolvedValue({
        ...fila(clave, '5'),
        usuario: { nombres: 'Administrador', apellidos: 'Demostración' },
      });

      const resultado = await servicio.cambiar(
        clave,
        { valor: ' 5 ' },
        administrador,
      );

      expect(prisma.parametro_sistema.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clave },
          update: { valor: '5', id_actualizado_por: administrador.id },
        }),
      );
      expect(auditoria.registrar).toHaveBeenCalledExactlyOnceWith({
        accion: 'actualizar',
        tablaAfectada: 'parametro_sistema',
        idRegistro: 3,
        valorAnterior: { clave, valor: '2' },
        valorNuevo: { clave, valor: '5' },
      });
      expect(resultado).toMatchObject({
        clave,
        valor: '5',
        actualizadoPor: 'Administrador Demostración',
      });
    });

    it('guarda una lista con sus elementos normalizados', async () => {
      const clave = PARAMETRO.archivoTiposPermitidos;
      prisma.parametro_sistema.findUnique.mockResolvedValue(
        fila(clave, 'jpg,png,pdf,xlsx,docx'),
      );
      prisma.parametro_sistema.upsert.mockResolvedValue(
        fila(clave, 'pdf,xlsx'),
      );

      const resultado = await servicio.cambiar(
        clave,
        { elementos: ['.PDF', 'xlsx'] },
        administrador,
      );

      expect(prisma.parametro_sistema.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { valor: 'pdf,xlsx', id_actualizado_por: administrador.id },
        }),
      );
      expect(resultado.elementos).toEqual(['pdf', 'xlsx']);
    });

    it('si el valor es el que ya tenía, no escribe ni audita', async () => {
      const clave = PARAMETRO.revisionBloquearAutoaprobacion;
      prisma.parametro_sistema.findUnique.mockResolvedValue(fila(clave, 'si'));

      const resultado = await servicio.cambiar(
        clave,
        { valor: 'Sí' },
        administrador,
      );

      expect(resultado).toMatchObject({ clave, valor: 'si' });
      expect(prisma.parametro_sistema.upsert).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('si la fila falta en la base, la crea con el tipo y la descripción iniciales', async () => {
      const clave = PARAMETRO.inicioSesionIntentosMaximos;
      prisma.parametro_sistema.findUnique.mockResolvedValue(null);
      prisma.parametro_sistema.upsert.mockResolvedValue(fila(clave, '4', 12));

      await servicio.cambiar(clave, { valor: '4' }, administrador);

      expect(prisma.parametro_sistema.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            clave,
            valor: '4',
            tipo_dato: 'entero',
            descripcion: PARAMETROS.find(
              (parametro) => parametro.clave === clave,
            )?.descripcion,
            id_actualizado_por: administrador.id,
          },
        }),
      );
      expect(auditoria.registrar).toHaveBeenCalledExactlyOnceWith({
        accion: 'crear',
        tablaAfectada: 'parametro_sistema',
        idRegistro: 12,
        valorNuevo: { clave, valor: '4' },
      });
    });

    it.each([
      'parametro_inventado',
      'jwt_expiracion_minutos',
      'jwt_secreto',
      'constructor',
    ])('responde 404 con la clave «%s» sin tocar la base', async (clave) => {
      const intento = servicio.cambiar(clave, { valor: '1' }, administrador);

      await expect(intento).rejects.toBeInstanceOf(NotFoundException);
      await expect(intento).rejects.toThrow(MENSAJE_PARAMETRO_NO_EXISTE);
      expect(prisma.parametro_sistema.findUnique).not.toHaveBeenCalled();
      expect(prisma.parametro_sistema.upsert).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('un valor inválido responde 400 sin escribir ni auditar', async () => {
      await expect(
        servicio.cambiar(
          PARAMETRO.inicioSesionIntentosMaximos,
          { valor: '0' },
          administrador,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.parametro_sistema.findUnique).not.toHaveBeenCalled();
      expect(prisma.parametro_sistema.upsert).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });
});
