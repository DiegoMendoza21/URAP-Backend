import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  MENSAJE_ROL_CON_USUARIOS,
  MENSAJE_ROL_SISTEMA_INACTIVAR,
  MENSAJE_ROL_SISTEMA_NOMBRE,
  MENSAJE_SIN_LECTURA,
  MENSAJE_ULTIMO_ADMINISTRADOR,
  RolesService,
} from './roles.service.js';

const MODULOS = [
  { id: 1, codigo: 'usuarios' },
  { id: 2, codigo: 'proyectos' },
];
const PERMISOS = [
  { id: 10, codigo: 'leer' },
  { id: 11, codigo: 'administrar' },
];

/** Fila de rol_permiso con sus códigos, como la devuelve la consulta del servicio. */
const par = (idModulo: number, idPermiso: number) => ({
  id_modulo: idModulo,
  id_permiso: idPermiso,
  modulo: { codigo: MODULOS.find(({ id }) => id === idModulo)!.codigo },
  permiso: { codigo: PERMISOS.find(({ id }) => id === idPermiso)!.codigo },
});

describe('RolesService', () => {
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    rol: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    rol_permiso: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    modulo: { findMany: vi.fn() },
    permiso: { findMany: vi.fn() },
    usuario: { count: vi.fn() },
    usuario_rol: { count: vi.fn() },
  };
  const auditoria = { registrar: vi.fn() };
  const servicio = new RolesService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );

  /** Rol en la base; después de la operación, `obtener` lo vuelve a leer. */
  function conRol(nombre: string, activo = true) {
    const rol = { id: 5, nombre, descripcion: null, activo };
    prisma.rol.findUnique.mockReset().mockResolvedValue({
      ...rol,
      rol_permiso: [],
      _count: { usuario_rol: 0 },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.modulo.findMany.mockResolvedValue(MODULOS);
    prisma.permiso.findMany.mockResolvedValue(PERMISOS);
    prisma.rol.findFirst.mockResolvedValue(null);
    conRol('Rol propio');
  });

  describe('último administrador (RF-03, excepción p3)', () => {
    const soloLectura = {
      permisos: [{ modulo: 'usuarios', permiso: 'leer' }],
    };

    it('no retira la administración de usuarios si ningún usuario activo la conservaría', async () => {
      prisma.rol_permiso.findMany.mockResolvedValue([par(1, 10), par(1, 11)]);
      prisma.usuario.count.mockResolvedValue(0);

      await expect(servicio.reemplazarPermisos(5, soloLectura)).rejects.toThrow(
        new ConflictException(MENSAJE_ULTIMO_ADMINISTRADOR),
      );
      // La revisión corre después del cambio, dentro de la transacción: al lanzar, se deshace.
      expect(prisma.rol_permiso.deleteMany).toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('la retira si otro usuario activo la conserva', async () => {
      prisma.rol_permiso.findMany.mockResolvedValue([par(1, 10), par(1, 11)]);
      prisma.usuario.count.mockResolvedValue(1);

      await expect(
        servicio.reemplazarPermisos(5, soloLectura),
      ).resolves.toBeDefined();
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'rol_permiso',
        idRegistro: 5,
        valorAnterior: { retirados: ['usuarios.administrar'] },
        valorNuevo: { agregados: [] },
      });
    });

    it('cuenta solo usuarios activos con un rol activo, vigente y con ese permiso', async () => {
      prisma.rol_permiso.findMany.mockResolvedValue([par(1, 10), par(1, 11)]);
      prisma.usuario.count.mockResolvedValue(1);

      await servicio.reemplazarPermisos(5, soloLectura);

      expect(prisma.usuario.count).toHaveBeenCalledWith({
        where: {
          activo: true,
          usuario_rol_usuario_rol_id_usuarioTousuario: {
            some: {
              activo: true,
              fecha_revocacion: null,
              rol: {
                is: {
                  activo: true,
                  rol_permiso: {
                    some: {
                      modulo: { is: { codigo: 'usuarios' } },
                      permiso: { is: { codigo: 'administrar' } },
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    it('no la revisa si el cambio no retira la administración de usuarios', async () => {
      prisma.rol_permiso.findMany.mockResolvedValue([par(1, 10)]);

      await servicio.reemplazarPermisos(5, {
        permisos: [
          { modulo: 'usuarios', permiso: 'leer' },
          { modulo: 'proyectos', permiso: 'leer' },
        ],
      });

      expect(prisma.usuario.count).not.toHaveBeenCalled();
    });

    it('serializa los cambios de la matriz con un bloqueo, para que dos administradores no la vacíen a la vez', async () => {
      prisma.rol_permiso.findMany.mockResolvedValue([par(1, 10)]);

      await servicio.reemplazarPermisos(5, soloLectura);

      const [sql] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('?')).toMatch(
        /FROM permiso WHERE codigo = \? FOR UPDATE/,
      );
    });
  });

  describe('lectura obligatoria (RF-03, p4)', () => {
    it('no crea un rol sin permiso de lectura, sin tocar la base', async () => {
      await expect(
        servicio.crear({
          nombre: 'Sin lectura',
          permisos: [{ modulo: 'proyectos', permiso: 'administrar' }],
        }),
      ).rejects.toThrow(new BadRequestException(MENSAJE_SIN_LECTURA));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no deja un rol sin permiso de lectura al reemplazar sus permisos', async () => {
      await expect(
        servicio.reemplazarPermisos(5, {
          permisos: [{ modulo: 'usuarios', permiso: 'administrar' }],
        }),
      ).rejects.toThrow(new BadRequestException(MENSAJE_SIN_LECTURA));
    });
  });

  describe('roles del sistema', () => {
    it('no renombra uno de los seis roles de RF-03', async () => {
      conRol(ROL.administrador);

      await expect(
        servicio.editar(5, { nombre: 'Superusuario' }),
      ).rejects.toThrow(new ConflictException(MENSAJE_ROL_SISTEMA_NOMBRE));
      expect(prisma.rol.update).not.toHaveBeenCalled();
    });

    it('sí edita su descripción, y audita solo ese campo', async () => {
      conRol(ROL.administrador);

      await servicio.editar(5, {
        nombre: ROL.administrador,
        descripcion: 'Nueva descripción',
      });

      expect(prisma.rol.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { descripcion: 'Nueva descripción' },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'rol',
        idRegistro: 5,
        valorAnterior: { descripcion: null },
        valorNuevo: { descripcion: 'Nueva descripción' },
      });
    });

    it('no inactiva uno de los seis roles de RF-03', async () => {
      conRol(ROL.estudiante);

      await expect(servicio.inactivar(5)).rejects.toThrow(
        new ConflictException(MENSAJE_ROL_SISTEMA_INACTIVAR),
      );
    });
  });

  describe('inactivar (borrado lógico)', () => {
    it('no inactiva un rol con usuarios activos', async () => {
      prisma.usuario_rol.count.mockResolvedValue(2);

      await expect(servicio.inactivar(5)).rejects.toThrow(
        new ConflictException(MENSAJE_ROL_CON_USUARIOS),
      );
      expect(prisma.rol.update).not.toHaveBeenCalled();
    });

    it('lo marca inactivo, sin borrarlo, y lo audita', async () => {
      prisma.usuario_rol.count.mockResolvedValue(0);

      await servicio.inactivar(5);

      expect(prisma.rol.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { activo: false },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          valorAnterior: { activo: true },
          valorNuevo: { activo: false },
        }),
      );
    });

    it('inactivar un rol ya inactivo no hace nada ni audita', async () => {
      conRol('Rol propio', false);

      await servicio.inactivar(5);

      expect(prisma.rol.update).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });
});
