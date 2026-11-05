import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { ES_PUBLICO } from './decoradores/publico.decorator.js';
import type { UsuarioSesion } from './tipos.js';

export const MENSAJE_SIN_TOKEN =
  'Debe iniciar sesión para acceder a este recurso.';

/** Petición después de pasar el guard: lleva el usuario de la sesión. */
export interface PeticionAutenticada extends Request {
  usuario: UsuarioSesion;
}

/**
 * Guard global que cierra por defecto: solo deja pasar lo marcado con @Publico() o una
 * petición con un JWT válido cuya sesión siga vigente en la tabla `sesion` (NFR-003).
 * La autorización por rol y permiso (HU-01-03) se apoya en `peticion.usuario.roles`.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean | undefined>(
      ES_PUBLICO,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (esPublico) {
      return true;
    }

    const peticion = contexto.switchToHttp().getRequest<PeticionAutenticada>();
    const token = extraerToken(peticion);
    if (!token) {
      throw new UnauthorizedException(MENSAJE_SIN_TOKEN);
    }
    peticion.usuario = await this.auth.validarToken(token);
    return true;
  }
}

function extraerToken(peticion: Request): string | undefined {
  const [esquema, token] = peticion.headers.authorization?.split(' ') ?? [];
  return esquema?.toLowerCase() === 'bearer' && token ? token : undefined;
}
