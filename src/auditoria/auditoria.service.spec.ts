import { Logger } from '@nestjs/common';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditoriaService } from './auditoria.service.js';

describe('AuditoriaService', () => {
  const prisma = { auditoria: { create: vi.fn() } };
  const servicio = new AuditoriaService(prisma as unknown as PrismaService);
  const evento = {
    idUsuario: null,
    accion: 'actualizar' as const,
    tablaAfectada: 'usuario',
    idRegistro: 7,
    valorAnterior: { intentos_fallidos: 5 },
    valorNuevo: { intentos_fallidos: 0 },
    ip: '10.0.0.1',
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('guarda el evento con la fecha y todos sus atributos (RF-29)', async () => {
    prisma.auditoria.create.mockResolvedValue({ id: 1 });

    await servicio.registrar(evento);

    expect(prisma.auditoria.create).toHaveBeenCalledWith({
      data: {
        id_usuario: null,
        accion: 'actualizar',
        tabla_afectada: 'usuario',
        id_registro: 7,
        valor_anterior: { intentos_fallidos: 5 },
        valor_nuevo: { intentos_fallidos: 0 },
        fecha: expect.any(Date),
        ip: '10.0.0.1',
      },
    });
  });

  it('si la auditoría falla, lo registra y no interrumpe la operación (RF-29, p3)', async () => {
    const registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.auditoria.create.mockRejectedValue(new Error('conexión perdida'));

    await expect(servicio.registrar(evento)).resolves.toBeUndefined();
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo registrar en auditoría'),
      expect.any(String),
    );
  });
});
