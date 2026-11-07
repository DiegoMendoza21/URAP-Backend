/**
 * Datos institucionales del programa de Administración Industrial: facultad, programa, escala de
 * valoración, RAP y plan de estudios. Salen de los documentos oficiales del programa, resumidos
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
 * paso 5. Componente y tipo de curso usan los valores del DBML.
 */
export interface FichaAsignatura {
  componente: 'BASICO' | 'PROFESIONAL' | 'COMPLEMENTARIO';
  tipo_curso: 'Obligatorio' | 'Electivo';
  creditos: number;
  horas_tde: number;
  horas_tdp: number;
  horas_ti: number;
  /** Nombres de las asignaturas del plan que son prerrequisito de esta. */
  prerrequisitos: string[];
}

export interface AsignaturaPlan {
  nombre: string;
  semestre: number;
  /** Números de los RAP a los que tributa (mapeo curricular). */
  raps: number[];
  /** Código del SMA, cuando el programa lo entregó. */
  codigo_interno?: string;
  ficha?: FichaAsignatura;
}

/**
 * RF-04 y RF-05: plan de estudios, 69 asignaturas en 10 semestres y 73 vínculos con los RAP,
 * como el informe de evaluación de RAP 2023-II.
 *
 * Solo cuatro asignaturas traen la ficha completa y Finanzas a corto plazo trae su código. De
 * las demás el programa todavía no entrega el código SMA, los créditos, las horas TDE, TDP y TI,
 * el componente, el tipo de curso ni los requisitos: quedan en `null` al sembrar. RF-08 p7 ya
 * cubre ese caso: el proyecto docente se crea y queda marcado con información incompleta.
 */
export const PLAN_DE_ESTUDIOS: AsignaturaPlan[] = [
  // Semestre I
  { semestre: 1, nombre: 'Fundamentos de economía', raps: [2] },
  { semestre: 1, nombre: 'Fundamentos de contabilidad', raps: [2] },
  {
    semestre: 1,
    nombre: 'Fundamentos de Administración',
    raps: [3],
    codigo_interno: 'NC2507',
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      creditos: 3,
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      prerrequisitos: [],
    },
  },
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
  // El formato FO-DO/PC-001 la llama «Fundamentos de investigación científica». Encaja con el
  // mapeo por semestre y prerrequisito, pero falta confirmarlo con el programa: se conserva el
  // nombre del mapeo curricular.
  {
    semestre: 3,
    nombre: 'Fundamentos de investigación',
    raps: [1, 7],
    codigo_interno: 'NC2505',
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      creditos: 3,
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      prerrequisitos: ['Comprensión y producción de textos II'],
    },
  },
  { semestre: 3, nombre: 'Humanidades II', raps: [7] },
  { semestre: 3, nombre: 'Curso libre II', raps: [7] },
  // Semestre IV
  { semestre: 4, nombre: 'Microeconomía', raps: [2] },
  { semestre: 4, nombre: 'Organización y dirección', raps: [3, 7] },
  { semestre: 4, nombre: 'Matemática financiera', raps: [2] },
  { semestre: 4, nombre: 'Lógica y programación', raps: [3] },
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
  // Sin código: aparece como FP15503 y como IX24193 en dos formatos del programa, y está
  // preguntado cuál es el vigente. El resto de la ficha sí es seguro.
  {
    semestre: 5,
    nombre: 'Comportamiento organizacional',
    raps: [6],
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      creditos: 2,
      horas_tde: 32,
      horas_tdp: 0,
      horas_ti: 64,
      prerrequisitos: ['Organización y dirección'],
    },
  },
  { semestre: 5, nombre: 'Química industrial', raps: [4] },
  { semestre: 5, nombre: 'Sistemas de producción', raps: [4] },
  { semestre: 5, nombre: 'Informática aplicada', raps: [3] },
  { semestre: 5, nombre: 'Legislación laboral', raps: [6] },
  { semestre: 5, nombre: 'Curso libre V', raps: [7] },
  // Semestre VI
  { semestre: 6, nombre: 'Mercados', raps: [5] },
  { semestre: 6, nombre: 'Finanzas y negocios internacionales', raps: [2] },
  { semestre: 6, nombre: 'Administración del talento humano', raps: [6] },
  { semestre: 6, nombre: 'Procesos industriales', raps: [4] },
  { semestre: 6, nombre: 'Estudio del trabajo', raps: [4] },
  { semestre: 6, nombre: 'Procesos de manufactura', raps: [4] },
  { semestre: 6, nombre: 'Curso libre VI', raps: [7] },
  // Semestre VII
  { semestre: 7, nombre: 'Emprendimiento e innovación', raps: [5] },
  { semestre: 7, nombre: 'Investigación de operaciones I', raps: [4] },
  { semestre: 7, nombre: 'Gestión de la cadena de suministros', raps: [3] },
  {
    semestre: 7,
    nombre: 'Planeación y organización de la producción',
    raps: [4],
  },
  { semestre: 7, nombre: 'Taller de manufactura', raps: [4] },
  { semestre: 7, nombre: 'Seguridad y salud en el trabajo', raps: [3, 6] },
  // Semestre VIII
  { semestre: 8, nombre: 'Electiva I (Estudios prospectivos)', raps: [3] },
  {
    semestre: 8,
    nombre: 'Electiva I GPO (Control estadístico de la calidad)',
    raps: [4],
  },
  { semestre: 8, nombre: 'Preparación y evaluación de proyectos', raps: [5] },
  { semestre: 8, nombre: 'Investigación de operaciones II', raps: [4] },
  { semestre: 8, nombre: 'Control de la producción', raps: [4] },
  { semestre: 8, nombre: 'Gestión de la calidad', raps: [3] },
  {
    semestre: 8,
    nombre: 'Gestión ambiental',
    raps: [3],
    codigo_interno: 'FP15804',
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      creditos: 2,
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
  },
  {
    semestre: 9,
    nombre: 'Electiva II GPO (Mejoramiento de procesos)',
    raps: [4],
  },
  {
    semestre: 9,
    nombre: 'Electiva III (Sistemas de información gerencial)',
    raps: [3],
  },
  {
    semestre: 9,
    nombre: 'Electiva III GPO (Simulación de procesos)',
    raps: [4],
  },
  {
    semestre: 9,
    nombre: 'Electiva IV (Administración de sueldos y salarios)',
    raps: [6],
  },
  {
    semestre: 9,
    nombre: 'Electiva IV GPO (Tópicos avanzados de productividad)',
    raps: [4],
  },
  {
    semestre: 9,
    nombre: 'Electiva V (Gestión logística del comercio internacional)',
    raps: [3],
  },
  {
    semestre: 9,
    nombre: 'Electiva V GPO (Administración de mantenimiento industrial)',
    raps: [4],
  },
  {
    semestre: 9,
    nombre: 'Electiva VI (Sistemas para la gestión de recursos empresariales)',
    raps: [3],
  },
  { semestre: 9, nombre: 'Electiva VI GPO (Diseño de planta)', raps: [4] },
  // Semestre X
  {
    semestre: 10,
    nombre: 'Electiva VII (Sistemas integrados de gestión)',
    raps: [3],
  },
  { semestre: 10, nombre: 'Electiva VII GPO (Diseño de producto)', raps: [4] },
  { semestre: 10, nombre: 'Prácticas profesionales', raps: [7] },
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
