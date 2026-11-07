import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './decoradores/roles.decorator.js';
import { ACCESO_DECLARADO } from './decoradores/acceso.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { ROL, ROLES_PERMITIDOS } from './roles.js';

class ControladorDePrueba {
  @Roles(ROL.departamento, ROL.administrador)
  restringido() {}

  sinRoles() {}
}

function contexto(
  handler: () => void,
  roles: string[] | undefined,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ControladorDePrueba,
    switchToHttp: () => ({
      getRequest: () => ({ usuario: roles ? { id: 1, roles } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('@Roles y RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const { restringido, sinRoles } = ControladorDePrueba.prototype;

  it('declara el acceso para el guard global y guarda los roles', () => {
    expect(reflector.get(ACCESO_DECLARADO, restringido)).toBe(true);
    expect(reflector.get(ROLES_PERMITIDOS, restringido)).toEqual([
      ROL.departamento,
      ROL.administrador,
    ]);
  });

  it('deja pasar a quien tiene alguno de los roles, aunque tenga otros', () => {
    expect(
      guard.canActivate(contexto(restringido, [ROL.docente, ROL.departamento])),
    ).toBe(true);
  });

  it('niega a quien no tiene ninguno de los roles', () => {
    expect(() =>
      guard.canActivate(contexto(restringido, [ROL.docente, ROL.liderRap])),
    ).toThrow(ForbiddenException);
  });

  it('niega si no hay usuario en la petición', () => {
    expect(() => guard.canActivate(contexto(restringido, undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('niega un endpoint que no declaró roles en vez de abrirlo', () => {
    expect(() =>
      guard.canActivate(contexto(sinRoles, [ROL.administrador])),
    ).toThrow(ForbiddenException);
  });
});
