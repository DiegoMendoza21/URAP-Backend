import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { contextoActual } from '../common/contexto/contexto-peticion.js';
import { AuthService } from './auth.service.js';
import { ACCESO_DECLARADO } from './decoradores/acceso.decorator.js';
import { ES_PUBLICO } from './decoradores/publico.decorator.js';
import type { UsuarioSesion } from './tipos.js';

export const MENSAJE_SIN_TOKEN =
  'Debe iniciar sesión para acceder a este recurso.';

/** Petición después de pasar el guard: lleva el usuario de la sesión. */
export interface PeticionAutenticada extends Request {
  usuario: UsuarioSesion;
}

/**
 * Guard global que cierra por defecto. Deja pasar solo:
 * - lo marcado con @Publico(), o
 * - una petición con un JWT válido cuya sesión siga vigente en la tabla `sesion` (NFR-003),
 *   hacia un endpoint que declaró quién puede usarlo (ver `acceso.decorator.ts`).
 *
 * La autorización por rol y permiso (HU-01-03) se apoya en `peticion.usuario.roles`.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  private readonly logger = new Logger(AutenticacionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) {
      return true;
    }

    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const token = extraerToken(peticion);
    if (!token) {
      throw new UnauthorizedException(MENSAJE_SIN_TOKEN);
    }
    peticion.usuario = await this.auth.validarToken(token);
    // La auditoría atribuye a este usuario lo que haga la petición (RF-29).
    const contextoPeticion = contextoActual();
    if (contextoPeticion) {
      contextoPeticion.idUsuario = peticion.usuario.id;
    }

    if (
      !this.reflector.getAllAndOverride<boolean>(ACCESO_DECLARADO, objetivos)
    ) {
      // Se niega en vez de abrirse: es un error de programación y debe notarse en desarrollo.
      this.logger.error(
        `${contexto.getClass().name}.${contexto.getHandler().name} es un endpoint ` +
          'protegido sin declaración de acceso. Agregue el decorador de autorización ' +
          'correspondiente o @CualquierUsuarioAutenticado().',
      );
      throw new ForbiddenException(
        'No tiene permiso para realizar esta acción.',
      );
    }
    return true;
  }
}

function extraerToken(peticion: Request): string | undefined {
  const [esquema, token] = peticion.headers.authorization?.split(' ') ?? [];
  return esquema?.toLowerCase() === 'bearer' && token ? token : undefined;
}
