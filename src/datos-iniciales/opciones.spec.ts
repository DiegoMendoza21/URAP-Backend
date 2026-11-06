import { leerOpcionesSembrado } from './opciones.js';

describe('leerOpcionesSembrado', () => {
  const contrasena = 'una-contrasena-larga';

  it('sin --demo carga solo los datos base y no pide contraseña', () => {
    expect(leerOpcionesSembrado([], { NODE_ENV: 'production' })).toEqual({
      demo: false,
    });
  });

  it('con --demo y una contraseña válida carga los datos de demostración', () => {
    expect(
      leerOpcionesSembrado(['--demo'], {
        NODE_ENV: 'development',
        CONTRASENA_USUARIOS_DEMO: contrasena,
      }),
    ).toEqual({ demo: true, contrasenaDemo: contrasena });
  });

  it('se niega a cargar los datos de demostración en producción', () => {
    expect(() =>
      leerOpcionesSembrado(['--demo'], {
        NODE_ENV: 'production',
        CONTRASENA_USUARIOS_DEMO: contrasena,
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it('exige una contraseña de al menos 12 caracteres para la demostración', () => {
    expect(() =>
      leerOpcionesSembrado(['--demo'], {
        NODE_ENV: 'development',
        CONTRASENA_USUARIOS_DEMO: 'corta',
      }),
    ).toThrow(/CONTRASENA_USUARIOS_DEMO/);
    expect(() =>
      leerOpcionesSembrado(['--demo'], { NODE_ENV: 'development' }),
    ).toThrow(/CONTRASENA_USUARIOS_DEMO/);
  });
});
