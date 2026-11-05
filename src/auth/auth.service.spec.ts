import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { VariablesEntorno } from '../common/configuracion/variables-entorno.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  AuthService,
  MENSAJE_CREDENCIALES_INVALIDAS,
  MENSAJE_SESION_INVALIDA,
  MENSAJE_SIN_ROLES,
  MENSAJE_USUARIO_INACTIVO,
  MOTIVO_LOGOUT,
} from './auth.service.js';
import type { ContrasenasService } from './contrasenas.service.js';
import type { CargaToken } from './tipos.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const SECRETO = 'secreto-de-pruebas-con-al-menos-32-caracteres';
const MINUTOS = 480;

function roles(...nombres: string[]) {
  return nombres.map((nombre) => ({ rol: { nombre } }));
}

function usuarioFicticio(cambios: Record<string, unknown> = {}) {
  return {
    id: 7,
    nombres: 'Usuaria',
    apellidos: 'De Prueba',
    email: 'usuaria.prueba@unicartagena.edu.co',
    activo: true,
    password_hash: 'scrypt$hash-ficticio',
    usuario_rol_usuario_rol_id_usuarioTousuario: roles('Docente', 'Líder RAP'),
    ...cambios,
  };
}

describe('AuthService', () => {
  const prisma = {
    usuario: { findUnique: vi.fn(), update: vi.fn() },
    sesion: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const contrasenas = { verificar: vi.fn() };
  const jwt = new JwtService({
    secret: SECRETO,
    signOptions: { algorithm: 'HS256', expiresIn: MINUTOS * 60 },
    verifyOptions: { algorithms: ['HS256'] },
  });
  const config = { get: vi.fn().mockReturnValue(MINUTOS) };
  const servicio = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    contrasenas as unknown as ContrasenasService,
    config as unknown as ConfigService<VariablesEntorno, true>,
  );
  const credenciales = {
    correo: 'usuaria.prueba@unicartagena.edu.co',
    contrasena: 'Clave-de-prueba-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockResolvedValue([]);
  });

  describe('iniciarSesion', () => {
    it('emite un JWT con el usuario, sus roles y la expiración, y registra la sesión', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioFicticio());
      contrasenas.verificar.mockResolvedValue(true);

      const antes = Date.now();
      const resultado = await servicio.iniciarSesion(credenciales, {
        ip: '10.0.0.1',
        userAgent: 'navegador de pruebas',
      });

      const carga = await jwt.verifyAsync<CargaToken & { exp: number }>(
        resultado.token,
      );
      expect(carga).toMatchObject({ sub: 7, roles: ['Docente', 'Líder RAP'] });
      expect(carga.exp * 1000).toBeGreaterThanOrEqual(
        antes + MINUTOS * 60_000 - 1000,
      );
      expect(resultado.usuario).toEqual({
        id: 7,
        nombres: 'Usuaria',
        apellidos: 'De Prueba',
        correo: 'usuaria.prueba@unicartagena.edu.co',
        roles: ['Docente', 'Líder RAP'],
      });
      expect(Date.parse(resultado.expiraEn) - antes).toBeGreaterThanOrEqual(
        MINUTOS * 60_000 - 1000,
      );
      expect(prisma.sesion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id_usuario: 7,
          jti: carga.jti,
          ip: '10.0.0.1',
          user_agent: 'navegador de pruebas',
        }),
      });
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { ultimo_acceso: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it('lista una sola vez un rol asignado en varios programas', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({
          usuario_rol_usuario_rol_id_usuarioTousuario: roles(
            'Docente',
            'Docente',
          ),
        }),
      );
      contrasenas.verificar.mockResolvedValue(true);

      const resultado = await servicio.iniciarSesion(credenciales);

      expect(resultado.usuario.roles).toEqual(['Docente']);
    });

    it('con contraseña incorrecta responde con el mensaje genérico', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioFicticio());
      contrasenas.verificar.mockResolvedValue(false);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('con un correo no registrado responde igual y aun así verifica una contraseña', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      contrasenas.verificar.mockResolvedValue(false);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
      expect(contrasenas.verificar).toHaveBeenCalledWith(
        credenciales.contrasena,
        undefined,
      );
    });

    it('a un usuario inactivo le niega el acceso y lo remite al administrador', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({ activo: false }),
      );
      contrasenas.verificar.mockResolvedValue(true);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new ForbiddenException(MENSAJE_USUARIO_INACTIVO),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no revela que un usuario está inactivo a quien no conoce su contraseña', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({ activo: false }),
      );
      contrasenas.verificar.mockResolvedValue(false);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
    });

    it('a un usuario sin roles vigentes le niega el acceso (precondición de RF-01)', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({ usuario_rol_usuario_rol_id_usuarioTousuario: [] }),
      );
      contrasenas.verificar.mockResolvedValue(true);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new ForbiddenException(MENSAJE_SIN_ROLES),
      );
    });

    it('consulta solo los roles activos y no revocados', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioFicticio());
      contrasenas.verificar.mockResolvedValue(true);

      await servicio.iniciarSesion(credenciales);

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: credenciales.correo },
          select: expect.objectContaining({
            usuario_rol_usuario_rol_id_usuarioTousuario:
              expect.objectContaining({
                where: {
                  activo: true,
                  fecha_revocacion: null,
                  rol: { is: { activo: true } },
                },
              }),
          }),
        }),
      );
    });
  });

  describe('validarToken', () => {
    async function tokenDe(carga: CargaToken, opciones = {}) {
      return jwt.signAsync(carga, opciones);
    }

    function sesionVigente(cambios: Record<string, unknown> = {}) {
      return {
        id_usuario: 7,
        expira_en: new Date(Date.now() + 60_000),
        revocada_en: null,
        usuario: usuarioFicticio(),
        ...cambios,
      };
    }

    const carga: CargaToken = { sub: 7, roles: ['Docente'], jti: 'jti-1' };

    it('acepta un token vigente y toma los roles actuales de la base', async () => {
      prisma.sesion.findUnique.mockResolvedValue(sesionVigente());

      await expect(
        servicio.validarToken(await tokenDe(carga)),
      ).resolves.toEqual({
        id: 7,
        roles: ['Docente', 'Líder RAP'],
        jti: 'jti-1',
      });
    });

    it.each([
      ['revocada (cierre de sesión)', { revocada_en: new Date() }],
      ['vencida en la base', { expira_en: new Date(Date.now() - 1000) }],
      ['de otro usuario', { id_usuario: 99 }],
      [
        'de un usuario inactivo',
        { usuario: usuarioFicticio({ activo: false }) },
      ],
    ])('rechaza una sesión %s', async (_caso, cambios) => {
      prisma.sesion.findUnique.mockResolvedValue(sesionVigente(cambios));

      await expect(servicio.validarToken(await tokenDe(carga))).rejects.toThrow(
        new UnauthorizedException(MENSAJE_SESION_INVALIDA),
      );
    });

    it('rechaza un token cuya sesión no está registrada', async () => {
      prisma.sesion.findUnique.mockResolvedValue(null);

      await expect(servicio.validarToken(await tokenDe(carga))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza un token vencido sin consultar la base', async () => {
      const vencido = await tokenDe(carga, { expiresIn: -10 });

      await expect(servicio.validarToken(vencido)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_SESION_INVALIDA),
      );
      expect(prisma.sesion.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza un token firmado con otro secreto', async () => {
      const ajeno = await new JwtService({
        secret: 'otro-secreto-distinto-de-al-menos-32-caracteres',
      }).signAsync(carga);

      await expect(servicio.validarToken(ajeno)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.sesion.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza un texto que no es un JWT', async () => {
      await expect(servicio.validarToken('no-es-un-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('cerrarSesion', () => {
    it('revoca solo la sesión del token actual con motivo «logout»', async () => {
      prisma.sesion.updateMany.mockResolvedValue({ count: 1 });

      await servicio.cerrarSesion({ id: 7, roles: ['Docente'], jti: 'jti-1' });

      expect(prisma.sesion.updateMany).toHaveBeenCalledWith({
        where: { jti: 'jti-1', id_usuario: 7, revocada_en: null },
        data: {
          revocada_en: expect.any(Date),
          motivo_revocacion: MOTIVO_LOGOUT,
        },
      });
      expect(MOTIVO_LOGOUT).toBe('logout');
    });

    it('no falla si la sesión ya estaba revocada', async () => {
      prisma.sesion.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        servicio.cerrarSesion({ id: 7, roles: [], jti: 'jti-1' }),
      ).resolves.toBeUndefined();
    });
  });
});
