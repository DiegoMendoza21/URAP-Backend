import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PeticionAutenticada } from './autenticacion.guard.js';
import { type NombreRol, ROLES_PERMITIDOS } from './roles.js';

export const MENSAJE_SIN_PERMISO =
  'No tiene permiso para realizar esta acción.';

/**
 * Deja pasar solo a quien tenga al menos uno de los roles que declaró el endpoint con
 * `@Roles()`. Corre después del guard global, que ya validó la sesión y cargó los roles
 * vigentes en la base. El alcance (programa, proyectos propios) lo comprueba cada servicio.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permitidos = this.reflector.getAllAndOverride<
      NombreRol[] | undefined
    >(ROLES_PERMITIDOS, [contexto.getHandler(), contexto.getClass()]);
    const { usuario } = contexto
      .switchToHttp()
      .getRequest<PeticionAutenticada>();

    // Sin roles declarados no se abre nada: sería un error de programación.
    if (
      !permitidos?.length ||
      !usuario?.roles.some((rol) => (permitidos as string[]).includes(rol))
    ) {
      throw new ForbiddenException(MENSAJE_SIN_PERMISO);
    }
    return true;
  }
}
