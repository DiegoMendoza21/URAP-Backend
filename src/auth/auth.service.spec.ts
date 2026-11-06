import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { VariablesEntorno } from '../common/configuracion/variables-entorno.js';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  AuthService,
  MENSAJE_CREDENCIALES_INVALIDAS,
  MENSAJE_SESION_INVALIDA,
  MENSAJE_SIN_ROLES,
  MENSAJE_USUARIO_INACTIVO,
  MOTIVO_BLOQUEO,
  MOTIVO_LOGOUT,
  PARAMETRO_INTENTOS_MAXIMOS,
  PARAMETRO_MINUTOS_BLOQUEO,
  mensajeAccesoBloqueado,
} from './auth.service.js';
import type { ContrasenasService } from './contrasenas.service.js';
import type { CargaToken, UsuarioSesion } from './tipos.js';

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

function usuarioDeSesion(): UsuarioSesion {
  return {
    id: 7,
    nombres: 'Usuaria',
    apellidos: 'De Prueba',
    correo: 'usuaria.prueba@unicartagena.edu.co',
    roles: ['Docente'],
    jti: 'jti-1',
  };
}

describe('AuthService', () => {
  const prisma = {
    usuario: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    sesion: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  const contrasenas = { verificar: vi.fn() };
  const parametros = { leerEntero: vi.fn() };
  const auditoria = { registrar: vi.fn() };
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
    parametros as unknown as ParametrosService,
    auditoria as unknown as AuditoriaService,
  );
  const credenciales = {
    correo: 'usuaria.prueba@unicartagena.edu.co',
    contrasena: 'Clave-de-prueba-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Descarta los valores pendientes de mockResolvedValueOnce que una prueba no consumió.
    prisma.usuario.findUnique.mockReset();
    // [sesión creada, usuario actualizado]
    prisma.$transaction.mockResolvedValue([{ id: 99 }, {}]);
    prisma.$executeRaw.mockResolvedValue(1);
    // Los valores iniciales del seed: 5 intentos y 15 minutos.
    parametros.leerEntero.mockImplementation(async (clave: string) =>
      clave === PARAMETRO_INTENTOS_MAXIMOS ? 5 : 15,
    );
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
        data: {
          ultimo_acceso: expect.any(Date),
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      // HU-14-01: el inicio de sesión queda en auditoría, sin el jti del token.
      expect(auditoria.registrar).toHaveBeenCalledWith({
        idUsuario: 7,
        accion: 'crear',
        tablaAfectada: 'sesion',
        idRegistro: 99,
        valorNuevo: {
          id_usuario: 7,
          emitida_en: expect.any(String),
          expira_en: resultado.expiraEn,
          user_agent: 'navegador de pruebas',
        },
        ip: '10.0.0.1',
      });
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

  describe('bloqueo por intentos fallidos (HU-01-04)', () => {
    /** findUnique: primero la búsqueda por correo; después, el conteo tras el incremento. */
    function conIntentos(
      intentos: number,
      cambios: Record<string, unknown> = {},
    ) {
      prisma.usuario.findUnique
        .mockResolvedValueOnce(usuarioFicticio(cambios))
        .mockResolvedValueOnce({ intentos_fallidos: intentos });
    }

    it('suma un intento fallido de forma atómica y responde el mensaje genérico', async () => {
      conIntentos(2);
      contrasenas.verificar.mockResolvedValue(false);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
      expect(prisma.$executeRaw).toHaveBeenCalledOnce();
      const [sql, idUsuario] = prisma.$executeRaw.mock.calls[0] as [
        TemplateStringsArray,
        number,
      ];
      expect(sql.join('?')).toMatch(/COALESCE\(intentos_fallidos, 0\) \+ 1/);
      expect(idUsuario).toBe(7);
      expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
    });

    it('lee el límite y la duración de parametro_sistema, no del código', async () => {
      conIntentos(1);
      contrasenas.verificar.mockResolvedValue(false);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow();
      expect(parametros.leerEntero).toHaveBeenCalledWith(
        PARAMETRO_INTENTOS_MAXIMOS,
        expect.any(Object),
      );
      expect(parametros.leerEntero).toHaveBeenCalledWith(
        PARAMETRO_MINUTOS_BLOQUEO,
        expect.any(Object),
      );
    });

    it('al llegar al límite bloquea la cuenta, reinicia el conteo y lo audita', async () => {
      conIntentos(5);
      contrasenas.verificar.mockResolvedValue(false);
      prisma.usuario.updateMany.mockResolvedValue({ count: 1 });

      const antes = Date.now();
      const error = await servicio
        .iniciarSesion(credenciales, { ip: '10.0.0.9' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).message).toBe(mensajeAccesoBloqueado(15));
      const { where, data } = prisma.usuario.updateMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        data: { bloqueado_hasta: Date; intentos_fallidos: number };
      };
      expect(where.id).toBe(7);
      expect(data.intentos_fallidos).toBe(0);
      expect(data.bloqueado_hasta.getTime() - antes).toBeGreaterThanOrEqual(
        15 * 60_000 - 1000,
      );
      expect(auditoria.registrar).toHaveBeenCalledWith({
        idUsuario: null,
        accion: 'actualizar',
        tablaAfectada: 'usuario',
        idRegistro: 7,
        valorAnterior: { intentos_fallidos: 5, bloqueado_hasta: null },
        valorNuevo: {
          intentos_fallidos: 0,
          bloqueado_hasta: data.bloqueado_hasta.toISOString(),
          motivo: MOTIVO_BLOQUEO,
        },
        ip: '10.0.0.9',
      });
    });

    it('con intentos simultáneos audita un solo bloqueo', async () => {
      conIntentos(6);
      contrasenas.verificar.mockResolvedValue(false);
      // Otro intento ya bloqueó la cuenta un instante antes.
      prisma.usuario.updateMany.mockResolvedValue({ count: 0 });

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        HttpException,
      );
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('mientras dura el bloqueo responde 429 sin verificar la contraseña', async () => {
      const enDiezMinutos = new Date(Date.now() + 10 * 60_000 - 500);
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({ bloqueado_hasta: enDiezMinutos }),
      );

      const error = await servicio
        .iniciarSesion(credenciales)
        .catch((e: unknown) => e);

      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect((error as HttpException).message).toBe(mensajeAccesoBloqueado(10));
      expect(contrasenas.verificar).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cuando el bloqueo venció, el usuario puede volver a iniciar sesión', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({ bloqueado_hasta: new Date(Date.now() - 1000) }),
      );
      contrasenas.verificar.mockResolvedValue(true);

      await expect(servicio.iniciarSesion(credenciales)).resolves.toMatchObject(
        { token: expect.any(String) },
      );
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        }),
      });
    });

    it('dice «1 minuto» en singular cuando falta menos de un minuto', () => {
      expect(mensajeAccesoBloqueado(1)).toContain(
        'Intente de nuevo en 1 minuto.',
      );
      expect(mensajeAccesoBloqueado(15)).toContain('en 15 minutos.');
    });

    it('sin parámetros válidos cuenta el intento pero no bloquea', async () => {
      conIntentos(50);
      contrasenas.verificar.mockResolvedValue(false);
      parametros.leerEntero.mockResolvedValue(null);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
      expect(prisma.$executeRaw).toHaveBeenCalledOnce();
      expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
    });

    it('con un correo inexistente no cuenta intentos', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      contrasenas.verificar.mockResolvedValue(false);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
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
        nombres: 'Usuaria',
        apellidos: 'De Prueba',
        correo: 'usuaria.prueba@unicartagena.edu.co',
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

    it.each([
      ['sin jti', { sub: 7, roles: [] }],
      ['con jti vacío', { sub: 7, roles: [], jti: '' }],
      ['con jti que no es texto', { sub: 7, roles: [], jti: 12 }],
      ['sin sub', { roles: [], jti: 'jti-1' }],
      ['con sub de texto', { sub: '7', roles: [], jti: 'jti-1' }],
      ['con sub fraccionario', { sub: 7.5, roles: [], jti: 'jti-1' }],
    ])(
      'rechaza con 401 un token bien firmado %s, sin consultar la base',
      async (_caso, cargaInvalida) => {
        const token = await jwt.signAsync(cargaInvalida);

        await expect(servicio.validarToken(token)).rejects.toThrow(
          new UnauthorizedException(MENSAJE_SESION_INVALIDA),
        );
        expect(prisma.sesion.findUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe('obtenerUsuario', () => {
    it('responde con los datos que cargó el guard, sin volver a consultar la base', () => {
      const usuario = usuarioDeSesion();

      expect(servicio.obtenerUsuario(usuario)).toEqual({
        id: 7,
        nombres: 'Usuaria',
        apellidos: 'De Prueba',
        correo: 'usuaria.prueba@unicartagena.edu.co',
        roles: ['Docente'],
      });
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(prisma.sesion.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('cerrarSesion', () => {
    it('revoca solo la sesión del token actual con motivo «logout»', async () => {
      prisma.sesion.updateMany.mockResolvedValue({ count: 1 });

      await servicio.cerrarSesion(usuarioDeSesion());

      expect(prisma.sesion.updateMany).toHaveBeenCalledWith({
        where: { jti: 'jti-1', id_usuario: 7, revocada_en: null },
        data: {
          revocada_en: expect.any(Date),
          motivo_revocacion: MOTIVO_LOGOUT,
        },
      });
      expect(MOTIVO_LOGOUT).toBe('logout');
    });

    it('registra el cierre en auditoría, con el usuario y la IP del contexto', async () => {
      prisma.sesion.findUnique.mockResolvedValue({ id: 99 });
      prisma.sesion.updateMany.mockResolvedValue({ count: 1 });

      await servicio.cerrarSesion(usuarioDeSesion());

      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'sesion',
        idRegistro: 99,
        valorAnterior: { revocada_en: null, motivo_revocacion: null },
        valorNuevo: {
          revocada_en: expect.any(String),
          motivo_revocacion: MOTIVO_LOGOUT,
        },
      });
    });

    it('no falla ni audita si la sesión ya estaba revocada', async () => {
      prisma.sesion.findUnique.mockResolvedValue({ id: 99 });
      prisma.sesion.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        servicio.cerrarSesion(usuarioDeSesion()),
      ).resolves.toBeUndefined();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });
});
