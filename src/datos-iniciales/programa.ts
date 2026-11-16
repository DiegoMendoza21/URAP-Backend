/**
 * Datos institucionales del programa de Administración Industrial: facultad, programa, escala de
 * valoración, RAP y planes de estudio. Salen de los documentos oficiales del programa, resumidos
 * en docs/datos-institucionales.md. Son datos base: se cargan con `npm run db:sembrar` en
 * cualquier ambiente. Lo que el programa todavía no entrega queda en `null`, nunca inventado.
 */

export const FACULTAD = { nombre: 'Facultad de Ciencias Económicas' };

export const PROGRAMA = { nombre: 'Administración Industrial' };

/**
 * RF-07 y docs/glosario-dominio.md: escala de cuatro niveles, logrado desde el nivel 3.
 *
 * La meta es 60 %, la misma para los siete RAP: el PEP 2025 (Tabla 18) fija para cada uno
 * «Nota cuantitativa promedio superior a 3.0 o 60%» (docs/datos-institucionales.md, apartado 3).
 * Se compara con el porcentaje de valoraciones en nivel 3 o 4. Cada medición copia la meta al
 * crearse, así que cambiarla después no reescribe las mediciones pasadas.
 */
export const ESCALA: {
  nombre: string;
  umbral_cumplimiento: number;
  porcentaje_esperado: number | null;
  niveles: { valor: number; etiqueta: string }[];
} = {
  nombre: 'Escala de valoración de los RAP',
  umbral_cumplimiento: 3,
  porcentaje_esperado: 60,
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

/** Horas TDE, TDP y TI de una asignatura. */
export interface HorasAsignatura {
  horas_tde: number;
  horas_tdp: number;
  horas_ti: number;
}

/**
 * Horas de una asignatura (docs/datos-institucionales.md, «Horas de las asignaturas»).
 *
 * - **Con ficha:** las de su formato diligenciado.
 * - **Sin ficha:** la regla del programa, TDE = 16 × créditos, TDP = 0 y TI = 2 × (TDE + TDP),
 *   es decir, 32 × créditos. TDP es 0 en la asignatura; las horas prácticas se fijan, si acaso,
 *   en el proyecto docente.
 * - **Sin créditos:** nada, porque no hay de dónde sacarlas. El proyecto docente de esa
 *   asignatura sale con información incompleta (RF-08 p7).
 */
export function horasDeLaAsignatura({
  creditos,
  ficha,
}: Pick<AsignaturaPlan, 'creditos' | 'ficha'>): HorasAsignatura | null {
  if (ficha) {
    const { horas_tde, horas_tdp, horas_ti } = ficha;
    return { horas_tde, horas_tdp, horas_ti };
  }
  if (creditos === undefined) {
    return null;
  }
  const horas_tde = 16 * creditos;
  const horas_tdp = 0;
  return { horas_tde, horas_tdp, horas_ti: 2 * (horas_tde + horas_tdp) };
}

/** Los tres valores de `asignatura.componente` (DBML). El básico es uno solo. */
export type ComponenteAsignatura = 'BASICO' | 'PROFESIONAL' | 'COMPLEMENTARIO';

export type TipoCurso = 'Obligatorio' | 'Electivo';

/**
 * Datos del punto 1 del proyecto docente que el programa entregó en sus formatos FO-DO/PC-001
 * (docs/datos-institucionales.md, apartado 4). Son los que el asistente de RF-08 completa en el
 * paso 5, junto con los créditos. Componente y tipo de curso usan los valores del DBML.
 */
export interface FichaAsignatura {
  componente: ComponenteAsignatura;
  tipo_curso: TipoCurso;
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
  /**
   * Componente y tipo de curso de una asignatura sin ficha: se conocen por el plan de estudios
   * público, que no trae las horas. Con `ficha`, los dos datos van en ella y estos se omiten.
   */
  componente?: ComponenteAsignatura;
  tipo_curso?: TipoCurso;
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

/**
 * Asignatura del plan 2502, con su código, sus créditos y sus RAP. Las horas no se escriben: salen
 * de la regla del programa (`horasDeLaAsignatura`).
 */
function delPlan2502(
  semestre: number,
  codigo_interno: string,
  nombre: string,
  creditos: number,
  raps: number[],
  componente?: ComponenteAsignatura,
  tipo_curso?: TipoCurso,
): AsignaturaPlan {
  return {
    semestre,
    codigo_interno,
    nombre,
    creditos,
    raps,
    ...(componente && { componente }),
    ...(tipo_curso && { tipo_curso }),
  };
}

/** Una electiva del plan 2502: 3 créditos, componente profesional y tipo de curso «Electivo». */
function electiva2502(
  semestre: number,
  codigo_interno: string,
  nombre: string,
  raps: number[],
): AsignaturaPlan {
  return delPlan2502(
    semestre,
    codigo_interno,
    nombre,
    3,
    raps,
    'PROFESIONAL',
    'Electivo',
  );
}

/**
 * RF-04 y RF-05: plan 2502 completo, 74 asignaturas en diez semestres, con código, créditos,
 * componente y su mapeo a los RAP (docs/datos-institucionales.md, apartado 4). Por semestre son
 * 19, 20, 19, 19, 19, 20, 19, 22, 30 y 16 créditos: 203, contando las dos líneas de cada
 * electiva.
 *
 * - **Fuentes:** semestre, código y créditos son de la malla del SMA. Los nombres de los
 *   semestres 1 a 5 son los de la programación 2026-1, y los de las electivas, Formación humana
 *   y la práctica, del PEP 2025. El componente es el del plan de estudios público, confirmado por
 *   el PEP.
 * - **Mapeo a RAP:** es el de la Tabla 19 del PEP 2025, con los mismos siete RAP del programa
 *   (SUP-16 confirmado): 78 vínculos, cuatro asignaturas con dos RAP.
 * - **Electivas:** GA es la línea de Gestión Administrativa y GPO la de Gestión de la Producción
 *   y Operaciones. Van con el formato de las del 1702 y el tipo de curso «Electivo».
 * - **Formación humana I a IV:** entre FC72737 y FC72738 ningún documento dice cuál es la II; se
 *   toma el orden de los códigos.
 * - **La Electiva VIII es la práctica:** dos códigos, uno por línea, en el componente
 *   complementario. Su tipo de curso es el de la práctica del 1702, que no lo tiene registrado.
 * - **Horas:** salen de la regla del programa (`horasDeLaAsignatura`). Los prerrequisitos no se
 *   conocen, salvo el de la ficha de NC2505.
 */
export const PLAN_2502: AsignaturaPlan[] = [
  // Semestre 1
  delPlan2502(1, 'FN23003', 'Inglés I', 2, [7], 'BASICO'),
  delPlan2502(1, 'FN72726', 'Cátedra institucional', 2, [7], 'BASICO'),
  delPlan2502(
    1,
    'FN72727',
    'Producción y comprensión textual I',
    2,
    [7],
    'BASICO',
  ),
  delPlan2502(1, 'NC2501', 'Matemática I', 4, [1], 'BASICO'),
  {
    ...delPlan2502(1, 'NC2507', 'Fundamentos de administración', 3, [3]),
    ficha: {
      componente: 'PROFESIONAL',
      tipo_curso: 'Obligatorio',
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      prerrequisitos: [],
    },
  },
  delPlan2502(
    1,
    'NC2508',
    'Fundamentos de contabilidad',
    3,
    [2],
    'PROFESIONAL',
  ),
  delPlan2502(1, 'NC2509', 'Fundamentos de economía', 3, [2], 'PROFESIONAL'),
  // Semestre 2
  delPlan2502(2, 'FN24033', 'Inglés II', 2, [7], 'BASICO'),
  delPlan2502(2, 'FN24047', 'Humanidades', 2, [7], 'BASICO'),
  delPlan2502(
    2,
    'FN72732',
    'Producción y comprensión textual II',
    2,
    [7],
    'BASICO',
  ),
  delPlan2502(2, 'IX24100', 'Costos', 2, [2], 'PROFESIONAL'),
  delPlan2502(
    2,
    'IX24165',
    'Teoría general de la administración',
    3,
    [3],
    'PROFESIONAL',
  ),
  delPlan2502(2, 'NC2502', 'Matemática II', 4, [1], 'BASICO'),
  delPlan2502(2, 'NC2503', 'Estadística I', 3, [1], 'BASICO'),
  delPlan2502(2, 'NC2506', 'Derecho constitucional', 2, [7], 'BASICO'),
  // Semestre 3
  delPlan2502(3, 'CFBD294', 'Matemáticas III', 4, [1], 'BASICO'),
  delPlan2502(3, 'FN24035', 'Inglés III', 2, [7], 'BASICO'),
  delPlan2502(3, 'FN72725', 'Ética', 2, [7], 'BASICO'),
  delPlan2502(3, 'IX24182', 'Planeación y control', 3, [3], 'PROFESIONAL'),
  delPlan2502(
    3,
    'IX25263',
    'Desarrollo del espíritu emprendedor',
    2,
    [7],
    'BASICO',
  ),
  delPlan2502(3, 'NC2504', 'Estadística II', 3, [1], 'BASICO'),
  {
    ...delPlan2502(
      3,
      'NC2505',
      'Fundamentos de investigación científica',
      3,
      [1, 7],
    ),
    ficha: {
      // El formato diligenciado dice «Profesional»; prevalece el PEP 2025 (Tablas 20 y 28):
      // formación básica disciplinar.
      componente: 'BASICO',
      tipo_curso: 'Obligatorio',
      horas_tde: 48,
      horas_tdp: 0,
      horas_ti: 96,
      // El formato llama a su prerrequisito «Comprensión y producción de textos II»: en el 2502
      // esa asignatura es Producción y comprensión textual II (FN72732).
      prerrequisitos: ['Producción y comprensión textual II'],
    },
  },
  // Semestre 4
  delPlan2502(4, 'CFBD297', 'Investigación aplicada', 3, [1, 7], 'BASICO'),
  delPlan2502(4, 'FN24036', 'Inglés IV', 2, [7], 'BASICO'),
  delPlan2502(
    4,
    'IX24184',
    'Organización y dirección',
    3,
    [3, 7],
    'PROFESIONAL',
  ),
  delPlan2502(4, 'IX24185', 'Matemática financiera', 3, [2], 'PROFESIONAL'),
  delPlan2502(4, 'IX24186', 'Analítica de datos I', 3, [5], 'PROFESIONAL'),
  delPlan2502(
    4,
    'IX24187',
    'Dibujo técnico - expresión gráfica',
    2,
    [4],
    'PROFESIONAL',
  ),
  delPlan2502(4, 'NC2510', 'Microeconomía I', 3, [2], 'PROFESIONAL'),
  // Semestre 5
  delPlan2502(5, 'FN24037', 'Inglés V', 2, [7], 'BASICO'),
  delPlan2502(5, 'IX24188', 'Química industrial', 3, [4], 'PROFESIONAL'),
  delPlan2502(5, 'IX24189', 'Finanzas a corto plazo', 3, [2], 'PROFESIONAL'),
  delPlan2502(5, 'IX24190', 'Analítica de datos II', 3, [5], 'PROFESIONAL'),
  delPlan2502(5, 'IX24191', 'Sistema de producción', 2, [4], 'PROFESIONAL'),
  delPlan2502(5, 'IX24192', 'Macroeconomía', 2, [2], 'PROFESIONAL'),
  {
    ...delPlan2502(5, 'IX24193', 'Comportamiento organizacional', 2, [6]),
    // El mismo formato que la del plan 1702, salvo el código.
    ficha: FICHA_COMPORTAMIENTO_ORGANIZACIONAL,
  },
  delPlan2502(5, 'FC72731', 'Formación humana I', 2, [7], 'COMPLEMENTARIO'),
  // Semestre 6
  delPlan2502(6, 'IX24194', 'Procesos de manufactura', 4, [4], 'PROFESIONAL'),
  delPlan2502(6, 'IX24195', 'Estudio del trabajo', 3, [4], 'PROFESIONAL'),
  delPlan2502(
    6,
    'IX24197',
    'Finanzas y negocios internacionales',
    3,
    [2],
    'PROFESIONAL',
  ),
  delPlan2502(6, 'IX24198', 'Mercados', 3, [5], 'PROFESIONAL'),
  delPlan2502(6, 'IX24199', 'Procesos industriales', 3, [4], 'PROFESIONAL'),
  delPlan2502(6, 'IX24200', 'Legislación laboral', 2, [6], 'PROFESIONAL'),
  delPlan2502(6, 'FN24038', 'Inglés VI', 2, [7], 'BASICO'),
  // Semestre 7
  delPlan2502(
    7,
    'IX24201',
    'Emprendimiento e innovación',
    3,
    [5],
    'PROFESIONAL',
  ),
  delPlan2502(
    7,
    'IX24202',
    'Planeación y organización de la producción',
    3,
    [4],
    'PROFESIONAL',
  ),
  delPlan2502(
    7,
    'IX24203',
    'Investigación de operaciones I',
    3,
    [4],
    'PROFESIONAL',
  ),
  delPlan2502(
    7,
    'IX24204',
    'Gestión del talento humano',
    2,
    [6],
    'PROFESIONAL',
  ),
  delPlan2502(
    7,
    'IX24205',
    'Gestión de la cadena de suministro',
    2,
    [3],
    'PROFESIONAL',
  ),
  delPlan2502(
    7,
    'IX24206',
    'Seguridad y salud en el trabajo',
    2,
    [3, 6],
    'PROFESIONAL',
  ),
  delPlan2502(7, 'FC72737', 'Formación humana II', 2, [7], 'COMPLEMENTARIO'),
  delPlan2502(7, 'FC72738', 'Formación humana III', 2, [7], 'COMPLEMENTARIO'),
  // Semestre 8
  delPlan2502(8, 'IX24222', 'Gestión de la calidad', 3, [3], 'PROFESIONAL'),
  delPlan2502(8, 'IX24224', 'Control de la producción', 3, [4], 'PROFESIONAL'),
  delPlan2502(
    8,
    'IX24225',
    'Formulación, gestión y evaluación de proyectos',
    3,
    [5],
    'PROFESIONAL',
  ),
  delPlan2502(
    8,
    'IX24226',
    'Investigación de operaciones II',
    3,
    [4],
    'PROFESIONAL',
  ),
  delPlan2502(8, 'IX24227', 'Gestión ambiental', 2, [3], 'PROFESIONAL'),
  delPlan2502(8, 'FC72739', 'Formación humana IV', 2, [7], 'COMPLEMENTARIO'),
  electiva2502(8, 'IX24207', 'Electiva I (Estudios prospectivos)', [3]),
  electiva2502(
    8,
    'IX24208',
    'Electiva I GPO (Control estadístico de la calidad)',
    [4],
  ),
  // Semestre 9
  electiva2502(
    9,
    'IX24209',
    'Electiva II (Administración de la calidad y la productividad)',
    [3],
  ),
  electiva2502(9, 'IX24210', 'Electiva II GPO (Mejoramiento de procesos)', [4]),
  electiva2502(
    9,
    'IX24211',
    'Electiva III (Sistemas de información gerencial)',
    [3],
  ),
  electiva2502(9, 'IX24212', 'Electiva III GPO (Simulación de procesos)', [4]),
  electiva2502(
    9,
    'IX24213',
    'Electiva IV (Administración de sueldos y salarios)',
    [6],
  ),
  electiva2502(
    9,
    'IX24214',
    'Electiva IV GPO (Tópicos avanzados de productividad)',
    [4],
  ),
  electiva2502(
    9,
    'IX24215',
    'Electiva V (Gestión logística del comercio internacional)',
    [3],
  ),
  electiva2502(
    9,
    'IX24216',
    'Electiva V GPO (Administración del mantenimiento industrial)',
    [4],
  ),
  electiva2502(
    9,
    'IX24217',
    'Electiva VI (Sistemas para la gestión de recursos empresariales - ERP)',
    [3],
  ),
  electiva2502(9, 'IX24218', 'Electiva VI GPO (Diseño de planta)', [4]),
  // Semestre 10
  electiva2502(
    10,
    'IX24219',
    'Electiva VII (Sistemas integrados de gestión)',
    [3],
  ),
  electiva2502(10, 'IX24220', 'Electiva VII GPO (Diseño de producto)', [4]),
  delPlan2502(
    10,
    'IX24221',
    'Prácticas profesionales (Electiva VIII GA)',
    5,
    [7],
    'COMPLEMENTARIO',
  ),
  delPlan2502(
    10,
    'IX24228',
    'Prácticas profesionales (Electiva VIII GPO)',
    5,
    [7],
    'COMPLEMENTARIO',
  ),
];

/** Código del plan 1702: el del mapeo a RAP y el de los proyectos de demostración. */
export const CODIGO_PLAN_1702 = '1702';

/**
 * Los dos planes vigentes del programa (docs/datos-institucionales.md, apartado 4).
 * Los dos quedan «vigente»: la regla de transición entre ellos todavía no la entrega el programa.
 */
export const PLANES_DE_ESTUDIO: PlanEstudioSemilla[] = [
  {
    codigo: CODIGO_PLAN_1702,
    nombre: 'Plan de estudios 1702',
    asignaturas: PLAN_1702,
  },
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

/** Una rúbrica oficial, versión 1, con los descriptores de la regla del RAP 2. */
function rubricaOficial(rap: number, indicadores: string[]): RubricaSemilla {
  return {
    rap,
    version: 1,
    indicadores: indicadores.map((descripcion, i) => ({
      numero: i + 1,
      descripcion,
      descriptores: descriptoresOficiales(descripcion),
    })),
  };
}

/**
 * RF-06: rúbricas reales de los RAP 1, 3, 4, 5, 6 y 7, versión 1 y vigentes. Los indicadores
 * son el texto literal de la Tabla 8 del informe de resultados RAP 2024-2, sin el punto final
 * que traen algunos (docs/datos-institucionales.md, apartado 2). El informe no trae los
 * descriptores por nivel: salen de la misma regla de la rúbrica real del RAP 2, y el programa
 * todavía debe confirmarlos (apartado 8). Si corrige un texto, lo hace con una versión nueva.
 */
export const RUBRICAS_OFICIALES: RubricaSemilla[] = [
  rubricaOficial(1, [
    'Comprende los conceptos matemáticos, estadísticos y el método científico en el ámbito organizacional',
    'Aplica los conceptos y herramientas matemáticas, estadísticas y el método científico en el ámbito organizacional',
    'Propone la solución de problemas con el apoyo de herramientas matemáticas, estadísticas y el método científico en el ámbito organizacional',
    'Valora resultados y alternativas de solución de problemas con el apoyo de las matemáticas, estadísticas y el método científico en el ámbito organizacional',
  ]),
  rubricaOficial(3, [
    'Identifica las necesidades, restricciones y oportunidades asociadas a las organizaciones y su contexto, que inciden en la mejora de su gestión integral',
    'Comprende conceptos, modelos, técnicas y/o herramientas adecuadas a las distintas temáticas relacionadas con la mejora en la gestión integral de las organizaciones',
    'Aplica modelos, técnicas y/o herramientas orientadas a la mejora de la gestión integral de las organizaciones',
    'Propone y valora alternativas que coadyuvan a la mejora de la gestión integral de las organizaciones',
  ]),
  rubricaOficial(4, [
    'Comprende los requerimientos, recursos y restricciones de un problema de producción y operaciones en las organizaciones',
    'Analiza soluciones a problemas de producción y operaciones en las organizaciones',
    'Aplica conceptos, principios, métodos y herramientas de la producción y operaciones requeridos en la formulación de un problema de producción y operaciones en las organizaciones',
    'Evalúa resultados y alternativas de solución a problemas de producción y operaciones en las organizaciones',
  ]),
  rubricaOficial(5, [
    'Comprende los elementos fundamentales aplicables al mercadeo y el entorno digital en el desarrollo de estrategias de valor para las organizaciones',
    'Aplica los conocimientos del mercadeo y del entorno digital en el desarrollo de estrategias de valor para las organizaciones',
    'Valora las estrategias propuestas en la generación de valor aplicadas al mercadeo y el entorno digital en las organizaciones',
  ]),
  rubricaOficial(6, [
    'Comprende los conocimientos y procesos de gestión humana en las organizaciones desde una visión integral de las personas apoyado en la legislación laboral',
    'Aplica los conocimientos y procesos de gestión humana en las organizaciones desde una visión integral de las personas apoyado en la legislación laboral',
    'Valora los conocimientos y procesos de gestión humana en las organizaciones desde una visión integral de las personas apoyado en la legislación laboral',
  ]),
  rubricaOficial(7, [
    'Comprende conceptos y técnicas de comunicación asertivas, desarrollo sostenible, principios éticos y demás conocimientos asociados a las ciencias sociales y jurídicas',
    'Aplica conceptos y técnicas de comunicación asertivas, desarrollo sostenible, principios éticos y demás conceptos asociados a las ciencias sociales y jurídicas',
    'Evalúa conceptos y técnicas de comunicación asertivas, desarrollo sostenible, principios éticos y demás conceptos asociados a las ciencias sociales y jurídicas',
  ]),
];

/** Las rúbricas de los siete RAP del programa, en el orden de los RAP. */
export const RUBRICAS: RubricaSemilla[] = [
  RUBRICA_RAP_2,
  ...RUBRICAS_OFICIALES,
].sort((a, b) => a.rap - b.rap);
