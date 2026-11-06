/** Mínimo para la contraseña de los usuarios de demostración. */
export const LONGITUD_MINIMA_CONTRASENA = 12;

export type OpcionesSembrado =
  { demo: false } | { demo: true; contrasenaDemo: string };

/**
 * Decide qué cargar a partir de los argumentos y del entorno. Con `--demo` se agregan los
 * datos de demostración, que crean un Administrador global con una contraseña compartida: por
 * eso nunca se cargan con NODE_ENV=production.
 */
export function leerOpcionesSembrado(
  argumentos: readonly string[],
  entorno: NodeJS.ProcessEnv,
): OpcionesSembrado {
  if (!argumentos.includes('--demo')) {
    return { demo: false };
  }
  if (entorno.NODE_ENV === 'production') {
    throw new Error(
      'Los datos de demostración no se cargan con NODE_ENV=production: crean un ' +
        'Administrador con una contraseña compartida. En producción use `npm run db:sembrar`.',
    );
  }
  const contrasenaDemo = entorno.CONTRASENA_USUARIOS_DEMO ?? '';
  if (contrasenaDemo.length < LONGITUD_MINIMA_CONTRASENA) {
    throw new Error(
      `CONTRASENA_USUARIOS_DEMO falta o tiene menos de ${LONGITUD_MINIMA_CONTRASENA} ` +
        'caracteres. Defínala en el .env (ver .env.example).',
    );
  }
  return { demo: true, contrasenaDemo };
}
