import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

/** Tope de correos inexistentes que se recuerdan a la vez, para no crecer sin límite. */
export const MAXIMO_CORREOS_RECORDADOS = 10_000;

interface Registro {
  intentos: number;
  bloqueadoHasta: Date | null;
}

/**
 * Fin de un bloqueo que empieza `ahora`, en segundos enteros. `usuario.bloqueado_hasta` es un
 * datetime sin fracciones y MySQL redondea los milisegundos hacia arriba: sin esto, una cuenta
 * registrada diría «16 minutos» y un correo inexistente «15», y se notaría la diferencia.
 */
export function finDelBloqueo(ahora: Date, minutos: number): Date {
  return new Date(
    Math.floor((ahora.getTime() + minutos * 60_000) / 1000) * 1000,
  );
}

export interface LimitesBloqueo {
  intentosMaximos: number;
  minutosBloqueo: number;
}

/**
 * Conteo de intentos fallidos contra correos que no están registrados (HU-01-04, RF-01 p2).
 *
 * Una cuenta registrada se bloquea tras varios intentos y responde 429. Si un correo
 * inexistente siguiera respondiendo 401, ese 429 delataría qué correos existen. Por eso los
 * correos inexistentes llevan el mismo conteo y el mismo bloqueo, aquí en memoria: no hay fila
 * de `usuario` donde guardarlo.
 *
 * La clave es un hash del correo, no el correo. El conteo se pierde al reiniciar la API y, con
 * varias instancias, cada una cuenta por su lado; el límite por IP sigue aplicando.
 */
@Injectable()
export class IntentosAnonimosService {
  private readonly registros = new Map<string, Registro>();

  /** Fin del bloqueo vigente del correo, o `null` si no está bloqueado. */
  bloqueadoHasta(correo: string, ahora: Date): Date | null {
    const registro = this.registros.get(clave(correo));
    return registro?.bloqueadoHasta && registro.bloqueadoHasta > ahora
      ? registro.bloqueadoHasta
      : null;
  }

  /**
   * Suma un intento fallido, igual que en `usuario.intentos_fallidos`. Si llega al límite,
   * bloquea el correo, reinicia el conteo y devuelve el fin del bloqueo.
   */
  registrarFallo(
    correo: string,
    limites: LimitesBloqueo,
    ahora: Date,
  ): Date | null {
    const llave = clave(correo);
    const anterior = this.registros.get(llave);
    const bloqueoVencido =
      anterior?.bloqueadoHasta && anterior.bloqueadoHasta <= ahora;
    const intentos = (bloqueoVencido ? 0 : (anterior?.intentos ?? 0)) + 1;

    // Se reinserta al final: el Map queda ordenado del menos al más reciente.
    this.registros.delete(llave);
    if (intentos < limites.intentosMaximos) {
      this.guardar(llave, { intentos, bloqueadoHasta: null });
      return null;
    }
    const bloqueadoHasta = finDelBloqueo(ahora, limites.minutosBloqueo);
    this.guardar(llave, { intentos: 0, bloqueadoHasta });
    return bloqueadoHasta;
  }

  private guardar(llave: string, registro: Registro): void {
    this.registros.set(llave, registro);
    if (this.registros.size > MAXIMO_CORREOS_RECORDADOS) {
      const masAntiguo = this.registros.keys().next().value;
      if (masAntiguo !== undefined) {
        this.registros.delete(masAntiguo);
      }
    }
  }
}

function clave(correo: string): string {
  return createHash('sha256').update(correo.trim().toLowerCase()).digest('hex');
}
