/**
 * Utilidades de los listados ordenados del proyecto docente: estrategias (RF-13) y
 * bibliografía (RF-16).
 */

/** Para comparar textos como lo haría el docente: sin mayúsculas ni espacios de más. */
export function claveTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CO');
}

/** El primer texto que aparece dos veces en la lista, o nulo si no hay repetidos. */
export function primeraRepetida(lista: readonly string[]): string | null {
  const vistas = new Set<string>();
  for (const texto of lista) {
    const clave = claveTexto(texto);
    if (vistas.has(clave)) {
      return texto;
    }
    vistas.add(clave);
  }
  return null;
}

/** Un texto largo, recortado para citarlo en un mensaje de error. */
export function citar(texto: string, maximo = 60): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}
