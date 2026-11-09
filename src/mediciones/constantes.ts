/**
 * Valores fijos de la medición de RAP (RF-30 a RF-32). Son enumerados del formato
 * FO-DO/PC-023 que el DBML v2.5 guarda como `varchar` con sus valores en un comentario. Los
 * niveles de la escala, el umbral de cumplimiento y el porcentaje esperado NO van aquí: son
 * del programa (`escala_valoracion`, `nivel_escala`) y se leen de la base.
 */

/** `medicion_rap.estado` (DBML v2.5: «borrador | cerrada»). */
export const ESTADO_MEDICION = {
  borrador: 'borrador',
  cerrada: 'cerrada',
} as const;

export type EstadoMedicion =
  (typeof ESTADO_MEDICION)[keyof typeof ESTADO_MEDICION];

/** `medicion_rap.tipo_valoracion` (DBML v2.5: «formativa | sumativa»). */
export const TIPO_VALORACION = {
  formativa: 'formativa',
  sumativa: 'sumativa',
} as const;

export type TipoValoracion =
  (typeof TIPO_VALORACION)[keyof typeof TIPO_VALORACION];

/** `medicion_rap.periodo_toma` (DBML v2.5: «primer | segundo»). */
export const PERIODO_TOMA = {
  primer: 'primer',
  segundo: 'segundo',
} as const;

export type PeriodoToma = (typeof PERIODO_TOMA)[keyof typeof PERIODO_TOMA];

/** `rubrica.estado` con el que una rúbrica se puede usar para medir (RF-06). */
export const ESTADO_RUBRICA_VIGENTE = 'vigente';

/**
 * Estados del proyecto docente en los que ya fue aprobado por el departamento académico
 * (precondición de RF-30). La aprobación es de EP-07 (RF-17, RF-18); en ejecución es
 * posterior a ella. «Cerrado» queda fuera: el período terminó y RF-17 bloquea los registros.
 */
export const ESTADOS_PROYECTO_APROBADO = ['aprobado', 'en_ejecucion'] as const;

/** Años admitidos para la toma de datos: evita errores de digitación como 226 o 20026. */
export const ANIO_TOMA_MINIMO = 2000;
export const ANIO_TOMA_MAXIMO = 2100;

/** Largo de `medicion_indicador.instrumento` (varchar(255)). */
export const INSTRUMENTO_LONGITUD_MAXIMA = 255;
/** Largo razonable de las descripciones de texto libre: una o dos páginas. */
export const TEXTO_LARGO_MAXIMO = 4000;

/**
 * Celdas que admite un guardado de valoraciones. Un curso de 40 estudiantes con 4
 * indicadores son 160; el margen deja guardar cursos grandes sin abrir la puerta a cargas
 * desmedidas (RF-30, q2).
 */
export const VALORACIONES_POR_GUARDADO_MAXIMO = 1000;

export const MENSAJE_PROYECTO_NO_EXISTE =
  'El proyecto docente no existe o no tiene acceso a él.';
export const MENSAJE_MEDICION_NO_EXISTE =
  'La medición no existe o no tiene acceso a ella.';
export const MENSAJE_SOLO_DOCENTE_ASIGNADO =
  'Solo el docente asignado al curso registra la medición de RAP.';
export const MENSAJE_PERIODO_CERRADO =
  'El período académico del curso está cerrado: ya no se pueden iniciar mediciones en él.';
export const MENSAJE_PROYECTO_NO_APROBADO =
  'El proyecto docente todavía no está aprobado. La medición de RAP se registra cuando el departamento académico lo aprueba.';
export const MENSAJE_SIN_LISTA =
  'Este curso todavía no tiene la lista de estudiantes matriculados. Pídale al administrador de URAP que la cargue en «Estudiantes matriculados» del proyecto docente, indicando la asignatura, el grupo y el período.';
export const MENSAJE_RAP_NO_DEL_PROYECTO =
  'El RAP seleccionado no es uno de los RAP a los que contribuye este curso.';
export const MENSAJE_SIN_RUBRICA =
  'El RAP seleccionado no tiene una rúbrica vigente. Antes de medirlo, el programa debe registrar su rúbrica (RF-06).';
export const MENSAJE_SIN_ESCALA =
  'El programa no tiene una escala de valoración de RAP. El administrador debe registrarla antes de medir (RF-07).';
export const MENSAJE_MEDICION_EXISTENTE =
  'Ya existe una medición de este RAP con el mismo tipo de valoración y año en el curso. Ábrala para continuarla.';
export const MENSAJE_MEDICION_CERRADA =
  'La medición está cerrada: sus valoraciones ya no se pueden modificar. Solo el departamento académico puede reabrirla.';
export const MENSAJE_INDICADOR_NO_DE_MEDICION =
  'Uno de los indicadores no pertenece a la rúbrica de esta medición.';
export const MENSAJE_ESTUDIANTE_NO_DEL_CURSO =
  'Uno de los estudiantes no está matriculado en este curso.';
export const MENSAJE_NIVEL_INVALIDO =
  'Uno de los niveles no existe en la escala de valoración del programa.';
export const MENSAJE_CELDA_REPETIDA =
  'Un estudiante aparece dos veces en el mismo indicador.';
export const MENSAJE_SOLO_DOCENTE_O_LIDER =
  'Solo el docente asignado al curso o el líder del RAP registran el análisis y cierran la medición.';
export const MENSAJE_SIN_VALORACIONES =
  'La medición no tiene valoraciones registradas: valore a los estudiantes antes de cerrarla.';
export const MENSAJE_FALTAN_ACCIONES_PROPUESTAS =
  'El resultado está por debajo del porcentaje esperado: registre las acciones propuestas antes de cerrar la medición.';
export const MENSAJE_SOLO_DEPARTAMENTO_REABRE =
  'Solo el departamento académico del programa puede reabrir una medición cerrada.';
export const MENSAJE_MEDICION_NO_CERRADA =
  'La medición no está cerrada: no hay nada que reabrir.';
