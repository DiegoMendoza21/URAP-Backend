/** Campo del formulario multipart que trae los archivos de una carga de evidencias. */
export const CAMPO_ARCHIVOS = 'archivos';

/**
 * Archivos por cada carga. No es un dato de negocio sino un tope técnico: los archivos se
 * reciben en memoria antes de validarlos, y RF-24 espera de dos a diez evidencias por RAP en
 * todo el período. Para cargar más, se repite la carga.
 */
export const MAXIMO_ARCHIVOS_POR_CARGA = 5;
