import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContrasenasService } from '../auth/contrasenas.service.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import {
  MENSAJE_FUERA_DE_ALCANCE,
  MENSAJE_NO_INACTIVARSE,
  MENSAJE_ULTIMO_ADMINISTRADOR_USUARIO,
  UsuariosService,
} from './usuarios.service.js';

// Las reglas que la e2e no puede provocar en una base compartida: el último administrador y
// el alcance de quien administra un solo programa. El resto está en test/usuarios.e2e-spec.ts.
describe('UsuariosService · RF-02', () => {
  const fila = {
    id: 20,
    nombres: 'Persona',
    apellidos: 'Ficticia',
    email: 'persona.ficticia@urap.local',
    identificacion: 'DOC-0001',
    id_programa: 1,
    activo: true,
    ultimo_acceso: null,
    bloqueado_hasta: null,
    created_at: null,
    programa_usuario_id_programaToprograma: { nombre: 'Programa uno' },
    usuario_rol_usuario_rol_id_usuarioTousuario: [],
  };
  const tx = {
    $queryRaw: vi.fn(),
    usuario: { update: vi.fn(), count: vi.fn() },
    sesion: { updateMany: vi.fn() },
  };
  const prisma = {
    usuario: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    programa: { findFirst: vi.fn(), count: vi.fn() },
    rol: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  const auditoria = { registrar: vi.fn() };
  const contrasenas = { hashear: vi.fn() };
  const alcance = { alcanceConPermiso: vi.fn() };
  const servicio = new UsuariosService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
    contrasenas as unknown as ContrasenasService,
    alcance as unknown as AlcanceService,
  );
  const administrador = {
    id: 7,
    idSesion: 3,
    permisos: ['usuarios.leer', 'usuarios.administrar'],
  } as UsuarioSesion;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.usuario.findUnique.mockResolvedValue(fila);
    prisma.usuario.findUniqueOrThrow.mockResolvedValue(fila);
    prisma.usuario.findFirst.mockResolvedValue(null);
    prisma.usuario.findMany.mockResolvedValue([fila]);
    prisma.usuario.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation(
      (escritura: (cliente: typeof tx) => unknown) => escritura(tx),
    );
    tx.usuario.count.mockResolvedValue(1);
    alcance.alcanceConPermiso.mockResolvedValue({
      global: true,
      programas: [],
    });
    contrasenas.hashear.mockResolvedValue('scrypt$hash');
  });

  it('ninguna consulta de usuarios selecciona la contraseña', async () => {
    await servicio.listar({ pagina: 1, tamano: 20 }, administrador);
    await servicio.obtener(20, administrador).catch(() => undefined);
    await servicio.editar(20, { nombres: 'Otra' }, administrador);

    const selecciones = [
      ...prisma.usuario.findMany.mock.calls,
      ...prisma.usuario.findFirst.mock.calls,
      ...prisma.usuario.findUnique.mock.calls,
      ...prisma.usuario.findUniqueOrThrow.mock.calls,
    ].map(([argumentos]) => JSON.stringify(argumentos.select));
    expect(selecciones.length).toBeGreaterThan(3);
    for (const seleccion of selecciones) {
      expect(seleccion).not.toContain('password');
    }
  });

  it('el documento solo llega a quien administra', async () => {
    prisma.usuario.findFirst.mockResolvedValue(fila);

    const paraAdministrador = await servicio.obtener(20, administrador);
    const paraConsulta = await servicio.obtener(20, {
      ...administrador,
      permisos: ['usuarios.leer'],
    });

    expect(paraAdministrador.identificacion).toBe('DOC-0001');
    expect(paraConsulta.identificacion).toBeNull();
  });

  it('nadie se inactiva a sí mismo', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ ...fila, id: 7 });

    await expect(
      servicio.cambiarEstado(7, false, administrador),
    ).rejects.toThrow(new ConflictException(MENSAJE_NO_INACTIVARSE));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no inactiva si nadie quedaría administrando usuarios y roles, y no lo audita', async () => {
    tx.usuario.count.mockResolvedValue(0);

    await expect(
      servicio.cambiarEstado(20, false, administrador),
    ).rejects.toThrow(
      new ConflictException(MENSAJE_ULTIMO_ADMINISTRADOR_USUARIO),
    );
    // La comprobación va dentro de la transacción, después del cambio: al lanzar, se deshace.
    expect(tx.usuario.update).toHaveBeenCalledBefore(tx.usuario.count);
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('al inactivar revoca las sesiones abiertas; al reactivar no comprueba administradores', async () => {
    await servicio.cambiarEstado(20, false, administrador);
    expect(tx.sesion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_usuario: 20, revocada_en: null },
      }),
    );

    tx.sesion.updateMany.mockClear();
    tx.usuario.count.mockClear();
    auditoria.registrar.mockClear();
    prisma.usuario.findUnique.mockResolvedValue({ ...fila, activo: false });
    await servicio.cambiarEstado(20, true, administrador);
    expect(tx.sesion.updateMany).not.toHaveBeenCalled();
    expect(tx.usuario.count).not.toHaveBeenCalled();
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        valorAnterior: { activo: false },
        valorNuevo: { activo: true },
      }),
    );
  });

  describe('revocar un rol (HU-02-07)', () => {
    const asignacion = {
      id: 41,
      id_rol: 1,
      id_programa: null,
      fecha_asignacion: new Date('2026-08-03T13:00:00.000Z'),
      rol: { rol_permiso: [{ id_rol: 1 }] },
    };
    const prismaRoles = prisma as typeof prisma & {
      usuario_rol: { findFirst: ReturnType<typeof vi.fn> };
    };
    const txRoles = tx as typeof tx & {
      usuario_rol: { update: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      prismaRoles.usuario_rol = { findFirst: vi.fn() };
      prismaRoles.usuario_rol.findFirst.mockResolvedValue(asignacion);
      txRoles.usuario_rol = { update: vi.fn() };
    });

    it('no revoca si nadie quedaría administrando usuarios y roles, y no lo audita', async () => {
      tx.usuario.count.mockResolvedValue(0);

      await expect(servicio.revocarRol(20, 41, administrador)).rejects.toThrow(
        new ConflictException(MENSAJE_ULTIMO_ADMINISTRADOR_USUARIO),
      );
      expect(txRoles.usuario_rol.update).toHaveBeenCalledBefore(
        tx.usuario.count,
      );
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('la revocación es lógica y guarda en auditoría desde cuándo tenía el rol', async () => {
      await servicio.revocarRol(20, 41, administrador);

      expect(txRoles.usuario_rol.update).toHaveBeenCalledWith({
        where: { id: 41 },
        data: { activo: false, fecha_revocacion: expect.any(Date) },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'usuario_rol',
        idRegistro: 41,
        valorAnterior: {
          activo: true,
          fechaAsignacion: '2026-08-03T13:00:00.000Z',
        },
        valorNuevo: {
          idUsuario: 20,
          idRol: 1,
          idPrograma: null,
          activo: false,
        },
      });
    });
  });

  describe('quien administra un solo programa', () => {
    beforeEach(() => {
      alcance.alcanceConPermiso.mockResolvedValue({
        global: false,
        programas: [1],
      });
    });

    it('no toca a un usuario de otro programa', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ ...fila, id_programa: 2 });

      await expect(
        servicio.editar(20, { nombres: 'Otra' }, administrador),
      ).rejects.toThrow(new ForbiddenException(MENSAJE_FUERA_DE_ALCANCE));
      await expect(
        servicio.generarContrasena(20, administrador),
      ).rejects.toThrow(ForbiddenException);
    });

    it('no crea usuarios con un rol sobre otro programa ni sobre todos', async () => {
      const datos = {
        nombres: 'Persona',
        apellidos: 'Nueva',
        identificacion: 'DOC-0002',
        correo: 'persona.nueva@urap.local',
        idPrograma: 1,
      };
      await expect(
        servicio.crear(
          { ...datos, roles: [{ idRol: 1, idPrograma: null }] },
          administrador,
        ),
      ).rejects.toThrow(new ForbiddenException(MENSAJE_FUERA_DE_ALCANCE));
      await expect(
        servicio.crear(
          { ...datos, roles: [{ idRol: 1, idPrograma: 2 }] },
          administrador,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(contrasenas.hashear).not.toHaveBeenCalled();
    });
  });
});
