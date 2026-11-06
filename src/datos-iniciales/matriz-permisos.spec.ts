import { MODULOS, ROLES } from './catalogos.js';
import {
  MATRIZ_PERMISOS_INICIAL,
  permisosDeCelda,
  permisosInicialesDe,
} from './matriz-permisos.js';

describe('Matriz inicial de permisos (Producto 1, Tabla 17)', () => {
  it('cubre los seis roles y los nueve módulos del catálogo', () => {
    expect(Object.keys(MATRIZ_PERMISOS_INICIAL).sort()).toEqual(
      ROLES.map(({ nombre }) => nombre).sort(),
    );
    for (const fila of Object.values(MATRIZ_PERMISOS_INICIAL)) {
      expect(Object.keys(fila).sort()).toEqual(
        MODULOS.map(({ codigo }) => codigo).sort(),
      );
    }
  });

  it('traduce las letras de la tabla a los permisos del catálogo', () => {
    expect(permisosDeCelda('C')).toEqual(['leer']);
    expect(permisosDeCelda('R/E').sort()).toEqual(
      ['actualizar', 'crear', 'leer'].sort(),
    );
    expect(permisosDeCelda('R/A/C').sort()).toEqual(
      ['aprobar', 'crear', 'leer'].sort(),
    );
    expect(permisosDeCelda('G/C').sort()).toEqual(['generar', 'leer'].sort());
    expect(permisosDeCelda('—')).toEqual([]);
  });

  it('ADM incluye todo menos aprobar (decisión del 2026-11-06)', () => {
    expect(permisosDeCelda('ADM').sort()).toEqual(
      [
        'actualizar',
        'administrar',
        'crear',
        'eliminar',
        'generar',
        'leer',
      ].sort(),
    );
    expect(permisosDeCelda('ADM/C')).not.toContain('aprobar');
  });

  it('rechaza una celda que no reconoce', () => {
    expect(() => permisosDeCelda('X')).toThrow(/no reconocida/);
  });

  it('cada rol conserva al menos un permiso de lectura (HU-02-05)', () => {
    for (const { nombre } of ROLES) {
      expect(
        permisosInicialesDe(nombre).some(({ permiso }) => permiso === 'leer'),
      ).toBe(true);
    }
  });

  it('solo el Administrador administra usuarios y roles', () => {
    const conAdministracion = ROLES.filter(({ nombre }) =>
      permisosInicialesDe(nombre).some(
        ({ modulo, permiso }) =>
          modulo === 'usuarios' && permiso === 'administrar',
      ),
    ).map(({ nombre }) => nombre);
    expect(conAdministracion).toEqual(['Administrador']);
  });

  it('el Departamento crea y aprueba proyectos docentes (RF-08, RF-17), y el Administrador no los aprueba', () => {
    const departamento = permisosInicialesDe('Departamento académico');
    expect(departamento).toEqual(
      expect.arrayContaining([
        { modulo: 'proyectos', permiso: 'crear' },
        { modulo: 'proyectos', permiso: 'aprobar' },
      ]),
    );
    expect(
      permisosInicialesDe('Administrador').some(
        ({ permiso }) => permiso === 'aprobar',
      ),
    ).toBe(false);
  });
});
