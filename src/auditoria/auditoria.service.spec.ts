import { Logger } from '@nestjs/common';
import { ejecutarEnContexto } from '../common/contexto/contexto-peticion.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  AuditoriaService,
  TIEMPO_MAXIMO_AUDITORIA_MS,
  VALOR_OMITIDO,
} from './auditoria.service.js';

describe('AuditoriaService', () => {
  const prisma = { auditoria: { create: vi.fn() } };
  const servicio = new AuditoriaService(prisma as unknown as PrismaService);
  const evento = {
    accion: 'actualizar' as const,
    tablaAfectada: 'usuario',
    idRegistro: 7,
    valorAnterior: { intentos_fallidos: 5 },
    valorNuevo: { intentos_fallidos: 0 },
  };
  let registrarError: ReturnType<typeof vi.spyOn>;
  let registrarAviso: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    prisma.auditoria.create.mockReset().mockResolvedValue({ id: 1 });
    registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    registrarAviso = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const datosGuardados = () =>
    (
      prisma.auditoria.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;

  it('guarda el evento con la fecha y todos sus atributos (RF-29)', async () => {
    await servicio.registrar({ ...evento, idUsuario: 3, ip: '10.0.0.1' });

    expect(datosGuardados()).toEqual({
      id_usuario: 3,
      accion: 'actualizar',
      tabla_afectada: 'usuario',
      id_registro: 7,
      valor_anterior: { intentos_fallidos: 5 },
      valor_nuevo: { intentos_fallidos: 0 },
      fecha: expect.any(Date),
      ip: '10.0.0.1',
    });
  });

  it('toma el usuario y la IP del contexto de la petición si no se indican', async () => {
    await ejecutarEnContexto({ ip: '10.0.0.2', idUsuario: 15 }, () =>
      servicio.registrar(evento),
    );

    expect(datosGuardados()).toMatchObject({ id_usuario: 15, ip: '10.0.0.2' });
  });

  it('con idUsuario null lo registra como acción del sistema aunque haya sesión', async () => {
    await ejecutarEnContexto({ ip: '10.0.0.2', idUsuario: 15 }, () =>
      servicio.registrar({ ...evento, idUsuario: null }),
    );

    expect(datosGuardados()).toMatchObject({
      id_usuario: null,
      ip: '10.0.0.2',
    });
  });

  it('fuera de una petición deja usuario e IP nulos', async () => {
    await servicio.registrar(evento);

    expect(datosGuardados()).toMatchObject({ id_usuario: null, ip: null });
  });

  it('nunca guarda contraseñas ni tokens, a cualquier profundidad', async () => {
    await servicio.registrar({
      ...evento,
      valorAnterior: { password_hash: 'scrypt$...', nombres: 'Ana' },
      valorNuevo: {
        datos: { contrasena: 'x', token: 'y', jti: 'z' },
        lista: [{ JWT_SECRETO: 's', rol: 'Docente' }],
      },
    });

    expect(datosGuardados()).toMatchObject({
      valor_anterior: { password_hash: VALOR_OMITIDO, nombres: 'Ana' },
      valor_nuevo: {
        datos: {
          contrasena: VALOR_OMITIDO,
          token: VALOR_OMITIDO,
          jti: VALOR_OMITIDO,
        },
        lista: [{ JWT_SECRETO: VALOR_OMITIDO, rol: 'Docente' }],
      },
    });
  });

  it('si la auditoría falla, lo registra y no interrumpe la operación (RF-29, p3)', async () => {
    prisma.auditoria.create.mockRejectedValue(new Error('conexión perdida'));

    await expect(servicio.registrar(evento)).resolves.toBeUndefined();
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo registrar en auditoría'),
      expect.any(String),
    );
  });

  it('si la escritura lanza de inmediato, tampoco interrumpe la operación', async () => {
    prisma.auditoria.create.mockImplementation(() => {
      throw new Error('cliente cerrado');
    });

    await expect(servicio.registrar(evento)).resolves.toBeUndefined();
    expect(registrarError).toHaveBeenCalled();
  });

  it('espera como máximo un segundo a la base (RF-29, q1)', async () => {
    vi.useFakeTimers();
    prisma.auditoria.create.mockReturnValue(new Promise(() => undefined));

    const registro = servicio.registrar(evento);
    await vi.advanceTimersByTimeAsync(TIEMPO_MAXIMO_AUDITORIA_MS);

    await expect(registro).resolves.toBeUndefined();
    expect(TIEMPO_MAXIMO_AUDITORIA_MS).toBeLessThanOrEqual(1000);
    expect(registrarAviso).toHaveBeenCalledWith(
      expect.stringContaining('tardó más de 1000 ms'),
    );
  });
});
