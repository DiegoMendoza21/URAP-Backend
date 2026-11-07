/**
 * Secciones del proyecto docente que diligencia el docente, con la numeración del formato
 * FO-DO/PC-001 (glosario, «Formatos»). Cada sección se guarda por separado (HU-06-08): el
 * docente puede llenar una a medias, pasar a otra y volver otro día.
 *
 * Para agregar los puntos 4 a 7 (RF-13 a RF-16):
 * 1. Sumar a `DatosCompletitud` lo que la sección necesita para saber si está completa.
 * 2. Agregar su entrada a `SECCIONES`, en el orden del formato.
 * 3. Leer esos datos en `DiligenciamientoService.datosCompletitud()`.
 * El resumen (`GET /proyectos-docentes/:id/diligenciamiento`) y la verificación de envío a
 * revisión (RF-17) se alimentan de esta lista.
 */

/** Lo mínimo que hay que leer del proyecto para evaluar todas las secciones. */
export interface DatosCompletitud {
  descripcion: string | null;
  /** RAP seleccionados en la creación del proyecto (`proyecto_docente_rap`). */
  raps: { id: number; codigo: string | null; numero: number | null }[];
  /** Para cada RAC, los RAP a los que contribuye (`rac_rap`). */
  racs: { idsRap: number[] }[];
}

export interface Seccion {
  numero: number;
  clave: string;
  titulo: string;
  /** Lo que le falta a la sección para estar completa. Vacío: completa. */
  pendientes(datos: DatosCompletitud): string[];
}

function nombreRap(rap: DatosCompletitud['raps'][number]): string {
  return rap.codigo ?? `RAP ${rap.numero ?? rap.id}`;
}

export const SECCIONES: readonly Seccion[] = [
  {
    numero: 2,
    clave: 'descripcion',
    titulo: 'Descripción',
    pendientes: ({ descripcion }) =>
      descripcion?.trim() ? [] : ['Redacte la descripción del curso.'],
  },
  {
    numero: 3,
    clave: 'rac',
    titulo: 'Resultados de aprendizaje del curso',
    // RF-12, p5: cada RAP del proyecto necesita al menos un RAC.
    pendientes: ({ raps, racs }) => {
      const conRac = new Set(racs.flatMap((rac) => rac.idsRap));
      return raps
        .filter((rap) => !conRac.has(rap.id))
        .map((rap) => `${nombreRap(rap)} no tiene RAC asociados.`);
    },
  },
];
