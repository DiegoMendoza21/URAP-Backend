/**
 * Datos institucionales del programa de Administración Industrial: facultad, programa, escala de
 * valoración, RAP y planes de estudio. Salen de los documentos oficiales del programa, resumidos
 * en docs/datos-institucionales.md. Son datos base: se cargan con `npm run db:sembrar` en
 * cualquier ambiente. Lo que el programa todavía no entrega queda en `null`, nunca inventado.
 */

export const FACULTAD = { nombre: 'Facultad de Ciencias Económicas' };

export const PROGRAMA = { nombre: 'Administración Industrial' };

/**
 * RF-07 y docs/glosario-dominio.md: escala de cuatro niveles, logrado desde el nivel 3. El
 * porcentaje esperado no está definido por el programa: sin él, RF-31 presenta el consolidado
 * sin el juicio de cumplimiento.
 */
export const ESCALA = {
  nombre: 'Escala de valoración de los RAP',
  umbral_cumplimiento: 3,
  porcentaje_esperado: null,
  niveles: [
    { valor: 1, etiqueta: 'Principiante' },
    { valor: 2, etiqueta: 'En Desarrollo' },
    { valor: 3, etiqueta: 'Competente' },
    { valor: 4, etiqueta: 'Ejemplar' },
  ],
};

/** RF-05: los siete RAP del programa, con el texto literal de su Matriz de Consistencia. */
export const RAPS = [
  {
    numero: 1,
    descripcion:
      'Comprende, aplica y valora los conceptos matemáticos, estadísticos y el método científico en el ámbito organizacional.',
  },
  {
    numero: 2,
    descripcion:
      'Identifica, interpreta y evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, así como su incidencia en la toma de decisiones gerenciales.',
  },
  {
    numero: 3,
    descripcion:
      'Propone y valora alternativas de mejora en la gestión integral de las organizaciones en los ámbitos local, nacional e internacional.',
  },
  {
    numero: 4,
    descripcion:
      'Comprende, analiza, aplica y evalúa los conceptos, principios, métodos y herramientas de la producción y las operaciones en las organizaciones.',
  },
  {
    numero: 5,
    descripcion:
      'Comprende y aplica los conocimientos del mercadeo y del entorno digital en el desarrollo de estrategias de valor para las organizaciones.',
  },
  {
    numero: 6,
    descripcion:
      'Define, describe y aplica los procesos de la gestión humana, desde una visión integral de las personas, apoyado en la legislación laboral vigente.',
  },
  {
    numero: 7,
    descripcion:
      'Evalúa y aplica técnicas de comunicación asertivas (oral y escrita), así como los conceptos asociados a las ciencias sociales y jurídicas y al desarrollo sostenible, bajo principios y valores éticos.',
  },
].map((rap) => ({ ...rap, codigo: `RAP ${rap.numero}` }));

/** Horas de trabajo por crédito académico (glosario: 2 créditos = 96 horas). */
export const HORAS_POR_CREDITO = 48;

/**
 * Datos del punto 1 del proyecto docente que el programa entregó en sus formatos FO-DO/PC-001
 * (docs/datos-institucionales.md, apartado 4). Son los que el asistente de RF-08 completa en el
 * paso 5, junto con los créditos. Componente y tipo de curso usan los valores del DBML.
 */
export interface FichaAsignatura {
  componente: 'BASICO' | 'PROFESIONAL' | 'COMPLEMENTARIO';
  tipo_curso: 'Obligatorio' | 'Electivo';
  horas_tde: number;
  horas_tdp: number;
  horas_ti: number;
  /** Nombres de las asignaturas del mismo plan que son prerrequisito de esta. */
  prerrequisitos: string[];
}

export interface AsignaturaPlan {
  nombre: string;
  /** Semestre dentro de su plan. */
  semestre: number;
  /** Números de los RAP a los que tributa (mapeo curricular). Vacío si no se conoce. */
  raps: number[];
  /** Código del SMA, cuando el programa lo entregó. Es único dentro del plan. */
  codigo_interno?: string;
  /** Créditos, cuando el programa los entregó. */
  creditos?: number;
  ficha?: FichaAsignatura;
}

/** Un plan de estudios del programa con sus asignaturas (modelo v2.5, RF-04 v1.1). */
export interface PlanEstudioSemilla {
  /** Código del plan en el SMA. */
  codigo: string;
  nombre: string;
  asignaturas: AsignaturaPlan[];
}

const FICHA_COMPORTAMIENTO_ORGANIZACIONAL: FichaAsignatura = {
  componente: 'PROFESIONAL',
  tipo_curso: 'Obligatorio',
  horas_tde: 32,
  horas_tdp: 0,
  horas_ti: 64,
  prerrequisitos: ['Organización y dirección'],
};

/**
 * RF-04 y RF-05: plan 1702, el del informe de evaluación de RAP 2023-II y la matriz de
 * consistencia. 69 asignaturas en 10 semestres y 73 vínculos con los RAP: es el único plan cuyo
 * mapeo a RAP se conoce.
 *
 * Código y créditos salen de la programación académica 2026-1 y de los formatos diligenciados,
 * así que solo se conocen de los semestres IV a X, y no de todas. Los semestres I a III ya no
 * tuvieron grupos del 1702 en 2026-1. Lo que falta (código, créditos, horas, componente, tipo
 * de curso, requisitos) queda en `null` al sembrar. RF-08 p7 ya cubre ese caso: el proyecto
 * docente se crea y queda marcado con información incompleta.
 */
export const PLAN_1702: AsignaturaPlan[] = [
  // Semestre I
  { semestre: 1, nombre: 'Fundamentos de economía', raps: [2] },
  { semestre: 1, nombre: 'Fundamentos de contabilidad', raps: [2] },
  { semestre: 1, nombre: 'Fundamentos de Administración', raps: [3] },
  { semestre: 1, nombre: 'Matemáticas I', raps: [1] },
  { semestre: 1, nombre: 'Comprensión y producción de textos I', raps: [7] },
  { semestre: 1, nombre: 'Cátedra institucional', raps: [7] },
  { semestre: 1, nombre: 'Curso libre I', raps: [7] },
  // Semestre II
  { semestre: 2, nombre: 'Fundamentos de costos', raps: [2] },
  { semestre: 2, nombre: 'Teoría general de la administración', raps: [3] },
  { semestre: 2, nombre: 'Matemáticas II', raps: [1] },
  { semestre: 2, nombre: 'Estadística I', raps: [1] },
  { semestre: 2, nombre: 'Comprensión y producción de textos II', raps: [7] },
  { semestre: 2, nombre: 'Humanidades I', raps: [7] },
  { semestre: 2, nombre: 'Derecho constitucional', raps: [7] },
  // Semestre III
  { semestre: 3, nombre: 'Planeación y control', raps: [3] },
  { semestre: 3, nombre: 'Ética', raps: [7] },
  { semestre: 3, nombre: 'Matemáticas III', raps: [1] },
  { semestre: 3, nombre: 'Estadística II', raps: [1] },
  { semestre: 3, nombre: 'Fundamentos de investigación', raps: [1, 7] },
  { semestre: 3, nombre: 'Humanidades II', raps: [7] },
  { semestre: 3, nombre: 'Curso libre II', raps: [7] },
  // Semestre IV
  { semestre: 4, nombre: 'Microeconomía', raps: [2] },
  { semestre: 4, nombre: 'Organización y dirección', raps: [3, 7] },
  { semestre: 4, nombre: 'Matemática financiera', raps: [2] },
  {
    semestre: 4,
    nombre: 'Lógica y programación',
    raps: [3],
    codigo_interno: 'FP15404',
    creditos: 3,
  },
  { semestre: 4, nombre: 'Investigación aplicada', raps: [1, 7] },
  { semestre: 4, nombre: 'Curso libre III', raps: [7] },
  { semestre: 4, nombre: 'Curso libre IV (Dibujo técnico)', raps: [4] },
  // Semestre V
  { semestre: 5, nombre: 'Macroeconomía', raps: [2] },
  // Solo el código, del formato FO-DO/PC-023 de 2024-1; el resto de la ficha falta.
  {
    semestre: 5,
    nombre: 'Finanzas a corto plazo',
    raps: [2],
    codigo_interno: 'FP15502',
  },
  // El mismo formato que la del plan 2502, salvo el código: es el caso de prueba del modelo.
  {
    semestre: 5,
    nombre: 'Comportamiento organizacional',
    raps: [6],
    codigo_interno: 'FP15503',
    creditos: 2,
    ficha: FICHA_COMPORTAMIENTO_ORGANIZACIONAL,
  },
  { semestre: 5, nombre: 'Química industrial', raps: [4] },
  { semestre: 5, nombre: 'Sistemas de producción', raps: [4] },
  {
    semestre: 5,
    nombre: 'Informática aplicada',
    raps: [3],
    codigo_interno: 'FP15506',
    creditos: 3,
  },
  { semestre: 5, nombre: 'Legislación laboral', raps: [6] },
  { semestre: 5, nombre: 'Curso libre V', raps: [7] },
  // Semestre VI
  {
    semestre: 6,
    nombre: 'Mercados',
    raps: [5],
    codigo_interno: 'FP15601',
    creditos: 3,
  },
  {
    semestre: 6,
    nombre: 'Finanzas y negocios internacionales',
    raps: [2],
    codigo_interno: 'FP15602',
    creditos: 3,
  },
  {
    semestre: 6,
    nombre: 'Administración del talento humano',
    raps: [6],
    codigo_interno: 'FP15603',
    creditos: 3,
  },
  {
    semestre: 6,
    nombre: 'Procesos industriales',
    raps: [4],
    codigo_interno: 'FP15604',
    creditos: 3,
  },
  {
    semestre: 6,
    nombre: 'Estudio del trabajo',
    raps: [4],
    codigo_interno: 'FP15605',
    creditos: 3,
  },
  {
    semestre: 6,
    nombre: 'Procesos de manufactura',
    raps: [4],
    codigo_interno: 'FP15606',
    creditos: 3,
  },
  { semestre: 6, nombre: 'Curso libre VI', raps: [7] },
  // Semestre VII
  {
    semestre: 7,
    nombre: 'Emprendimiento e innovación',
    raps: [5],
    codigo_interno: 'FP17701',
    creditos: 3,
  },
  {
    semestre: 7,
    nombre: 'Investigación de operaciones I',
    raps: [4],
    codigo_interno: 'FP15702',
    creditos: 3,
  },
  {
    semestre: 7,
    nombre: 'Gestión de la cadena de suministros',
    raps: [3],
    codigo_interno: 'FP15703',
    creditos: 2,
  },
  {
    semestre: 7,
    nombre: 'Planeación y organización de la producción',
    raps: [4],
    codigo_interno: 'FP15704',
    creditos: 3,
  },
  {
    semestre: 7,
    nombre: 'Taller de manufactura',
    raps: [4],
    codigo_interno: 'FP15705',
    creditos: 2,
  },
  {
    semestre: 7,
    nombre: 'Seguridad y salud en el trabajo',
    raps: [3, 6],
    codigo_interno: 'FP15712',
    creditos: 2,
  },
  // Semestre VIII. Las electivas (4917xxx) y la práctica (4949920) salen en la programación
  // sin plan; por sus nombres son las del 1702.
  {
    semestre: 8,
    nombre: 'Electiva I (Estudios prospectivos)',
    raps: [3],
    codigo_interno: '4917013',
    creditos: 4,
  },
  {
    semestre: 8,
    nombre: 'Electiva I GPO (Control estadístico de la calidad)',
    raps: [4],
    codigo_interno: '4917014',
    creditos: 4,
  },
  {
    semestre: 8,
    nombre: 'Preparación y evaluación de proyectos',
    raps: [5],
    codigo_interno: 'FP15801',
    creditos: 3,
  },
  {
    semestre: 8,
    nombre: 'Investigación de operaciones II',
    raps: [4],
    codigo_interno: 'FP15802',
    creditos: 3,
  },
  {
    semestre: 8,
    nombre: 'Control de la producción',
    raps: [4],
    codigo_interno: 'FP15803',
    creditos: 3,
  },
  {
    semestre: 8,
    nombre: 'Gestión de la calidad',
    raps: [3],
    codigo_interno: 'FP17801',
    creditos: 3,
  },
  {
    semestre: 8,
    nombre: 'Gestión ambiental',
    raps: [3],
    codigo_interno: 'FP15804',
    creditos: 2,
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      horas_tde: 32,
      horas_tdp: 0,
      horas_ti: 64,
      prerrequisitos: [],
    },
  },
  // Semestre IX. Pendiente de confirmar con el programa: el informe 2023-II trae estas
  // electivas sin número de semestre y se ubicaron en IX por el mapeo curricular.
  {
    semestre: 9,
    nombre: 'Electiva II (Administración de la calidad)',
    raps: [3],
    codigo_interno: '4917021',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva II GPO (Mejoramiento de procesos)',
    raps: [4],
    codigo_interno: '4917022',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva III (Sistemas de información gerencial)',
    raps: [3],
    codigo_interno: '4917023',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva III GPO (Simulación de procesos)',
    raps: [4],
    codigo_interno: '4917204',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva IV (Administración de sueldos y salarios)',
    raps: [6],
    codigo_interno: '4917025',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva IV GPO (Tópicos avanzados de productividad)',
    raps: [4],
    codigo_interno: '4917026',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva V (Gestión logística del comercio internacional)',
    raps: [3],
    codigo_interno: '4917027',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva V GPO (Administración de mantenimiento industrial)',
    raps: [4],
    codigo_interno: '4917028',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva VI (Sistemas para la gestión de recursos empresariales)',
    raps: [3],
    codigo_interno: '4917029',
    creditos: 4,
  },
  {
    semestre: 9,
    nombre: 'Electiva VI GPO (Diseño de planta)',
    raps: [4],
    codigo_interno: '4917010',
    creditos: 4,
  },
  // Semestre X
  {
    semestre: 10,
    nombre: 'Electiva VII (Sistemas integrados de gestión)',
    raps: [3],
    codigo_interno: '4917011',
    creditos: 4,
  },
  {
    semestre: 10,
    nombre: 'Electiva VII GPO (Diseño de producto)',
    raps: [4],
    codigo_interno: '4917012',
    creditos: 4,
  },
  {
    semestre: 10,
    nombre: 'Prácticas profesionales',
    raps: [7],
    codigo_interno: '4949920',
    creditos: 8,
  },
];

/** Asignatura del plan 2502 de la que se conocen código y créditos, sin mapeo a RAP. */
function delPlan2502(
  semestre: number,
  codigo_interno: string,
  nombre: string,
  creditos: number,
): AsignaturaPlan {
  return { semestre, codigo_interno, nombre, creditos, raps: [] };
}

/**
 * RF-04: plan 2502, tal como lo muestra la programación académica 2026-1. Solo semestres 1 a 5,
 * porque su primera cohorte todavía no llega al 6: 36 asignaturas con código y créditos.
 *
 * Sin mapeo a RAP: el programa todavía no lo entrega, así que sus asignaturas no tienen filas en
 * `asignatura_rap` y el asistente de RF-08 deja elegir entre todos los RAP del programa. Que el
 * 2502 use los mismos RAP 1 a 7 es un supuesto (SUP-16). Las horas TDE, TDP y TI solo se
 * conocen de las tres asignaturas con formato diligenciado.
 */
export const PLAN_2502: AsignaturaPlan[] = [
  // Semestre 1
  delPlan2502(1, 'FN23003', 'Inglés I', 2),
  delPlan2502(1, 'FN72726', 'Cátedra institucional', 2),
  delPlan2502(1, 'FN72727', 'Producción y comprensión textual I', 2),
  delPlan2502(1, 'NC2501', 'Matemática I', 4),
  {
    ...delPlan2502(1, 'NC2507', 'Fundamentos de administración', 3),
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      prerrequisitos: [],
    },
  },
  delPlan2502(1, 'NC2508', 'Fundamentos de contabilidad', 3),
  delPlan2502(1, 'NC2509', 'Fundamentos de economía', 3),
  // Semestre 2
  delPlan2502(2, 'FN24033', 'Inglés II', 2),
  delPlan2502(2, 'FN24047', 'Humanidades', 2),
  delPlan2502(2, 'FN72732', 'Producción y comprensión textual II', 2),
  delPlan2502(2, 'IX24100', 'Costos', 2),
  delPlan2502(2, 'IX24165', 'Teoría general de la administración', 3),
  delPlan2502(2, 'NC2502', 'Matemática II', 4),
  delPlan2502(2, 'NC2503', 'Estadística I', 3),
  delPlan2502(2, 'NC2506', 'Derecho constitucional', 2),
  // Semestre 3
  delPlan2502(3, 'CFBD294', 'Matemáticas III', 4),
  delPlan2502(3, 'FN24035', 'Inglés III', 2),
  delPlan2502(3, 'FN72725', 'Ética', 2),
  delPlan2502(3, 'IX24182', 'Planeación y control', 3),
  delPlan2502(3, 'IX25263', 'Desarrollo del espíritu emprendedor', 2),
  delPlan2502(3, 'NC2504', 'Estadística II', 3),
  // El formato llama a su prerrequisito «Comprensión y producción de textos II»: en el 2502
  // esa asignatura es Producción y comprensión textual II (FN72732).
  {
    ...delPlan2502(3, 'NC2505', 'Fundamentos de investigación científica', 3),
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      prerrequisitos: ['Producción y comprensión textual II'],
    },
  },
  // Semestre 4
  delPlan2502(4, 'CFBD297', 'Investigación aplicada', 3),
  delPlan2502(4, 'FN24036', 'Inglés IV', 2),
  delPlan2502(4, 'IX24184', 'Organización y dirección', 3),
  delPlan2502(4, 'IX24185', 'Matemática financiera', 3),
  delPlan2502(4, 'IX24186', 'Analítica de datos I', 3),
  delPlan2502(4, 'IX24187', 'Dibujo técnico - expresión gráfica', 2),
  delPlan2502(4, 'NC2510', 'Microeconomía I', 3),
  // Semestre 5
  delPlan2502(5, 'FN24037', 'Inglés V', 2),
  delPlan2502(5, 'IX24188', 'Química industrial', 3),
  delPlan2502(5, 'IX24189', 'Finanzas a corto plazo', 3),
  delPlan2502(5, 'IX24190', 'Analítica de datos II', 3),
  delPlan2502(5, 'IX24191', 'Sistema de producción', 2),
  delPlan2502(5, 'IX24192', 'Macroeconomía', 2),
  // El mismo formato que la del plan 1702, salvo el código.
  {
    ...delPlan2502(5, 'IX24193', 'Comportamiento organizacional', 2),
    ficha: FICHA_COMPORTAMIENTO_ORGANIZACIONAL,
  },
];

/**
 * Los dos planes vigentes del programa en 2026-1 (docs/datos-institucionales.md, apartado 4).
 * Los dos quedan «vigente»: la regla de transición entre ellos todavía no la entrega el programa.
 */
export const PLANES_DE_ESTUDIO: PlanEstudioSemilla[] = [
  { codigo: '1702', nombre: 'Plan de estudios 1702', asignaturas: PLAN_1702 },
  { codigo: '2502', nombre: 'Plan de estudios 2502', asignaturas: PLAN_2502 },
];

/** Un indicador de desempeño con el descriptor de cada nivel de la escala. */
export interface IndicadorRubrica {
  numero: number;
  descripcion: string;
  /** Descriptor por valor del nivel de la escala (1 a 4). */
  descriptores: { nivel: number; descripcion: string }[];
}

export interface RubricaSemilla {
  rap: number;
  version: number;
  indicadores: IndicadorRubrica[];
}

/**
 * Adverbio de frecuencia de cada nivel en los descriptores de la rúbrica oficial: 1 Principiante,
 * 2 En Desarrollo, 3 Competente y 4 Ejemplar.
 */
export const ADVERBIOS_POR_NIVEL = [
  { nivel: 1, adverbio: 'No' },
  { nivel: 2, adverbio: 'Raras veces' },
  { nivel: 3, adverbio: 'Frecuentemente' },
  { nivel: 4, adverbio: 'Siempre' },
];

/**
 * Regla de la rúbrica oficial: el descriptor es el adverbio del nivel seguido del texto del
 * indicador con la primera letra en minúscula («Raras veces identifica las variables…»).
 */
export function descriptoresOficiales(
  indicador: string,
): IndicadorRubrica['descriptores'] {
  const texto = indicador.charAt(0).toLowerCase() + indicador.slice(1);
  return ADVERBIOS_POR_NIVEL.map(({ nivel, adverbio }) => ({
    nivel,
    descripcion: `${adverbio} ${texto}`,
  }));
}

/**
 * RF-06: rúbrica real del RAP 2, versión 1 y vigente. Es la del formato FO-DO/PC-023 con que se
 * midió el RAP 2 en Finanzas a corto plazo en 2024-1.
 */
export const RUBRICA_RAP_2: RubricaSemilla = {
  rap: 2,
  version: 1,
  indicadores: [
    'Identifica las variables del entorno económico y financiero de las organizaciones',
    'Interpreta las variables del entorno económico y financiero que inciden en las organizaciones',
    'Aplica principios económicos y financieros para la definición de alternativas que contribuyan a la toma de decisiones gerenciales en las organizaciones',
    'Evalúa el entorno económico y financiero de las organizaciones a nivel local, nacional e internacional, a partir de las variables identificadas',
  ].map((descripcion, i) => ({
    numero: i + 1,
    descripcion,
    descriptores: descriptoresOficiales(descripcion),
  })),
};
