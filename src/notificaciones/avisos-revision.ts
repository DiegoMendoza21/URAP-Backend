import { NOTIFICACION } from './notificaciones.service.js';

/**
 * Textos de los avisos de la revisión del proyecto docente (RF-17, RF-18, HU-13-03). Los usan
 * la revisión y los datos de demostración, para que la demo muestre los mismos avisos que deja
 * el sistema. `curso` es «asignatura, grupo X (período)».
 */
export interface AvisoRevision {
  tipo: string;
  titulo: string;
  mensaje: string;
  urlDestino: string;
}

/** «Asignatura, grupo A (2026-2)»: cómo nombran el curso los avisos de la revisión. */
export function cursoDelAviso(
  asignatura: string | null | undefined,
  grupo: string | null | undefined,
  periodo: string | null | undefined,
): string {
  return `${asignatura ?? 'sin asignatura'}${grupo ? `, grupo ${grupo}` : ''}${periodo ? ` (${periodo})` : ''}`;
}

/** A quienes revisan en el programa. */
export function avisoEnviado(curso: string, id: number): AvisoRevision {
  return {
    tipo: NOTIFICACION.proyectoEnviado,
    titulo: 'Proyecto docente enviado a revisión',
    mensaje: `El proyecto docente de ${curso} fue enviado a revisión y espera su revisión.`,
    urlDestino: `/proyectos-docentes/${id}/revision`,
  };
}

/** A los docentes del proyecto. */
export function avisoAprobado(curso: string, id: number): AvisoRevision {
  return {
    tipo: NOTIFICACION.proyectoAprobado,
    titulo: 'Proyecto docente aprobado',
    mensaje: `El departamento académico aprobó el proyecto docente de ${curso}. Ya puede registrar sus clases.`,
    urlDestino: `/proyectos-docentes/${id}`,
  };
}

/** A los docentes del proyecto. Lleva al diligenciamiento, donde están las observaciones. */
export function avisoDevuelto(
  curso: string,
  id: number,
  observaciones: number,
): AvisoRevision {
  return {
    tipo: NOTIFICACION.proyectoDevuelto,
    titulo: 'Proyecto docente devuelto con observaciones',
    mensaje: `El departamento académico devolvió el proyecto docente de ${curso} con ${observaciones === 1 ? 'una observación' : `${observaciones} observaciones`}. Revíselas en cada sección y vuelva a enviarlo.`,
    urlDestino: `/proyectos-docentes/${id}/diligenciar`,
  };
}
