import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { VariablesEntorno } from '../common/configuracion/variables-entorno.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ContrasenasService } from './contrasenas.service.js';
import type { IniciarSesionDto } from './dto/iniciar-sesion.dto.js';
import type { SesionIniciadaDto } from './dto/sesion-iniciada.dto.js';
import type { UsuarioAutenticadoDto } from './dto/usuario-autenticado.dto.js';
import type { CargaToken, OrigenPeticion, UsuarioSesion } from './tipos.js';

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
    select: { rol: { select: { nombre: true } } },
  },
} as const;

/**
 * Inicio de sesión y validación de sesiones (RF-01, NFR-003, NFR-005).
 *
 * Fuera de alcance, con historia propia: el conteo de intentos fallidos y el bloqueo
 * temporal (HU-01-04) y el registro en auditoría (HU-14-01).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly contrasenas: ContrasenasService,
    private readonly config: ConfigService<VariablesEntorno, true>,
  ) {}

  async iniciarSesion(
    datos: IniciarSesionDto,
    origen: OrigenPeticion = {},
  ): Promise<SesionIniciadaDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: datos.correo },
      select: { ...SELECCION_USUARIO, password_hash: true },
    });

    // Se verifica aunque el usuario no exista: así la respuesta tarda lo mismo y no revela
    // qué correos están registrados (RF-01, excepción p2).
    const coincide = await this.contrasenas.verificar(
      datos.contrasena,
      usuario?.password_hash,
    );
    if (!usuario || !coincide) {
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

    await this.prisma.$transaction([
      this.prisma.sesion.create({
        data: {
          id_usuario: usuario.id,
          jti,
          emitida_en: emitidaEn,
          expira_en: expiraEn,
          ip: recortar(origen.ip),
          user_agent: recortar(origen.userAgent),
        },
      }),
      this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { ultimo_acceso: emitidaEn },
      }),
    ]);

    return {
      token,
      expiraEn: expiraEn.toISOString(),
      usuario: aDto(usuario, roles),
    };
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
      jti: carga.jti,
    };
  }

  /**
   * Cierra la sesión (HU-01-02): marca su fila en `sesion` como revocada con motivo
   * «logout». Desde ese momento el guard rechaza el token aunque no haya vencido. Solo
   * revoca la sesión del token con que se hace la petición, no las demás del usuario.
   */
  async cerrarSesion(usuario: UsuarioSesion): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { jti: usuario.jti, id_usuario: usuario.id, revocada_en: null },
      data: { revocada_en: new Date(), motivo_revocacion: MOTIVO_LOGOUT },
    });
  }

  /**
   * Datos del usuario de la sesión actual. Salen de lo que el guard ya cargó al validar el
   * token: el frontend llama esto en cada recarga y no hace falta una segunda consulta.
   */
  obtenerUsuario(usuario: UsuarioSesion): UsuarioAutenticadoDto {
    const { id, nombres, apellidos, correo, roles } = usuario;
    return { id, nombres, apellidos, correo, roles };
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
    rol: { nombre: string | null } | null;
  }[];
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
  };
}

function recortar(texto: string | undefined): string | null {
  return texto ? texto.slice(0, LONGITUD_MAXIMA_TEXTO) : null;
}
