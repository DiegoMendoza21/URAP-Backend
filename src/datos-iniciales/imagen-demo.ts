import { crc32, deflateSync } from 'node:zlib';

/**
 * Imagen PNG generada por código para las evidencias de demostración (RF-24): un degradado con
 * franjas diagonales, distinto para cada semilla. No es una foto: ninguna persona puede
 * aparecer en ella (Ley 1581 de 2012).
 */
export function imagenDemo(semilla: number, ancho = 320, alto = 200): Buffer {
  const [r0, g0, b0] = colorDe(semilla);
  const [r1, g1, b1] = colorDe(semilla + 3);
  // Cada fila empieza con el byte del filtro PNG (0: sin filtro) y sigue con RGB por píxel.
  const filas = Buffer.alloc(alto * (1 + ancho * 3));
  for (let y = 0; y < alto; y++) {
    const inicio = y * (1 + ancho * 3);
    filas[inicio] = 0;
    for (let x = 0; x < ancho; x++) {
      const t = x / (ancho - 1);
      const franja =
        Math.floor((x + y + semilla * 11) / 24) % 2 === 0 ? 1 : 0.82;
      const posicion = inicio + 1 + x * 3;
      filas[posicion] = Math.round((r0 + (r1 - r0) * t) * franja);
      filas[posicion + 1] = Math.round((g0 + (g1 - g0) * t) * franja);
      filas[posicion + 2] = Math.round((b0 + (b1 - b0) * t) * franja);
    }
  }

  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 2; // color verdadero (RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', deflateSync(filas)),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

/** Colores suaves de una paleta fija, para que las imágenes se distingan entre sí. */
function colorDe(semilla: number): [number, number, number] {
  const paleta: [number, number, number][] = [
    [37, 99, 235],
    [16, 185, 129],
    [245, 158, 11],
    [139, 92, 246],
    [236, 72, 153],
    [14, 165, 233],
  ];
  return paleta[Math.abs(semilla) % paleta.length];
}

function bloque(tipo: string, datos: Buffer): Buffer {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length, 0);
  const tipoYDatos = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const control = Buffer.alloc(4);
  control.writeUInt32BE(crc32(tipoYDatos), 0);
  return Buffer.concat([longitud, tipoYDatos, control]);
}
