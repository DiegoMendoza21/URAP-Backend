import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  MENSAJE_TIPO_NOTIFICACION_NO_EXISTE,
  MENSAJE_TIPO_SIN_CAMBIOS,
  TiposNotificacionService,
} from './tipos-notificacion.service.js';

const VENCIDA = {
  id: 3,
  codigo: 'sesion_vencida',
  nombre: 'Sesión vencida',
  activo: true,
  envia_email: null,
};

function crear(actual: object | null = VENCIDA) {
  const prisma = {
    tipo_notificacion: {
      findMany: vi.fn().mockResolvedValue([VENCIDA]),
      findUnique: vi.fn().mockResolvedValue(actual),
      update: vi.fn((args: { data: object }) =>
        Promise.resolve({ ...VENCIDA, ...args.data }),
      ),
    },
  };
  const parametros = { leerEntero: vi.fn().mockResolvedValue(7) };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const servicio = new TiposNotificacionService(
    prisma as unknown as PrismaService,
    parametros as unknown as ParametrosService,
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, prisma, auditoria };
}

describe('TiposNotificacionService (RF-26, HU-13-04)', () => {
  it('lista los tipos con la periodicidad; un vacío vale lo del DBML (verdadero)', async () => {
    const { servicio } = crear();

    await expect(servicio.consultar()).resolves.toEqual({
      tipos: [
        {
          codigo: 'sesion_vencida',
          nombre: 'Sesión vencida',
          activo: true,
          enviaEmail: true,
        },
      ],
      recordatorioSesionesDias: 7,
    });
  });

  it('apaga un tipo y audita solo lo que cambió', async () => {
    const { servicio, prisma, auditoria } = crear();

    const tipo = await servicio.actualizar('sesion_vencida', {
      activo: false,
      enviaEmail: true,
    });

    expect(tipo).toMatchObject({ activo: false, enviaEmail: true });
    expect(prisma.tipo_notificacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: { activo: false } }),
    );
    expect(auditoria.registrar).toHaveBeenCalledWith({
      accion: 'actualizar',
      tablaAfectada: 'tipo_notificacion',
      idRegistro: 3,
      valorAnterior: { activo: true },
      valorNuevo: { activo: false },
    });
  });

  it('sin cambios reales no escribe ni audita', async () => {
    const { servicio, prisma, auditoria } = crear();

    await servicio.actualizar('sesion_vencida', { activo: true });

    expect(prisma.tipo_notificacion.update).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('pide al menos un cambio', async () => {
    const { servicio } = crear();

    const error = await servicio
      .actualizar('sesion_vencida', {})
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      MENSAJE_TIPO_SIN_CAMBIOS,
    );
  });

  it('un código que no existe responde 404', async () => {
    const { servicio } = crear(null);

    const error = await servicio
      .actualizar('no_existe', { activo: false })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(
      MENSAJE_TIPO_NOTIFICACION_NO_EXISTE,
    );
  });
});
