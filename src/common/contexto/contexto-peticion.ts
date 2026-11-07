import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Datos de la petición en curso que necesitan capas que no reciben la petición, como la
 * auditoría (RF-29): quién hizo la acción y desde qué IP. Así ningún servicio tiene que
 * pasarlos de mano en mano.
 */
export interface ContextoPeticion {
  ip?: string;
  /** Lo completa el guard de autenticación cuando valida el token. */
  idUsuario?: number;
}

const almacen = new AsyncLocalStorage<ContextoPeticion>();

/** Contexto de la petición en curso, o `undefined` fuera de una petición (tareas, pruebas). */
export function contextoActual(): ContextoPeticion | undefined {
  return almacen.getStore();
}

/** Ejecuta `fn` con el contexto dado. Lo usan el middleware y las pruebas. */
export function ejecutarEnContexto<T>(
  contexto: ContextoPeticion,
  fn: () => T,
): T {
  return almacen.run(contexto, fn);
}

/**
 * Abre el contexto de cada petición. Va antes de las rutas, así que todo lo que atiende la
 * petición (guards, controladores, servicios) lo hereda. La IP sale de `req.ip`, que respeta
 * `trust proxy` (PROXIES_CONFIABLES).
 */
export function middlewareContextoPeticion(
  peticion: Request,
  _respuesta: Response,
  siguiente: NextFunction,
): void {
  almacen.run({ ip: peticion.ip }, siguiente);
}
