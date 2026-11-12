import { Logger, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  MENSAJE_NOTIFICACION_NO_EXISTE,
  NotificacionesService,
} from './notificaciones.service.js';

describe('NotificacionesService', () => {
  const aviso = {
    tipo: 'proyecto_aprobado',
    destinatarios: [5, 6, 5],
    titulo: 'Proyecto docente aprobado',
    mensaje: 'Mensaje',
    entidad: 'proyecto_docente',
    idEntidad: 7,
    urlDestino: '/proyectos-docentes/7',
  };

  function crear(tipo: object | null = { id: 3, activo: true }) {
    const prisma = {
      tipo_notificacion: { findUnique: vi.fn().mockResolvedValue(tipo) },
      notificacion: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const servicio = new NotificacionesService(
      prisma as unknown as PrismaService,
    );
    return { servicio, prisma };
  }

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deja una notificación pendiente por destinatario, sin repetir', async () => {
    const { servicio, prisma } = crear();
    await servicio.notificar(aviso);
    expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
      data: [5, 6].map((id) =>
        expect.objectContaining({
          id_tipo_notificacion: 3,
          id_usuario: id,
          entidad: 'proyecto_docente',
          id_entidad: 7,
          url_destino: '/proyectos-docentes/7',
          leida: false,
          estado_envio: 'pendiente',
        }),
      ),
    });
  });

  it('no notifica si el administrador desactivó el tipo (HU-13-04)', async () => {
    const { servicio, prisma } = crear({ id: 3, activo: false });
    await servicio.notificar(aviso);
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('sin el tipo sembrado, lo registra como error y no lanza', async () => {
    const { servicio, prisma } = crear(null);
    await expect(servicio.notificar(aviso)).resolves.toBeUndefined();
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('un fallo de la base no deshace la operación que notifica', async () => {
    const { servicio, prisma } = crear();
    prisma.notificacion.createMany.mockRejectedValue(new Error('caída'));
    await expect(servicio.notificar(aviso)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('sin destinatarios no consulta nada', async () => {
    const { servicio, prisma } = crear();
    await servicio.notificar({ ...aviso, destinatarios: [] });
    expect(prisma.tipo_notificacion.findUnique).not.toHaveBeenCalled();
  });

  describe('bandeja del usuario (HU-13-01, HU-13-03)', () => {
    const fila = {
      id: 40,
      titulo: 'Proyecto docente devuelto con observaciones',
      mensaje: 'Mensaje',
      url_destino: '/proyectos-docentes/7/diligenciar',
      leida: null,
      created_at: new Date('2026-11-11T15:00:00Z'),
      fecha_lectura: null,
      tipo_notificacion: { codigo: 'proyecto_devuelto' },
    };

    function conBandeja() {
      const prisma = {
        notificacion: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue([fila]),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };
      const servicio = new NotificacionesService(
        prisma as unknown as PrismaService,
      );
      return { servicio, prisma };
    }

    it('lista solo las del usuario, de la más reciente a la más antigua', async () => {
      const { servicio, prisma } = conBandeja();
      const pagina = await servicio.listar(8, {
        pagina: 2,
        tamano: 10,
        filtro: 'todas',
      });

      const consulta = prisma.notificacion.findMany.mock.calls[0][0];
      expect(consulta.where).toEqual({ id_usuario: 8 });
      expect(consulta.orderBy).toEqual([
        { created_at: 'desc' },
        { id: 'desc' },
      ]);
      expect(consulta).toMatchObject({ skip: 10, take: 10 });
      expect(pagina).toEqual({
        elementos: [
          {
            id: 40,
            tipo: 'proyecto_devuelto',
            titulo: 'Proyecto docente devuelto con observaciones',
            mensaje: 'Mensaje',
            urlDestino: '/proyectos-docentes/7/diligenciar',
            leida: false,
            fecha: '2026-11-11T15:00:00.000Z',
            fechaLectura: null,
          },
        ],
        pagina: 2,
        tamano: 10,
        total: 1,
      });
    });

    it('con el filtro «no_leidas» cuenta como no leída también la que tiene `leida` vacío', async () => {
      const { servicio, prisma } = conBandeja();
      await servicio.listar(8, { pagina: 1, tamano: 20, filtro: 'no_leidas' });

      expect(prisma.notificacion.findMany.mock.calls[0][0].where).toEqual({
        id_usuario: 8,
        OR: [{ leida: false }, { leida: null }],
      });
    });

    it('cuenta las no leídas del usuario', async () => {
      const { servicio, prisma } = conBandeja();
      prisma.notificacion.count.mockResolvedValue(4);

      expect(await servicio.contarNoLeidas(8)).toEqual({ noLeidas: 4 });
      expect(prisma.notificacion.count).toHaveBeenCalledWith({
        where: { id_usuario: 8, OR: [{ leida: false }, { leida: null }] },
      });
    });

    it('marca como leída una notificación propia, con la fecha de lectura', async () => {
      const { servicio, prisma } = conBandeja();
      prisma.notificacion.findFirst.mockResolvedValue(fila);
      prisma.notificacion.update.mockResolvedValue({
        ...fila,
        leida: true,
        fecha_lectura: new Date('2026-11-11T16:00:00Z'),
      });

      const leida = await servicio.marcarLeida(8, 40);

      expect(prisma.notificacion.findFirst.mock.calls[0][0].where).toEqual({
        id: 40,
        id_usuario: 8,
      });
      expect(prisma.notificacion.update.mock.calls[0][0]).toMatchObject({
        where: { id: 40 },
        data: { leida: true, fecha_lectura: expect.any(Date) },
      });
      expect(leida).toMatchObject({
        leida: true,
        fechaLectura: '2026-11-11T16:00:00.000Z',
      });
    });

    it('una notificación ajena o inexistente responde 404 y no se toca', async () => {
      const { servicio, prisma } = conBandeja();
      prisma.notificacion.findFirst.mockResolvedValue(null);

      await expect(servicio.marcarLeida(8, 41)).rejects.toThrow(
        new NotFoundException(MENSAJE_NOTIFICACION_NO_EXISTE),
      );
      expect(prisma.notificacion.update).not.toHaveBeenCalled();
    });

    it('una notificación ya leída conserva su fecha de lectura', async () => {
      const { servicio, prisma } = conBandeja();
      prisma.notificacion.findFirst.mockResolvedValue({
        ...fila,
        leida: true,
        fecha_lectura: new Date('2026-11-10T08:00:00Z'),
      });

      const leida = await servicio.marcarLeida(8, 40);

      expect(prisma.notificacion.update).not.toHaveBeenCalled();
      expect(leida.fechaLectura).toBe('2026-11-10T08:00:00.000Z');
    });

    it('marca todas las pendientes del usuario y dice cuántas fueron', async () => {
      const { servicio, prisma } = conBandeja();

      expect(await servicio.marcarTodasLeidas(8)).toEqual({ marcadas: 3 });
      expect(prisma.notificacion.updateMany).toHaveBeenCalledWith({
        where: { id_usuario: 8, OR: [{ leida: false }, { leida: null }] },
        data: { leida: true, fecha_lectura: expect.any(Date) },
      });
    });
  });
});
