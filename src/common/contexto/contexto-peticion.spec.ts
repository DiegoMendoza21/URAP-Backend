import type { NextFunction, Request, Response } from 'express';
import {
  contextoActual,
  ejecutarEnContexto,
  middlewareContextoPeticion,
} from './contexto-peticion.js';

describe('contexto de la petición', () => {
  it('fuera de una petición no hay contexto', () => {
    expect(contextoActual()).toBeUndefined();
  });

  it('el middleware abre un contexto con la IP, que hereda el código asíncrono', async () => {
    let visto: unknown;
    const siguiente: NextFunction = () => {
      void (async () => {
        await Promise.resolve();
        visto = { ...contextoActual() };
      })();
    };

    middlewareContextoPeticion(
      { ip: '10.0.0.5' } as Request,
      {} as Response,
      siguiente,
    );
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(visto).toEqual({ ip: '10.0.0.5' });
    expect(contextoActual()).toBeUndefined();
  });

  it('cada petición tiene su propio contexto', async () => {
    const [a, b] = await Promise.all([
      ejecutarEnContexto({ idUsuario: 1 }, async () => {
        await new Promise((resolver) => setTimeout(resolver, 5));
        return contextoActual()?.idUsuario;
      }),
      ejecutarEnContexto({ idUsuario: 2 }, async () => {
        await Promise.resolve();
        return contextoActual()?.idUsuario;
      }),
    ]);

    expect([a, b]).toEqual([1, 2]);
  });
});
