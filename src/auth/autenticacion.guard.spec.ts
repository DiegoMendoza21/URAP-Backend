import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from './auth.service.js';
import {
  AutenticacionGuard,
  MENSAJE_SIN_TOKEN,
} from './autenticacion.guard.js';
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
  peticion: Record<string, unknown> = { headers: {} },
): ExecutionContext {
  return {
    getHandler: () => (clase.prototype as Record<string, unknown>)[metodo],
    getClass: () => clase,
    switchToHttp: () => ({ getRequest: () => peticion }),
  } as unknown as ExecutionContext;
}

describe('AutenticacionGuard', () => {
  const auth = { validarToken: vi.fn() };
  const guard = new AutenticacionGuard(
    new Reflector(),
    auth as unknown as AuthService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deja pasar un endpoint marcado con @Publico()', async () => {
    await expect(
      guard.canActivate(contexto(ControladorMixto, 'abierto')),
    ).resolves.toBe(true);
    expect(auth.validarToken).not.toHaveBeenCalled();
  });

  it('deja pasar los endpoints de un controlador marcado con @Publico()', async () => {
    await expect(
      guard.canActivate(contexto(ControladorPublico, 'cualquiera')),
    ).resolves.toBe(true);
  });

  it('cierra por defecto un endpoint sin declaración explícita si no hay token', async () => {
    await expect(
      guard.canActivate(contexto(ControladorMixto, 'sinDeclarar')),
    ).rejects.toThrow(new UnauthorizedException(MENSAJE_SIN_TOKEN));
  });

  it('rechaza un encabezado Authorization que no es Bearer', async () => {
    const peticion = {
      headers: { authorization: 'Basic dXN1YXJpbzpjbGF2ZQ==' },
    };

    await expect(
      guard.canActivate(contexto(ControladorMixto, 'sinDeclarar', peticion)),
    ).rejects.toThrow(UnauthorizedException);
    expect(auth.validarToken).not.toHaveBeenCalled();
  });

  it('con un token válido deja pasar y adjunta el usuario a la petición', async () => {
    const usuario = { id: 7, roles: ['Docente'], jti: 'jti-1' };
    auth.validarToken.mockResolvedValue(usuario);
    const peticion: Record<string, unknown> = {
      headers: { authorization: 'Bearer token-firmado' },
    };

    await expect(
      guard.canActivate(contexto(ControladorMixto, 'sinDeclarar', peticion)),
    ).resolves.toBe(true);
    expect(auth.validarToken).toHaveBeenCalledWith('token-firmado');
    expect(peticion.usuario).toEqual(usuario);
  });

  it('propaga el rechazo de un token inválido, vencido o revocado', async () => {
    auth.validarToken.mockRejectedValue(new UnauthorizedException('x'));
    const peticion = { headers: { authorization: 'Bearer revocado' } };

    await expect(
      guard.canActivate(contexto(ControladorMixto, 'sinDeclarar', peticion)),
    ).rejects.toThrow(UnauthorizedException);
  });
});
