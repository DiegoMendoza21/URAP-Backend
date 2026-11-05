import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AutenticacionGuard } from './autenticacion.guard.js';
import { Publico } from './decoradores/publico.decorator.js';

class ControladorMixto {
  @Publico()
  abierto(): void {}

  sinDeclarar(): void {}
}

@Publico()
class ControladorPublico {
  cualquiera(): void {}
}

function contexto(
  clase: { prototype: object },
  metodo: string,
): ExecutionContext {
  return {
    getHandler: () => (clase.prototype as Record<string, unknown>)[metodo],
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

describe('AutenticacionGuard', () => {
  const guard = new AutenticacionGuard(new Reflector());

  it('deja pasar un endpoint marcado con @Publico()', () => {
    expect(guard.canActivate(contexto(ControladorMixto, 'abierto'))).toBe(true);
  });

  it('deja pasar los endpoints de un controlador marcado con @Publico()', () => {
    expect(guard.canActivate(contexto(ControladorPublico, 'cualquiera'))).toBe(
      true,
    );
  });

  it('cierra por defecto un endpoint sin declaración explícita', () => {
    expect(() =>
      guard.canActivate(contexto(ControladorMixto, 'sinDeclarar')),
    ).toThrow(UnauthorizedException);
  });
});
