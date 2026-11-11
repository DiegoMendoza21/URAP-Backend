import { generarContrasenaTemporal } from './contrasena-temporal.js';

describe('generarContrasenaTemporal', () => {
  it('tiene cuatro grupos de cuatro, con minúscula, mayúscula y dígito, sin caracteres que se confunden', () => {
    for (let i = 0; i < 200; i++) {
      const contrasena = generarContrasenaTemporal();
      expect(contrasena).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
      expect(contrasena).toMatch(/[a-z]/);
      expect(contrasena).toMatch(/[A-Z]/);
      expect(contrasena).toMatch(/[2-9]/);
      expect(contrasena).not.toMatch(/[0O1lI]/);
    }
  });

  it('no repite contraseñas', () => {
    const generadas = new Set(
      Array.from({ length: 500 }, () => generarContrasenaTemporal()),
    );
    expect(generadas.size).toBe(500);
  });
});
