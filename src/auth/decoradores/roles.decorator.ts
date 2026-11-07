import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../roles.guard.js';
import { type NombreRol, ROLES_PERMITIDOS } from '../roles.js';
import { declararAcceso } from './acceso.decorator.js';

/**
 * Restringe un endpoint a los usuarios que tengan al menos uno de los roles indicados, por su
 * nombre. Declara el acceso para el guard global y agrega `RolesGuard`.
 *
 * Desde HU-01-03 los endpoints se protegen con `@Permiso()`, que consulta la matriz de
 * permisos. Este decorador queda para las reglas que la matriz no expresa: un rol creado por
 * el administrador nunca coincide con estos nombres.
 */
export const Roles = (...roles: [NombreRol, ...NombreRol[]]) =>
  applyDecorators(
    declararAcceso(),
    SetMetadata(ROLES_PERMITIDOS, roles),
    UseGuards(RolesGuard),
  );
