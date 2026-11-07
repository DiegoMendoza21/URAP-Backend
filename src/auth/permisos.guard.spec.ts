import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESO_DECLARADO } from './decoradores/acceso.decorator.js';
import { Permiso } from './decoradores/permiso.decorator.js';
import { PermisosGuard } from './permisos.guard.js';
import { PERMISO_REQUERIDO } from './permisos.js';
import { MENSAJE_SIN_PERMISO } from './roles.guard.js';

class ControladorDePrueba {
  @Permiso('proyectos', 'crear')
  crear() {}

  sinPermiso() {}
}

@Permiso('usuarios', 'administrar')
class ControladorRestringido {
  listar() {}
}

function contexto(
  handler: () => void,
  permisos: string[] | undefined,
  clase: object = ControladorDePrueba,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({
      getRequest: () => ({
        usuario: permisos ? { id: 1, roles: [], permisos } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('@Permiso y PermisosGuard (HU-01-03)', () => {
  const reflector = new Reflector();
  const guard = new PermisosGuard(reflector);
  const { crear, sinPermiso } = ControladorDePrueba.prototype;

  it('declara el acceso para el guard global y guarda el permiso', () => {
    expect(reflector.get(ACCESO_DECLARADO, crear)).toBe(true);
    expect(reflector.get(PERMISO_REQUERIDO, crear)).toEqual({
      modulo: 'proyectos',
      permiso: 'crear',
    });
  });

  it('deja pasar a quien tiene el permiso en la unión de sus roles', () => {
    expect(
      guard.canActivate(contexto(crear, ['proyectos.leer', 'proyectos.crear'])),
    ).toBe(true);
  });

  it('niega con 403 a quien no lo tiene, aunque tenga otros del mismo módulo', () => {
    expect(() =>
      guard.canActivate(
        contexto(crear, ['proyectos.leer', 'proyectos.actualizar']),
      ),
    ).toThrow(new ForbiddenException(MENSAJE_SIN_PERMISO));
  });

  it('decide por el permiso, no por el nombre del rol: sirve para los roles propios', () => {
    // Un rol creado por el administrador (HU-02-05) no se llama como ninguno del sistema.
    expect(guard.canActivate(contexto(crear, ['proyectos.crear']))).toBe(true);
  });

  it('niega si no hay usuario en la petición', () => {
    expect(() => guard.canActivate(contexto(crear, undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('niega un endpoint que no declaró permiso en vez de abrirlo', () => {
    expect(() =>
      guard.canActivate(contexto(sinPermiso, ['proyectos.crear'])),
    ).toThrow(ForbiddenException);
  });

  it('aplica el permiso declarado en la clase a todos sus endpoints', () => {
    const { listar } = ControladorRestringido.prototype;
    expect(
      guard.canActivate(
        contexto(listar, ['usuarios.administrar'], ControladorRestringido),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contexto(listar, ['usuarios.leer'], ControladorRestringido),
      ),
    ).toThrow(ForbiddenException);
  });
});
