import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type {
  CodigoModulo,
  CodigoPermiso,
} from '../../datos-iniciales/catalogos.js';
import { PermisosGuard } from '../permisos.guard.js';
import { PERMISO_REQUERIDO, type PermisoRequerido } from '../permisos.js';
import { declararAcceso } from './acceso.decorator.js';

/**
 * HU-01-03: restringe un endpoint a quien tenga el permiso en la matriz (HU-02-06), en
 * cualquiera de sus roles vigentes. Es el modo normal de proteger un endpoint: decide la
 * matriz, que el administrador configura, y no el nombre del rol, así que también sirve para
 * los roles que él cree (HU-02-05).
 *
 * El alcance (el programa del rol, los proyectos propios del docente) lo sigue comprobando
 * cada servicio. `@Roles()` queda solo para las reglas que la matriz no expresa.
 */
export const Permiso = (modulo: CodigoModulo, permiso: CodigoPermiso) =>
  applyDecorators(
    declararAcceso(),
    SetMetadata(PERMISO_REQUERIDO, {
      modulo,
      permiso,
    } satisfies PermisoRequerido),
    UseGuards(PermisosGuard),
  );
