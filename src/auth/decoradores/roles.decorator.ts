import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../roles.guard.js';
import { type NombreRol, ROLES_PERMITIDOS } from '../roles.js';
import { declararAcceso } from './acceso.decorator.js';

/**
 * Restringe un endpoint a los usuarios que tengan al menos uno de los roles indicados.
 * Declara el acceso para el guard global y agrega `RolesGuard`.
 *
 * Es la versión mínima que necesitó RF-08. HU-01-03 la amplía con el programa de cada rol
 * (`usuario_rol.id_programa`) y con la matriz de permisos por módulo. Mientras tanto, el
 * alcance por programa y por proyecto propio lo comprueba cada servicio.
 */
export const Roles = (...roles: [NombreRol, ...NombreRol[]]) =>
  applyDecorators(
    declararAcceso(),
    SetMetadata(ROLES_PERMITIDOS, roles),
    UseGuards(RolesGuard),
  );
