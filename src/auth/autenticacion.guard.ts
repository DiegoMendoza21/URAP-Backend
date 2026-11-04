import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICO } from './decoradores/publico.decorator.js';

/**
 * Guard global que cierra por defecto: solo deja pasar lo marcado con @Publico().
 *
 * Todavía no existe inicio de sesión, así que ninguna petición puede autenticarse y todo
 * endpoint no público responde 401. HU-01-01 agrega aquí la validación del JWT, y
 * HU-01-02 la comprobación de que su sesión siga vigente en la tabla `sesion`.
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean | undefined>(
      ES_PUBLICO,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (esPublico) {
      return true;
    }
    throw new UnauthorizedException(
      'Debe iniciar sesión para acceder a este recurso.',
    );
  }
}
