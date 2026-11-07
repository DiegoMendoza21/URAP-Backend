import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PeticionAutenticada } from './autenticacion.guard.js';
import {
  clavePermiso,
  PERMISO_REQUERIDO,
  type PermisoRequerido,
} from './permisos.js';
import { MENSAJE_SIN_PERMISO } from './roles.guard.js';

/**
 * Deja pasar solo a quien tenga, en la unión de sus roles, el permiso que el endpoint declaró
 * con `@Permiso()`. Corre después del guard global, que ya validó la sesión y cargó los
 * permisos vigentes en la base. Responde 403 aunque la opción esté oculta en el frontend.
 */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const requerido = this.reflector.getAllAndOverride<
      PermisoRequerido | undefined
    >(PERMISO_REQUERIDO, [contexto.getHandler(), contexto.getClass()]);
    const { usuario } = contexto
      .switchToHttp()
      .getRequest<PeticionAutenticada>();

    // Sin permiso declarado no se abre nada: sería un error de programación.
    if (
      !requerido ||
      !usuario?.permisos.includes(
        clavePermiso(requerido.modulo, requerido.permiso),
      )
    ) {
      throw new ForbiddenException(MENSAJE_SIN_PERMISO);
    }
    return true;
  }
}
