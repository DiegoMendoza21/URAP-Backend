import { Logger } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificacionesService } from './notificaciones.service.js';

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
});
