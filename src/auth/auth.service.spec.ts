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
import { IntentosAnonimosService } from './intentos-anonimos.service.js';
import type { CargaToken, UsuarioSesion } from './tipos.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const SECRETO = 'secreto-de-pruebas-con-al-menos-32-caracteres';
const MINUTOS = 480;

function roles(...nombres: string[]) {
  return nombres.map((nombre) => ({
    id_programa: null,
    rol: { nombre, rol_permiso: [] },
  }));
}

/** Un rol vigente con su programa y sus permisos de la matriz, como los trae la consulta. */
function rolCon(
  nombre: string,
  idPrograma: number | null,
  ...permisos: [string, string][]
) {
  return {
    id_programa: idPrograma,
    rol: {
      nombre,
      rol_permiso: permisos.map(([modulo, permiso]) => ({
        modulo: { codigo: modulo },
        permiso: { codigo: permiso },
      })),
    },
  };
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
    asignaciones: [{ rol: 'Docente', idPrograma: 10 }],
    permisos: ['proyectos.leer'],
    jti: 'jti-1',
    idSesion: 99,
  };
}

describe('AuthService', () => {
  const prisma = {
    usuario: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    sesion: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  const contrasenas = { verificar: vi.fn() };
  const parametros = { leerEntero: vi.fn() };
  let intentosAnonimos = new IntentosAnonimosService();
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
    {
      // Una instancia nueva por prueba (ver beforeEach), sin conteos de otras pruebas.
      bloqueadoHasta: (
        ...args: Parameters<IntentosAnonimosService['bloqueadoHasta']>
      ) => intentosAnonimos.bloqueadoHasta(...args),
      registrarFallo: (
        ...args: Parameters<IntentosAnonimosService['registrarFallo']>
      ) => intentosAnonimos.registrarFallo(...args),
    } as IntentosAnonimosService,
  );
  const credenciales = {
    correo: 'usuaria.prueba@unicartagena.edu.co',
    contrasena: 'Clave-de-prueba-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Descarta los valores pendientes de mockResolvedValueOnce que una prueba no consumió.
    prisma.usuario.findUnique.mockReset();
    intentosAnonimos = new IntentosAnonimosService();
    // Transacción interactiva: el callback recibe el mismo cliente simulado.
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    prisma.sesion.create.mockResolvedValue({ id: 99 });
    prisma.usuario.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.$queryRaw.mockResolvedValue([{ id: 7 }]);
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
        permisos: [],
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
        select: { id: true },
      });
      expect(prisma.usuario.updateMany).toHaveBeenCalledWith({
        where: {
          id: 7,
          OR: [
            { bloqueado_hasta: null },
            { bloqueado_hasta: { lte: expect.any(Date) } },
          ],
        },
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
        // Sin el navegador: ya está en `sesion` (Ley 1581).
        valorNuevo: {
          id_usuario: 7,
          emitida_en: expect.any(Date),
          expira_en: new Date(resultado.expiraEn),
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
      expect(prisma.sesion.create).not.toHaveBeenCalled();
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
    /**
     * findUnique: primero la búsqueda por correo; después, dentro de la transacción y con la
     * fila bloqueada, el conteo y el bloqueo vigentes de la cuenta.
     */
    function conCuenta(
      intentosPrevios: number,
      bloqueadoHasta: Date | null = null,
    ) {
      prisma.usuario.findUnique
        .mockResolvedValueOnce(usuarioFicticio())
        .mockResolvedValueOnce({
          intentos_fallidos: intentosPrevios,
          bloqueado_hasta: bloqueadoHasta,
        });
      contrasenas.verificar.mockResolvedValue(false);
    }

    const estadoDe = (error: unknown) => (error as HttpException).getStatus();

    it('suma un intento con la fila de la cuenta bloqueada y responde el mensaje genérico', async () => {
      conCuenta(2);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
      const [sql, idUsuario] = prisma.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        number,
      ];
      expect(sql.join('?')).toMatch(
        /SELECT id FROM usuario WHERE id = \? FOR UPDATE/,
      );
      expect(idUsuario).toBe(7);
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { intentos_fallidos: 3 },
      });
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('trata un conteo nulo como cero', async () => {
      conCuenta(null as unknown as number);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { intentos_fallidos: 1 },
      });
    });

    it('lee el límite y la duración de parametro_sistema, no del código', async () => {
      conCuenta(1);

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
      conCuenta(4);

      const antes = Date.now();
      const error = await servicio
        .iniciarSesion(credenciales, { ip: '10.0.0.9' })
        .catch((e: unknown) => e);

      expect(estadoDe(error)).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).message).toBe(mensajeAccesoBloqueado(15));
      const { data } = prisma.usuario.update.mock.calls[0][0] as {
        data: { bloqueado_hasta: Date; intentos_fallidos: number };
      };
      expect(data.intentos_fallidos).toBe(0);
      expect(data.bloqueado_hasta.getMilliseconds()).toBe(0);
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
          bloqueado_hasta: data.bloqueado_hasta,
          motivo: MOTIVO_BLOQUEO,
        },
        ip: '10.0.0.9',
      });
    });

    it('un intento en vuelo cuando otro bloqueó la cuenta responde 429 sin contar ni auditar', async () => {
      conCuenta(0, new Date(Date.now() + 15 * 60_000));

      const error = await servicio
        .iniciarSesion(credenciales)
        .catch((e: unknown) => e);

      expect(estadoDe(error)).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(prisma.usuario.update).not.toHaveBeenCalled();
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

      expect(estadoDe(error)).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).message).toBe(mensajeAccesoBloqueado(10));
      expect(contrasenas.verificar).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('la contraseña correcta en vuelo cuando otro intento bloqueó la cuenta no inicia sesión', async () => {
      const bloqueo = new Date(Date.now() + 15 * 60_000);
      prisma.usuario.findUnique
        .mockResolvedValueOnce(usuarioFicticio())
        .mockResolvedValueOnce({ bloqueado_hasta: bloqueo });
      contrasenas.verificar.mockResolvedValue(true);
      // El reinicio condicionado no encuentra la cuenta sin bloqueo.
      prisma.usuario.updateMany.mockResolvedValue({ count: 0 });

      const error = await servicio
        .iniciarSesion(credenciales)
        .catch((e: unknown) => e);

      expect(estadoDe(error)).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).message).toBe(mensajeAccesoBloqueado(15));
      expect(prisma.sesion.create).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('cuando el bloqueo venció, el usuario puede volver a iniciar sesión', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        usuarioFicticio({ bloqueado_hasta: new Date(Date.now() - 1000) }),
      );
      contrasenas.verificar.mockResolvedValue(true);

      await expect(servicio.iniciarSesion(credenciales)).resolves.toMatchObject(
        { token: expect.any(String) },
      );
      expect(prisma.usuario.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intentos_fallidos: 0,
            bloqueado_hasta: null,
          }),
        }),
      );
    });

    it('dice «1 minuto» en singular cuando falta menos de un minuto', () => {
      expect(mensajeAccesoBloqueado(1)).toContain(
        'Intente de nuevo en 1 minuto.',
      );
      expect(mensajeAccesoBloqueado(15)).toContain('en 15 minutos.');
    });

    it('sin parámetros válidos no bloquea ni cuenta el intento', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioFicticio());
      contrasenas.verificar.mockResolvedValue(false);
      parametros.leerEntero.mockResolvedValue(null);

      await expect(servicio.iniciarSesion(credenciales)).rejects.toThrow(
        new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('un correo inexistente recibe la misma secuencia que uno registrado, sin tocar la base (RF-01, p2)', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      contrasenas.verificar.mockResolvedValue(false);

      const estados: number[] = [];
      for (let i = 0; i < 7; i++) {
        estados.push(
          await servicio.iniciarSesion(credenciales).then(
            () => 200,
            (e: HttpException) => e.getStatus(),
          ),
        );
      }

      expect(estados).toEqual([401, 401, 401, 401, 429, 429, 429]);
      // Durante el bloqueo tampoco se verifica la contraseña, como en una cuenta real.
      expect(contrasenas.verificar).toHaveBeenCalledTimes(5);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('validarToken', () => {
    async function tokenDe(carga: CargaToken, opciones = {}) {
      return jwt.signAsync(carga, opciones);
    }

    function sesionVigente(cambios: Record<string, unknown> = {}) {
      return {
        id: 99,
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
        asignaciones: [
          { rol: 'Docente', idPrograma: null },
          { rol: 'Líder RAP', idPrograma: null },
        ],
        permisos: [],
        jti: 'jti-1',
        idSesion: 99,
      });
    });

    it('carga la unión de los permisos de todos los roles y el programa de cada uno (HU-01-03)', async () => {
      prisma.sesion.findUnique.mockResolvedValue(
        sesionVigente({
          usuario: usuarioFicticio({
            usuario_rol_usuario_rol_id_usuarioTousuario: [
              rolCon(
                'Docente responsable',
                10,
                ['proyectos', 'leer'],
                ['proyectos', 'actualizar'],
              ),
              rolCon(
                'Líder RAP',
                10,
                ['proyectos', 'leer'],
                ['reportes', 'leer'],
              ),
            ],
          }),
        }),
      );

      const usuario = await servicio.validarToken(await tokenDe(carga));

      // Sin repetir el permiso que comparten los dos roles.
      expect(usuario.permisos).toEqual([
        'proyectos.actualizar',
        'proyectos.leer',
        'reportes.leer',
      ]);
      expect(usuario.asignaciones).toEqual([
        { rol: 'Docente responsable', idPrograma: 10 },
        { rol: 'Líder RAP', idPrograma: 10 },
      ]);
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
        permisos: ['proyectos.leer'],
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
        where: {
          id: 99,
          jti: 'jti-1',
          id_usuario: 7,
          revocada_en: null,
        },
        data: {
          revocada_en: expect.any(Date),
          motivo_revocacion: MOTIVO_LOGOUT,
        },
      });
      expect(MOTIVO_LOGOUT).toBe('logout');
    });

    it('registra el cierre en auditoría, con el usuario y la IP del contexto', async () => {
      prisma.sesion.updateMany.mockResolvedValue({ count: 1 });

      await servicio.cerrarSesion(usuarioDeSesion());

      // El id de la sesión viene del guard: no se vuelve a buscar.
      expect(prisma.sesion.findUnique).not.toHaveBeenCalled();
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'sesion',
        idRegistro: 99,
        valorAnterior: { revocada_en: null, motivo_revocacion: null },
        valorNuevo: {
          revocada_en: expect.any(Date),
          motivo_revocacion: MOTIVO_LOGOUT,
        },
      });
    });

    it('no falla ni audita si la sesión ya estaba revocada', async () => {
      prisma.sesion.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        servicio.cerrarSesion(usuarioDeSesion()),
      ).resolves.toBeUndefined();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });
});
