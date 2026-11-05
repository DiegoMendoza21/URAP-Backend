import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PeticionAutenticada } from '../autenticacion.guard.js';
import type { UsuarioSesion } from '../tipos.js';

/** Inyecta en el controlador el usuario de la sesión que validó el guard global. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioSesion =>
    contexto.switchToHttp().getRequest<PeticionAutenticada>().usuario,
);
