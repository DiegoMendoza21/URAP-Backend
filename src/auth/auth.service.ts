import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { VariablesEntorno } from '../common/configuracion/variables-entorno.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ContrasenasService } from './contrasenas.service.js';
import {
  finDelBloqueo,
  IntentosAnonimosService,
} from './intentos-anonimos.service.js';
import type { IniciarSesionDto } from './dto/iniciar-sesion.dto.js';
import type { SesionIniciadaDto } from './dto/sesion-iniciada.dto.js';
import type { UsuarioAutenticadoDto } from './dto/usuario-autenticado.dto.js';
import { clavePermiso } from './permisos.js';
import type {
  Asignacion,
  CargaToken,
  OrigenPeticion,
  UsuarioSesion,
} from './tipos.js';

export const MENSAJE_CREDENCIALES_INVALIDAS =
  'El correo o la contraseña no son correctos.';
export const MENSAJE_USUARIO_INACTIVO =
  'Su usuario está inactivo. Comuníquese con el administrador del sistema.';
export const MENSAJE_SIN_ROLES =
  'Su usuario no tiene roles asignados. Comuníquese con el administrador del sistema.';
export const MENSAJE_SESION_INVALIDA =
  'Su sesión no es válida o ha expirado. Inicie sesión de nuevo.';

/** Motivo con que se revoca una sesión cerrada por el propio usuario (HU-01-02). */
export const MOTIVO_LOGOUT = 'logout';

/** Las columnas varchar(255) de `sesion` no admiten más. */
const LONGITUD_MAXIMA_TEXTO = 255;

/** Solo cuentan los roles activos, no revocados, de un catálogo de roles también activo. */
const FILTRO_ROLES_VIGENTES = {
  activo: true,
  fecha_revocacion: null,
  rol: { is: { activo: true } },
} as const;

const SELECCION_USUARIO = {
  id: true,
  nombres: true,
  apellidos: true,
  email: true,
  activo: true,
  usuario_rol_usuario_rol_id_usuarioTousuario: {
    where: FILTRO_ROLES_VIGENTES,
    select: {
      id_programa: true,
      rol: {
        select: {
          nombre: true,
          // HU-01-03: los permisos de la matriz (HU-02-06) llegan con la sesión. Se leen en cada
          // petición, así que un cambio en la matriz rige desde la siguiente (RF-03, q1).
          rol_permiso: {
            select: {
              modulo: { select: { codigo: true } },
              permiso: { select: { codigo: true } },
            },
          },
        },
      },
    },
  },
} as const;

/** Claves de `parametro_sistema` del bloqueo (HU-01-04). Los valores los siembra el seed. */
export const PARAMETRO_INTENTOS_MAXIMOS = PARAMETRO.inicioSesionIntentosMaximos;
export const PARAMETRO_MINUTOS_BLOQUEO = PARAMETRO.inicioSesionMinutosBloqueo;

/** Motivo del bloqueo en el registro de auditoría. */
export const MOTIVO_BLOQUEO = 'intentos_fallidos_consecutivos';

/** Mensaje del bloqueo: dice cuánto falta para que el usuario pueda reintentar. */
export function mensajeAccesoBloqueado(minutos: number): string {
  const tiempo = minutos === 1 ? '1 minuto' : `${minutos} minutos`;
  return (
    'Por seguridad, el acceso está bloqueado temporalmente por varios intentos fallidos. ' +
    `Intente de nuevo en ${tiempo}.`
  );
}

function accesoBloqueado(hasta: Date, ahora: Date): HttpException {
  const minutos = Math.max(
    1,
    Math.ceil((hasta.getTime() - ahora.getTime()) / 60_000),
  );
  return new HttpException(
    mensajeAccesoBloqueado(minutos),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Inicio de sesión, bloqueo por intentos fallidos y validación de sesiones (RF-01,
 * NFR-003, NFR-005).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly contrasenas: ContrasenasService,
    private readonly config: ConfigService<VariablesEntorno, true>,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
    private readonly intentosAnonimos: IntentosAnonimosService,
  ) {}

  async iniciarSesion(
    datos: IniciarSesionDto,
    origen: OrigenPeticion = {},
  ): Promise<SesionIniciadaDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: datos.correo },
      select: {
        ...SELECCION_USUARIO,
        password_hash: true,
        bloqueado_hasta: true,
      },
    });

    // Durante el bloqueo (HU-01-04) no se verifica la contraseña: así no se puede seguir
    // probando contraseñas mientras dura, ni saber si alguna era la correcta. Un correo
    // inexistente lleva el mismo bloqueo, en memoria: si no, el 429 delataría qué correos
    // están registrados (RF-01, excepción p2).
    const ahora = new Date();
    const bloqueoVigente = usuario
      ? usuario.bloqueado_hasta
      : this.intentosAnonimos.bloqueadoHasta(datos.correo, ahora);
    if (bloqueoVigente && bloqueoVigente > ahora) {
      throw accesoBloqueado(bloqueoVigente, ahora);
    }

    // Se verifica aunque el usuario no exista: así la respuesta tarda lo mismo y no revela
    // qué correos están registrados (RF-01, excepción p2).
    const coincide = await this.contrasenas.verificar(
      datos.contrasena,
      usuario?.password_hash,
    );
    if (!usuario || !coincide) {
      if (usuario) {
        await this.registrarIntentoFallido(usuario.id, origen.ip);
      } else {
        await this.registrarIntentoAnonimo(datos.correo);
      }
      throw new UnauthorizedException(MENSAJE_CREDENCIALES_INVALIDAS);
    }
    // El estado de la cuenta se informa solo a quien demostró conocer la contraseña.
    if (usuario.activo !== true) {
      throw new ForbiddenException(MENSAJE_USUARIO_INACTIVO);
    }
    const roles = nombresDeRoles(usuario);
    if (roles.length === 0) {
      throw new ForbiddenException(MENSAJE_SIN_ROLES);
    }

    const jti = randomUUID();
    const emitidaEn = new Date();
    const minutos = this.config.get('JWT_EXPIRACION_MINUTOS', { infer: true });
    const expiraEn = new Date(emitidaEn.getTime() + minutos * 60_000);
    const carga: CargaToken = { sub: usuario.id, roles, jti };
    const token = await this.jwt.signAsync(carga);

    const sesion = await this.prisma.$transaction(async (tx) => {
      // Un inicio de sesión exitoso reinicia el conteo de intentos fallidos (HU-01-04), pero
      // solo si la cuenta sigue sin bloqueo: un intento simultáneo pudo bloquearla mientras
      // se verificaba esta contraseña. En ese caso no se crea la sesión.
      const { count } = await tx.usuario.updateMany({
        where: {
          id: usuario.id,
          OR: [
            { bloqueado_hasta: null },
            { bloqueado_hasta: { lte: emitidaEn } },
          ],
        },
        data: {
          ultimo_acceso: emitidaEn,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        },
      });
      if (count === 0) {
        const actual = await tx.usuario.findUnique({
          where: { id: usuario.id },
          select: { bloqueado_hasta: true },
        });
        throw accesoBloqueado(actual?.bloqueado_hasta ?? emitidaEn, emitidaEn);
      }
      return tx.sesion.create({
        data: {
          id_usuario: usuario.id,
          jti,
          emitida_en: emitidaEn,
          expira_en: expiraEn,
          ip: recortar(origen.ip),
          user_agent: recortar(origen.userAgent),
        },
        select: { id: true },
      });
    });

    // Auditoría (HU-14-01): el endpoint es público, así que el usuario se indica aquí. No se
    // guarda el jti, que identifica el token, ni el navegador, que ya está en `sesion`
    // (Ley 1581: no duplicar datos personales).
    await this.auditoria.registrar({
      idUsuario: usuario.id,
      accion: 'crear',
      tablaAfectada: 'sesion',
      idRegistro: sesion.id,
      valorNuevo: {
        id_usuario: usuario.id,
        emitida_en: emitidaEn,
        expira_en: expiraEn,
      },
      ip: origen.ip,
    });

    return {
      token,
      expiraEn: expiraEn.toISOString(),
      usuario: aDto(usuario, roles),
    };
  }

  /**
   * HU-01-04 y RF-01, excepción p3: suma un intento fallido y, al llegar al límite de
   * `parametro_sistema`, bloquea la cuenta temporalmente y lo registra en auditoría.
   */
  private async registrarIntentoFallido(
    idUsuario: number,
    ip: string | undefined,
  ): Promise<void> {
    // Sin límites válidos no hay bloqueo, y tampoco se cuenta: si no, al sembrar o cambiar
    // los parámetros, el siguiente fallo bloquearía de inmediato.
    const limites = await this.leerLimitesBloqueo();
    if (!limites) {
      return;
    }

    const ahora = new Date();
    const resultado = await this.prisma.$transaction(async (tx) => {
      // Bloquea la fila de la cuenta: los intentos simultáneos sobre ella se atienden de a
      // uno, y cada uno lee el conteo que dejó el anterior. Sin esto, en una ráfaga un intento
      // podía leer el conteo ya reiniciado por el bloqueo y responder 401 en vez de 429.
      await tx.$queryRaw`SELECT id FROM usuario WHERE id = ${idUsuario} FOR UPDATE`;
      const actual = await tx.usuario.findUnique({
        where: { id: idUsuario },
        select: { intentos_fallidos: true, bloqueado_hasta: true },
      });
      if (!actual) {
        return { tipo: 'sin-cuenta' } as const;
      }
      // Un intento en vuelo cuando otro bloqueó la cuenta responde con el bloqueo y no gasta
      // intentos del período siguiente.
      if (actual.bloqueado_hasta && actual.bloqueado_hasta > ahora) {
        return { tipo: 'ya-bloqueada', hasta: actual.bloqueado_hasta } as const;
      }
      const intentos = (actual.intentos_fallidos ?? 0) + 1;
      if (intentos < limites.intentosMaximos) {
        await tx.usuario.update({
          where: { id: idUsuario },
          data: { intentos_fallidos: intentos },
        });
        return { tipo: 'contado' } as const;
      }
      // Al bloquear, el conteo vuelve a cero: cuando el bloqueo vence, el usuario tiene de
      // nuevo todos sus intentos.
      const hasta = finDelBloqueo(ahora, limites.minutosBloqueo);
      await tx.usuario.update({
        where: { id: idUsuario },
        data: { intentos_fallidos: 0, bloqueado_hasta: hasta },
      });
      return { tipo: 'bloqueada', hasta, intentos } as const;
    });

    if (resultado.tipo === 'ya-bloqueada') {
      throw accesoBloqueado(resultado.hasta, ahora);
    }
    if (resultado.tipo === 'bloqueada') {
      // Fuera de la transacción, para que un fallo de la auditoría no deshaga el bloqueo. Lo
      // decide el sistema, no un usuario autenticado: por eso id_usuario es nulo y la cuenta
      // afectada queda en id_registro.
      await this.auditoria.registrar({
        idUsuario: null,
        accion: 'actualizar',
        tablaAfectada: 'usuario',
        idRegistro: idUsuario,
        valorAnterior: {
          intentos_fallidos: resultado.intentos,
          bloqueado_hasta: null,
        },
        valorNuevo: {
          intentos_fallidos: 0,
          bloqueado_hasta: resultado.hasta,
          motivo: MOTIVO_BLOQUEO,
        },
        ip,
      });
      throw accesoBloqueado(resultado.hasta, ahora);
    }
  }

  /** El mismo conteo y bloqueo de una cuenta, para un correo que no está registrado. */
  private async registrarIntentoAnonimo(correo: string): Promise<void> {
    const limites = await this.leerLimitesBloqueo();
    if (!limites) {
      return;
    }
    const ahora = new Date();
    const bloqueadoHasta = this.intentosAnonimos.registrarFallo(
      correo,
      limites,
      ahora,
    );
    if (bloqueadoHasta) {
      throw accesoBloqueado(bloqueadoHasta, ahora);
    }
  }

  /**
   * Límites del bloqueo, de `parametro_sistema` (HU-01-04: no van fijos en el código). Si
   * falta alguno o es inválido, el bloqueo no se aplica y queda el error en el registro
   * técnico: el inicio de sesión sigue funcionando y lo protege el límite por IP.
   */
  private async leerLimitesBloqueo(): Promise<{
    intentosMaximos: number;
    minutosBloqueo: number;
  } | null> {
    const [intentosMaximos, minutosBloqueo] = await Promise.all([
      this.parametros.leerEntero(PARAMETRO_INTENTOS_MAXIMOS, {
        minimo: 1,
        maximo: 100,
      }),
      this.parametros.leerEntero(PARAMETRO_MINUTOS_BLOQUEO, {
        minimo: 1,
        maximo: 1440,
      }),
    ]);
    return intentosMaximos !== null && minutosBloqueo !== null
      ? { intentosMaximos, minutosBloqueo }
      : null;
  }

  /**
   * Valida un token del encabezado Authorization: firma, vencimiento, que su sesión exista
   * sin revocar y que el usuario siga activo. Los roles salen de la base, no del token,
   * para que una revocación de rol tenga efecto de inmediato.
   */
  async validarToken(token: string): Promise<UsuarioSesion> {
    let carga: unknown;
    try {
      carga = await this.jwt.verifyAsync<object>(token);
    } catch {
      throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    }
    // La firma prueba quién emitió el token, no su forma: uno firmado sin `jti` (un script,
    // u otro tipo de token en el futuro) se rechaza como sesión inválida, no como error 500.
    if (!esCargaToken(carga)) {
      throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    }

    const sesion = await this.prisma.sesion.findUnique({
      where: { jti: carga.jti },
      select: {
        id: true,
        id_usuario: true,
        expira_en: true,
        revocada_en: true,
        usuario: { select: SELECCION_USUARIO },
      },
    });
    const vigente =
      sesion !== null &&
      sesion.revocada_en === null &&
      sesion.id_usuario === carga.sub &&
      sesion.expira_en !== null &&
      sesion.expira_en.getTime() > Date.now() &&
      sesion.usuario?.activo === true;
    if (!vigente || !sesion.usuario) {
      throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    }

    return {
      ...aDto(sesion.usuario, nombresDeRoles(sesion.usuario)),
      asignaciones: asignacionesDe(sesion.usuario),
      jti: carga.jti,
      idSesion: sesion.id,
    };
  }

  /**
   * Cierra la sesión (HU-01-02): marca su fila en `sesion` como revocada con motivo
   * «logout». Desde ese momento el guard rechaza el token aunque no haya vencido. Solo
   * revoca la sesión del token con que se hace la petición, no las demás del usuario.
   */
  async cerrarSesion(usuario: UsuarioSesion): Promise<void> {
    // El guard ya cargó la sesión al validar el token: no hace falta volver a buscarla.
    const revocadaEn = new Date();
    const { count } = await this.prisma.sesion.updateMany({
      where: {
        id: usuario.idSesion,
        jti: usuario.jti,
        id_usuario: usuario.id,
        revocada_en: null,
      },
      data: { revocada_en: revocadaEn, motivo_revocacion: MOTIVO_LOGOUT },
    });
    if (count === 1) {
      // Auditoría (HU-14-01): el usuario y la IP salen del contexto de la petición.
      await this.auditoria.registrar({
        accion: 'actualizar',
        tablaAfectada: 'sesion',
        idRegistro: usuario.idSesion,
        valorAnterior: { revocada_en: null, motivo_revocacion: null },
        valorNuevo: {
          revocada_en: revocadaEn,
          motivo_revocacion: MOTIVO_LOGOUT,
        },
      });
    }
  }

  /**
   * Datos del usuario de la sesión actual. Salen de lo que el guard ya cargó al validar el
   * token: el frontend llama esto en cada recarga y no hace falta una segunda consulta.
   */
  obtenerUsuario(usuario: UsuarioSesion): UsuarioAutenticadoDto {
    const { id, nombres, apellidos, correo, roles, permisos } = usuario;
    return { id, nombres, apellidos, correo, roles, permisos };
  }
}

function esCargaToken(carga: unknown): carga is CargaToken {
  if (typeof carga !== 'object' || carga === null) {
    return false;
  }
  const { sub, jti } = carga as Record<string, unknown>;
  return (
    Number.isSafeInteger(sub) &&
    (sub as number) > 0 &&
    typeof jti === 'string' &&
    jti.length > 0
  );
}

interface UsuarioConRoles {
  id: number;
  nombres: string | null;
  apellidos: string | null;
  email: string | null;
  usuario_rol_usuario_rol_id_usuarioTousuario: {
    id_programa: number | null;
    rol: {
      nombre: string | null;
      rol_permiso: {
        modulo: { codigo: string | null } | null;
        permiso: { codigo: string | null } | null;
      }[];
    } | null;
  }[];
}

/** Cada rol vigente con su programa (`null`: todos los programas), como lo decidió URAP-34. */
function asignacionesDe(usuario: UsuarioConRoles): Asignacion[] {
  return usuario.usuario_rol_usuario_rol_id_usuarioTousuario
    .filter((asignacion) => Boolean(asignacion.rol?.nombre))
    .map((asignacion) => ({
      rol: asignacion.rol?.nombre ?? '',
      idPrograma: asignacion.id_programa,
    }));
}

/**
 * HU-01-03: la unión de los permisos de todos los roles vigentes del usuario, como
 * `modulo.permiso` y sin repetir. Un usuario con dos roles tiene los permisos de ambos.
 */
function permisosDe(usuario: UsuarioConRoles): string[] {
  const permisos = usuario.usuario_rol_usuario_rol_id_usuarioTousuario.flatMap(
    (asignacion) =>
      (asignacion.rol?.rol_permiso ?? [])
        .filter((fila) => fila.modulo?.codigo && fila.permiso?.codigo)
        .map((fila) =>
          clavePermiso(fila.modulo?.codigo ?? '', fila.permiso?.codigo ?? ''),
        ),
  );
  return [...new Set(permisos)].sort();
}

/** Un usuario puede tener el mismo rol en varios programas: se listan sin repetir. */
function nombresDeRoles(usuario: UsuarioConRoles): string[] {
  const nombres = usuario.usuario_rol_usuario_rol_id_usuarioTousuario
    .map((asignacion) => asignacion.rol?.nombre)
    .filter((nombre): nombre is string => Boolean(nombre));
  return [...new Set(nombres)];
}

function aDto(
  usuario: UsuarioConRoles,
  roles: string[],
): UsuarioAutenticadoDto {
  return {
    id: usuario.id,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    correo: usuario.email ?? '',
    roles,
    permisos: permisosDe(usuario),
  };
}

function recortar(texto: string | undefined): string | null {
  return texto ? texto.slice(0, LONGITUD_MAXIMA_TEXTO) : null;
}
