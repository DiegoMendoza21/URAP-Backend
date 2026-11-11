import { randomInt } from 'node:crypto';

/** Sin 0, O, 1, l ni I: la contraseña se dicta o se copia a mano y esos se confunden. */
const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
const MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITOS = '23456789';
const ALFABETO = MINUSCULAS + MAYUSCULAS + DIGITOS;

const GRUPOS = 4;
const LARGO_GRUPO = 4;

/**
 * Contraseña temporal de un usuario nuevo o restablecida por el administrador (HU-02-01).
 * Dieciséis caracteres al azar (más de 90 bits) en cuatro grupos, con al menos una
 * minúscula, una mayúscula y un dígito. Se entrega una sola vez; el sistema guarda su hash.
 */
export function generarContrasenaTemporal(): string {
  const total = GRUPOS * LARGO_GRUPO;
  const caracteres = [
    alAzar(MINUSCULAS),
    alAzar(MAYUSCULAS),
    alAzar(DIGITOS),
    ...Array.from({ length: total - 3 }, () => alAzar(ALFABETO)),
  ];
  // Fisher-Yates: los tres obligatorios no quedan siempre al principio.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return Array.from({ length: GRUPOS }, (_, grupo) =>
    caracteres.slice(grupo * LARGO_GRUPO, (grupo + 1) * LARGO_GRUPO).join(''),
  ).join('-');
}

function alAzar(alfabeto: string): string {
  return alfabeto[randomInt(alfabeto.length)];
}
