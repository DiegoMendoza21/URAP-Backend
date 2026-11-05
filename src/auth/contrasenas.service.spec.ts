import { ContrasenasService } from './contrasenas.service.js';

describe('ContrasenasService', () => {
  const servicio = new ContrasenasService();

  it('no guarda la contraseña en texto plano y usa una sal distinta cada vez', async () => {
    const primero = await servicio.hashear('Clave-de-prueba-1');
    const segundo = await servicio.hashear('Clave-de-prueba-1');

    expect(primero).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(primero).not.toContain('Clave-de-prueba-1');
    expect(primero).not.toBe(segundo);
  });

  it('verifica la contraseña correcta y rechaza una incorrecta', async () => {
    const hash = await servicio.hashear('Clave-de-prueba-1');

    await expect(servicio.verificar('Clave-de-prueba-1', hash)).resolves.toBe(
      true,
    );
    await expect(servicio.verificar('Clave-de-prueba-2', hash)).resolves.toBe(
      false,
    );
  });

  it.each([null, undefined, '', 'texto-plano', 'scrypt$0$8$1$abc$def'])(
    'nunca da por válido un hash ausente o mal formado (%s)',
    async (hash) => {
      await expect(servicio.verificar('cualquiera', hash)).resolves.toBe(false);
    },
  );
});
