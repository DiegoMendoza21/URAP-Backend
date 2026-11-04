import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

export const MENSAJE_DATOS_INVALIDOS = 'Los datos enviados no son válidos.';

/**
 * Pipe global de validación (NFR-011): todo DTO de entrada se valida en el backend.
 * Cada regla de class-validator lleva su `message` en español en el propio DTO; la única
 * regla que agrega el pipe por su cuenta (campo no declarado) se traduce aquí.
 */
export function crearPipeValidacion(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errores: ValidationError[]) =>
      new BadRequestException({
        mensaje: MENSAJE_DATOS_INVALIDOS,
        detalles: aplanarErrores(errores),
      }),
  });
}

function aplanarErrores(errores: ValidationError[], prefijo = ''): string[] {
  return errores.flatMap((error) => {
    const campo = prefijo ? `${prefijo}.${error.property}` : error.property;
    const mensajes = Object.entries(error.constraints ?? {}).map(
      ([regla, mensaje]) =>
        regla === 'whitelistValidation'
          ? `El campo «${campo}» no está permitido.`
          : mensaje,
    );
    return [...mensajes, ...aplanarErrores(error.children ?? [], campo)];
  });
}
