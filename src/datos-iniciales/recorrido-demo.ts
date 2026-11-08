/**
 * Datos del recorrido de demostración: proyectos docentes en todos los estados, un curso con 34
 * estudiantes ficticios y la medición del RAP 2 que reproduce el caso real de RF-31. Se cargan
 * con `npm run db:sembrar:demo`, junto con los usuarios de demostración, nunca en producción.
 *
 * Todo es ficticio (Ley 1581 de 2012): los nombres de los estudiantes se arman combinando
 * nombres y apellidos comunes, y todo lo que se crea lleva el prefijo `DEMO-` (documentos de
 * los estudiantes y grupos de los proyectos), para reconocerlo y poder borrarlo.
 */

/** Prefijo de todo lo que crea el recorrido de demostración. */
export const PREFIJO_DEMO = 'DEMO-';

/** Grupo de los proyectos de demostración: el índice único es (asignatura, período, grupo). */
export const GRUPO_DEMO = `${PREFIJO_DEMO}A`;

/**
 * Período 2026-1, ya cerrado, solo para mostrar sesiones «incumplidas» (RF-23, excepción p4):
 * una sesión pasa a incumplida cuando el período se cierra sin que se haya registrado. Las fechas
 * son aproximadas, de demostración: no salen de un acuerdo del Consejo Académico.
 */
export const PERIODO_CERRADO_DEMO = {
  codigo: '2026-1',
  fecha_inicio: '2026-02-02',
  fecha_fin: '2026-05-29',
  numero_semanas: 16,
};

// ---------------------------------------------------------------------------------------------
// Estudiantes y caso de RF-31
// ---------------------------------------------------------------------------------------------

const NOMBRES = [
  'Valentina',
  'Santiago',
  'Mariana',
  'Sebastián',
  'Isabella',
  'Samuel',
  'Gabriela',
  'Mateo',
  'Daniela',
  'Nicolás',
  'Sofía',
  'Alejandro',
  'Camila',
  'Juan Pablo',
  'Laura',
  'Andrés',
  'Paula',
];

const APELLIDOS = [
  'Rodríguez',
  'Martínez',
  'Gómez',
  'Pérez',
  'Herrera',
  'Castro',
  'Díaz',
  'Morales',
  'Romero',
  'Jiménez',
  'Torres',
  'Vargas',
  'Rojas',
  'Mendoza',
  'Ortiz',
  'Ríos',
  'Cárdenas',
];

export interface EstudianteDemo {
  /** Documento ficticio, `DEMO-0001`: no es el número de ninguna persona. */
  documento: string;
  nombres: string;
  apellidos: string;
}

/** Estudiantes del caso real de RF-31: los de la medición del RAP 2 de 2024-1. */
export const TAMANO_CASO_RF31 = 34;

/**
 * 82 estudiantes ficticios, repartidos en tres cursos. Cada nombre y cada par de apellidos salen
 * de recorrer las listas con pasos distintos: el resultado es una combinación inventada, no el
 * nombre de alguien.
 */
export const ESTUDIANTES_DEMO: readonly EstudianteDemo[] = Array.from(
  { length: 82 },
  (_, i) => ({
    documento: `${PREFIJO_DEMO}${String(i + 1).padStart(4, '0')}`,
    nombres: NOMBRES[i % NOMBRES.length],
    // El segundo apellido se corre dos lugares por cada vuelta completa de la lista: así no se
    // repite ningún nombre completo aunque las listas sean más cortas que los cursos.
    apellidos: `${APELLIDOS[(i * 5) % APELLIDOS.length]} ${APELLIDOS[(i * 3 + 7 + 2 * Math.floor(i / APELLIDOS.length)) % APELLIDOS.length]}`,
  }),
);

/** Los 34 del caso de RF-31 (Finanzas a corto plazo 2026-2). */
export const COHORTE_RF31 = ESTUDIANTES_DEMO.slice(0, TAMANO_CASO_RF31);
/** Los 20 de Macroeconomía 2026-2: otra asignatura que mide el RAP 2 en el mismo período. */
export const COHORTE_MACROECONOMIA = ESTUDIANTES_DEMO.slice(34, 54);
/** Los 28 de Finanzas a corto plazo 2026-1: la medición del período anterior (RF-32, p4). */
export const COHORTE_2026_1 = ESTUDIANTES_DEMO.slice(54, 82);

/** Por indicador, cuántos estudiantes quedaron en cada nivel de la escala (1 a 4). */
export interface ConteoIndicador {
  indicador: number;
  porNivel: Readonly<Record<number, number>>;
}

/** Una medición cerrada del RAP 2 (RF-30, RF-31): sus conteos, instrumentos y análisis. */
export interface MedicionDemo {
  periodoToma: 'primer' | 'segundo';
  conteos: readonly ConteoIndicador[];
  /** Instrumento de cada indicador (HU-11-02), por número de indicador. */
  instrumentos: Readonly<Record<number, string>>;
  /** HU-11-06. */
  analisis: {
    acciones_implementadas: string;
    resultados_obtenidos: string;
    acciones_propuestas: string;
  };
}

/**
 * Conteos de la medición real del RAP 2 en Finanzas a corto plazo, 2024-1
 * (`docs/datos-institucionales.md`, apartado 3). Nadie quedó en Principiante (1) ni en
 * Ejemplar (4). Dan 85,29 %, 70,59 %, 50 % y 50 %, y un logro de 63,97 % (87 de 136).
 */
export const CONTEOS_CASO_RF31: readonly ConteoIndicador[] = [
  { indicador: 1, porNivel: { 2: 5, 3: 29 } },
  { indicador: 2, porNivel: { 2: 10, 3: 24 } },
  { indicador: 3, porNivel: { 2: 17, 3: 17 } },
  { indicador: 4, porNivel: { 2: 17, 3: 17 } },
];

export const MEDICION_CASO_RF31: MedicionDemo = {
  periodoToma: 'segundo',
  conteos: CONTEOS_CASO_RF31,
  instrumentos: {
    1: 'Taller de análisis del entorno económico',
    2: 'Estudio de caso: estados financieros de una pyme',
    3: 'Quiz sobre indicadores de liquidez',
    4: 'Informe de decisión de financiación a corto plazo',
  },
  analisis: {
    acciones_implementadas:
      'Talleres de refuerzo sobre lectura de estados financieros y tutorías antes del parcial.',
    resultados_obtenidos:
      'Los indicadores 1 y 2 superan el 70 %; los indicadores 3 y 4 quedan en 50 %.',
    acciones_propuestas:
      'Más práctica guiada con indicadores de liquidez y casos de financiación de corto plazo.',
  },
};

/**
 * Macroeconomía 2026-2, 20 estudiantes, inventada: 80 %, 70 %, 55 % y 60 %, y un logro de
 * 66,25 % (53 de 80). Con el caso de RF-31, el reporte de logro del RAP 2 en 2026-2 suma las
 * valoraciones de las dos asignaturas: 64,81 % (140 de 216), no el promedio de porcentajes.
 */
export const MEDICION_MACROECONOMIA: MedicionDemo = {
  periodoToma: 'segundo',
  conteos: [
    { indicador: 1, porNivel: { 2: 4, 3: 14, 4: 2 } },
    { indicador: 2, porNivel: { 2: 6, 3: 13, 4: 1 } },
    { indicador: 3, porNivel: { 1: 1, 2: 8, 3: 11 } },
    { indicador: 4, porNivel: { 1: 1, 2: 7, 3: 12 } },
  ],
  instrumentos: {
    1: 'Taller de indicadores macroeconómicos',
    2: 'Ensayo sobre política monetaria',
    3: 'Quiz de balanza de pagos',
    4: 'Estudio de caso: efecto de la tasa de cambio en una empresa',
  },
  analisis: {
    acciones_implementadas:
      'Lecturas guiadas de informes del Banco de la República.',
    resultados_obtenidos:
      'Los indicadores 1 y 2 superan el 70 %; el indicador 3 queda en 55 %.',
    acciones_propuestas:
      'Ejercicios de balanza de pagos con datos reales publicados.',
  },
};

/**
 * Finanzas a corto plazo 2026-1, 28 estudiantes, inventada y más baja que la de 2026-2, con la
 * misma versión de la rúbrica: 64,29 %, 53,57 %, 42,86 % y 39,29 %, y un logro de 50 % (56 de
 * 112). Es el período anterior con el que compara el reporte de logro (RF-32, p4).
 */
export const MEDICION_2026_1: MedicionDemo = {
  periodoToma: 'primer',
  conteos: [
    { indicador: 1, porNivel: { 1: 1, 2: 9, 3: 16, 4: 2 } },
    { indicador: 2, porNivel: { 1: 2, 2: 11, 3: 14, 4: 1 } },
    { indicador: 3, porNivel: { 1: 3, 2: 13, 3: 12 } },
    { indicador: 4, porNivel: { 1: 4, 2: 13, 3: 10, 4: 1 } },
  ],
  instrumentos: {
    1: 'Taller de análisis del entorno económico',
    2: 'Estudio de caso: estados financieros de una pyme',
    3: 'Quiz sobre indicadores de liquidez',
    4: 'Informe de decisión de financiación a corto plazo',
  },
  analisis: {
    acciones_implementadas: 'Clases magistrales y un taller por corte.',
    resultados_obtenidos:
      'Solo el indicador 1 supera el 60 %; los indicadores 3 y 4 quedan por debajo del 45 %.',
    acciones_propuestas:
      'Talleres de refuerzo y tutorías antes del parcial, que se aplicaron en 2026-2.',
  },
};

function mcd(a: number, b: number): number {
  return b === 0 ? a : mcd(b, a % b);
}

/**
 * Nivel de cada estudiante (por su posición en el curso) en un indicador, de forma arbitraria
 * pero fija, para que los conteos sean exactamente los de la medición. Con un paso sin divisores
 * comunes con el tamaño del curso (7 para 34 y para 20, 5 para 28), `(paso·i + indicador) mod
 * tamaño` recorre todas las posiciones una sola vez: las primeras van al nivel más bajo, las
 * siguientes al que sigue, y así hasta completar cada conteo. Cada indicador reparte distinto.
 */
export function nivelPorConteo(
  conteos: readonly ConteoIndicador[],
  posicionEstudiante: number,
  indicador: number,
): number {
  const conteo = conteos.find((fila) => fila.indicador === indicador);
  if (!conteo) {
    throw new Error(`La medición no tiene el indicador ${indicador}.`);
  }
  const niveles = Object.keys(conteo.porNivel)
    .map(Number)
    .sort((a, b) => a - b);
  const tamano = niveles.reduce(
    (suma, nivel) => suma + conteo.porNivel[nivel],
    0,
  );
  const paso =
    [7, 5, 3, 11, 13].find((candidato) => mcd(candidato, tamano) === 1) ?? 1;
  const turno = (posicionEstudiante * paso + indicador) % tamano;
  let acumulado = 0;
  for (const nivel of niveles) {
    acumulado += conteo.porNivel[nivel];
    if (turno < acumulado) {
      return nivel;
    }
  }
  throw new Error(
    `La posición ${posicionEstudiante} no cabe en el curso de ${tamano}.`,
  );
}

// ---------------------------------------------------------------------------------------------
// Proyectos docentes
// ---------------------------------------------------------------------------------------------

export type EstadoDemo =
  'en_diligenciamiento' | 'enviado' | 'devuelto' | 'aprobado' | 'cerrado';

export interface RacDemo {
  codigo: string;
  descripcion: string;
  /** RAP del programa al que contribuye, con la descripción de cómo lo hace. */
  rap: number;
  contribucion: string;
  /** Actividades de evaluación del RAC (punto 5); vacío deja la sección incompleta. */
  evaluaciones: {
    instrumento: string;
    descripcion: string;
    porcentaje: number;
  }[];
}

export interface ObservacionDemo {
  /** Clave de la sección en SECCIONES (proyectos-docentes/entities/secciones.ts). */
  seccion: string;
  observacion: string;
}

export interface ProyectoDemo {
  /** Para encontrarlo en las pruebas y en las notas del recorrido. */
  clave: string;
  asignatura: string;
  periodo: 'vigente' | 'cerrado';
  /** Correo del usuario de demostración responsable (USUARIOS_DEMO). */
  docente: string;
  estado: EstadoDemo;
  raps: number[];
  descripcion: string | null;
  racs: RacDemo[];
  estrategias: string[];
  /** Temas del punto 6, uno por semana; menos de 16 deja la sección incompleta. */
  temas: string[];
  bibliografia: string[];
  /** Observaciones de la revisión que lo devolvió (RF-18). */
  devolucion?: { general: string; observaciones: ObservacionDemo[] };
  /** Horario semanal (RF-19): días de 1 (lunes) a 6 (sábado) y horas `HH:MM`. */
  horario?: { dias: number[]; horaInicio: string; horaFin: string };
  /**
   * Sin vencidas: se registran todas las clases que ya pasaron. Si no, quedan sin registrar las
   * de los últimos DIAS_SIN_REGISTRAR días, para mostrar la alerta (RF-23).
   */
  sesionesAlDia?: boolean;
  /** Estudiantes ficticios matriculados (RF-22), en el orden en que se valoran. */
  matriculados?: readonly EstudianteDemo[];
  /** La medición cerrada del RAP 2 (RF-30, RF-31). Solo el RAP 2 tiene rúbrica real. */
  medicion?: MedicionDemo;
  /**
   * Evidencias fotográficas (RF-24): imágenes generadas, por semana de la sesión y RAP (por
   * defecto, el primero del proyecto).
   */
  evidencias?: { semana: number; descripcion: string; rap?: number }[];
}

/**
 * Temas de un curso en las 16 semanas: cada tema dura dos semanas, con un parcial en la
 * semana 8 y la evaluación final en la 16.
 */
function dieciseisSemanas(temas: readonly string[]): string[] {
  const semanas: string[] = [];
  for (const tema of temas) {
    semanas.push(tema, `${tema} (continuación)`);
  }
  semanas[7] = 'Evaluación parcial y retroalimentación';
  semanas[15] = 'Evaluación final y cierre del curso';
  return semanas.slice(0, 16);
}

const TEMAS_FINANZAS_CORTO_PLAZO = dieciseisSemanas([
  'Entorno económico y financiero de la empresa',
  'Estados financieros básicos',
  'Capital de trabajo y ciclo de conversión del efectivo',
  'Indicadores de liquidez',
  'Gestión del efectivo y presupuesto de caja',
  'Cuentas por cobrar y política de crédito',
  'Inventarios y su financiación',
  'Fuentes de financiación de corto plazo',
]);

const TEMAS_NEGOCIOS_INTERNACIONALES = dieciseisSemanas([
  'Sistema financiero internacional',
  'Mercado cambiario y tasas de cambio',
  'Riesgo cambiario y coberturas',
  'Medios de pago internacionales',
  'Financiación del comercio exterior',
  'Inversión extranjera directa',
  'Evaluación de proyectos internacionales',
  'Casos de empresas exportadoras',
]);

const TEMAS_TALENTO_HUMANO = dieciseisSemanas([
  'La gestión humana en la organización',
  'Planeación del talento humano',
  'Reclutamiento y selección',
  'Inducción y formación',
  'Evaluación del desempeño',
  'Compensación y legislación laboral',
  'Bienestar y clima organizacional',
  'Seguridad y salud en el trabajo',
]);

const TEMAS_MACROECONOMIA = dieciseisSemanas([
  'Medición de la actividad económica',
  'Inflación y desempleo',
  'Dinero y política monetaria',
  'Política fiscal',
  'Economía abierta y balanza de pagos',
  'Tasa de cambio',
  'Crecimiento económico',
  'Ciclos económicos y empresa',
]);

const TEMAS_ORGANIZACION = dieciseisSemanas([
  'La organización y su entorno',
  'Planeación estratégica',
  'Diseño de la estructura organizacional',
  'Departamentalización y coordinación',
  'Dirección y liderazgo',
  'Motivación y comunicación',
  'Control organizacional',
  'Ética en la dirección',
]);

const ESTRATEGIAS_GENERALES = [
  'Clase magistral participativa con ejemplos de empresas de la región.',
  'Talleres prácticos en grupos con estudios de caso.',
  'Aprendizaje basado en problemas con informe escrito.',
];

/**
 * Los proyectos del recorrido. Todos son del programa de demostración y usan asignaturas reales
 * del plan de estudios con el grupo `DEMO-A`.
 */
export const PROYECTOS_DEMO: readonly ProyectoDemo[] = [
  {
    // El caso de RF-31: aprobado, con clases registradas, vencidas y por vencer, evidencias,
    // 34 matriculados y la medición cerrada del RAP 2.
    clave: 'caso-rf31',
    asignatura: 'Finanzas a corto plazo',
    periodo: 'vigente',
    docente: 'docente.demo@urap.local',
    estado: 'aprobado',
    raps: [2],
    descripcion:
      'Curso del componente financiero que prepara al estudiante para analizar la liquidez de ' +
      'la empresa y decidir cómo financiar su operación de corto plazo.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Interpreta los estados financieros y los indicadores de liquidez de una empresa.',
        rap: 2,
        contribucion:
          'Aporta la lectura del entorno financiero de la organización y su incidencia en las decisiones.',
        evaluaciones: [
          {
            instrumento: 'Taller',
            descripcion: 'Análisis de estados financieros de una pyme.',
            porcentaje: 30,
          },
          {
            instrumento: 'Parcial',
            descripcion: 'Indicadores de liquidez y capital de trabajo.',
            porcentaje: 20,
          },
        ],
      },
      {
        codigo: 'RAC 2',
        descripcion:
          'Propone alternativas de financiación de corto plazo según el ciclo de efectivo.',
        rap: 2,
        contribucion:
          'Aporta la evaluación de alternativas de financiación para la toma de decisiones gerenciales.',
        evaluaciones: [
          {
            instrumento: 'Informe',
            descripcion:
              'Propuesta de financiación de corto plazo para un caso.',
            porcentaje: 30,
          },
          {
            instrumento: 'Examen final',
            descripcion: 'Decisiones de financiación de corto plazo.',
            porcentaje: 20,
          },
        ],
      },
    ],
    estrategias: ESTRATEGIAS_GENERALES,
    temas: TEMAS_FINANZAS_CORTO_PLAZO,
    bibliografia: [
      'Gitman, L. J. y Zutter, C. J. Principios de administración financiera. Pearson.',
      'Ross, S. A., Westerfield, R. W. y Jordan, B. D. Fundamentos de finanzas corporativas. McGraw-Hill.',
      'Ortiz Anaya, H. Análisis financiero aplicado. Universidad Externado de Colombia.',
    ],
    horario: { dias: [2, 4], horaInicio: '08:00', horaFin: '10:00' },
    matriculados: COHORTE_RF31,
    medicion: MEDICION_CASO_RF31,
    evidencias: [
      {
        semana: 3,
        descripcion: 'Tablero del taller de ciclo de conversión del efectivo.',
      },
      {
        semana: 6,
        descripcion: 'Presupuesto de caja elaborado en grupos.',
      },
      {
        semana: 10,
        descripcion: 'Cuadro comparativo de políticas de crédito.',
      },
    ],
  },
  {
    // En diligenciamiento, con pendientes: le faltan estrategias, la evaluación de su RAC,
    // la mitad de los contenidos y la bibliografía.
    clave: 'en-diligenciamiento',
    asignatura: 'Mercados',
    periodo: 'vigente',
    docente: 'docente.demo@urap.local',
    estado: 'en_diligenciamiento',
    raps: [5],
    descripcion:
      'Curso que introduce el análisis de mercados y el diseño de estrategias de valor.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Analiza el mercado de un producto e identifica oportunidades de valor.',
        rap: 5,
        contribucion:
          'Aporta el análisis de mercados para las estrategias de valor de la organización.',
        evaluaciones: [],
      },
    ],
    estrategias: [],
    temas: dieciseisSemanas([
      'Conceptos de mercadeo',
      'Investigación de mercados',
      'Segmentación y posicionamiento',
      'Comportamiento del consumidor',
      'Mezcla de mercadeo',
      'Mercadeo digital',
      'Plan de mercadeo',
      'Presentación de planes',
    ]).slice(0, 6),
    bibliografia: [],
  },
  {
    // Enviado a revisión: completo, en la bandeja del Departamento.
    clave: 'enviado',
    asignatura: 'Finanzas y negocios internacionales',
    periodo: 'vigente',
    docente: 'lider.demo@urap.local',
    estado: 'enviado',
    raps: [2],
    descripcion:
      'Curso que estudia la financiación y los riesgos de las operaciones internacionales de la empresa.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Evalúa el riesgo cambiario de una operación de comercio exterior y propone su cobertura.',
        rap: 2,
        contribucion:
          'Aporta el análisis del entorno financiero internacional y su incidencia en las decisiones.',
        evaluaciones: [
          {
            instrumento: 'Estudio de caso',
            descripcion: 'Cobertura del riesgo cambiario de una exportadora.',
            porcentaje: 50,
          },
          {
            instrumento: 'Examen final',
            descripcion: 'Financiación del comercio exterior.',
            porcentaje: 50,
          },
        ],
      },
    ],
    estrategias: ESTRATEGIAS_GENERALES.slice(0, 2),
    temas: TEMAS_NEGOCIOS_INTERNACIONALES,
    bibliografia: [
      'Madura, J. Administración financiera internacional. Cengage Learning.',
      'Eiteman, D., Stonehill, A. y Moffett, M. Finanzas para empresas multinacionales. Pearson.',
    ],
  },
  {
    // Devuelto con observaciones: el Departamento pidió ajustes en dos secciones.
    clave: 'devuelto',
    asignatura: 'Administración del talento humano',
    periodo: 'vigente',
    docente: 'docente.demo@urap.local',
    estado: 'devuelto',
    raps: [6],
    descripcion:
      'Curso sobre los procesos de la gestión humana, desde la planeación hasta el bienestar.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Diseña un proceso de selección acorde con la legislación laboral vigente.',
        rap: 6,
        contribucion:
          'Aporta la aplicación de los procesos de gestión humana con apoyo en la legislación laboral.',
        evaluaciones: [
          {
            instrumento: 'Proyecto',
            descripcion: 'Diseño de un proceso de selección.',
            porcentaje: 60,
          },
          {
            instrumento: 'Parcial',
            descripcion: 'Legislación laboral básica.',
            porcentaje: 40,
          },
        ],
      },
    ],
    estrategias: ESTRATEGIAS_GENERALES.slice(0, 1),
    temas: TEMAS_TALENTO_HUMANO,
    bibliografia: ['Chiavenato, I. Gestión del talento humano. McGraw-Hill.'],
    devolucion: {
      general:
        'El proyecto va bien encaminado. Ajuste las dos secciones señaladas y vuelva a enviarlo.',
      observaciones: [
        {
          seccion: 'estrategias',
          observacion:
            'Incluya al menos una estrategia práctica, por ejemplo un taller o un estudio de caso.',
        },
        {
          seccion: 'bibliografia',
          observacion:
            'Agregue una referencia de legislación laboral colombiana actualizada.',
        },
      ],
    },
  },
  {
    // Aprobado y al día: la segunda asignatura que mide el RAP 2 en 2026-2, para que el reporte
    // de logro sume las valoraciones de dos cursos.
    clave: 'segunda-medicion',
    asignatura: 'Macroeconomía',
    periodo: 'vigente',
    docente: 'lider.demo@urap.local',
    estado: 'aprobado',
    raps: [2],
    descripcion:
      'Curso que estudia el comportamiento agregado de la economía y su efecto en las decisiones de la empresa.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Interpreta los indicadores macroeconómicos y su efecto en el entorno de la empresa.',
        rap: 2,
        contribucion:
          'Aporta la lectura del entorno económico nacional e internacional para la toma de decisiones.',
        evaluaciones: [
          {
            instrumento: 'Taller',
            descripcion: 'Indicadores macroeconómicos de Colombia.',
            porcentaje: 40,
          },
          {
            instrumento: 'Estudio de caso',
            descripcion: 'Efecto de la tasa de cambio en una empresa.',
            porcentaje: 60,
          },
        ],
      },
    ],
    estrategias: [
      ESTRATEGIAS_GENERALES[0],
      'Lectura y discusión de informes económicos oficiales.',
    ],
    temas: TEMAS_MACROECONOMIA,
    bibliografia: [
      'Mankiw, N. G. Macroeconomía. Antoni Bosch.',
      'Blanchard, O. Macroeconomía. Pearson.',
    ],
    horario: { dias: [3], horaInicio: '10:00', horaFin: '12:00' },
    sesionesAlDia: true,
    matriculados: COHORTE_MACROECONOMIA,
    medicion: MEDICION_MACROECONOMIA,
    evidencias: [
      { semana: 4, descripcion: 'Gráfico de inflación construido en clase.' },
    ],
  },
  {
    // Aprobado y al día, con dos RAP: evidencias en el RAP 3 y en el 7, para que la
    // contribución RAC-RAP no muestre evidencias solo en el RAP 2.
    clave: 'dos-raps',
    asignatura: 'Organización y dirección',
    periodo: 'vigente',
    docente: 'docente.demo@urap.local',
    estado: 'aprobado',
    raps: [3, 7],
    descripcion:
      'Curso sobre el diseño de la estructura organizacional y el ejercicio de la dirección.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Propone mejoras a la estructura de una organización a partir de su diagnóstico.',
        rap: 3,
        contribucion:
          'Aporta alternativas de mejora en la gestión integral de la organización.',
        evaluaciones: [
          {
            instrumento: 'Proyecto',
            descripcion:
              'Diagnóstico y propuesta de estructura para una empresa.',
            porcentaje: 60,
          },
        ],
      },
      {
        codigo: 'RAC 2',
        descripcion:
          'Comunica por escrito y oralmente una propuesta de dirección con argumentos éticos.',
        rap: 7,
        contribucion:
          'Aporta la comunicación asertiva de propuestas con principios y valores éticos.',
        evaluaciones: [
          {
            instrumento: 'Exposición',
            descripcion: 'Sustentación de la propuesta ante el grupo.',
            porcentaje: 40,
          },
        ],
      },
    ],
    estrategias: [
      ESTRATEGIAS_GENERALES[1],
      'Visita a una empresa de la región y presentación de hallazgos.',
    ],
    temas: TEMAS_ORGANIZACION,
    bibliografia: [
      'Robbins, S. P. y Coulter, M. Administración. Pearson.',
      'Koontz, H., Weihrich, H. y Cannice, M. Administración: una perspectiva global. McGraw-Hill.',
    ],
    horario: { dias: [5], horaInicio: '08:00', horaFin: '11:00' },
    sesionesAlDia: true,
    evidencias: [
      {
        semana: 5,
        rap: 3,
        descripcion: 'Organigrama propuesto por un grupo en el taller.',
      },
      {
        semana: 9,
        rap: 7,
        descripcion: 'Esquema de la sustentación de una propuesta.',
      },
    ],
  },
  {
    // Período 2026-1 ya cerrado: clases registradas, tres incumplidas (RF-23, excepción p4) y
    // la medición del RAP 2 con la que compara el reporte de logro (RF-32, p4).
    clave: 'periodo-cerrado',
    asignatura: 'Finanzas a corto plazo',
    periodo: 'cerrado',
    docente: 'docente.demo@urap.local',
    estado: 'cerrado',
    raps: [2],
    descripcion:
      'Curso del componente financiero que prepara al estudiante para analizar la liquidez de ' +
      'la empresa y decidir cómo financiar su operación de corto plazo.',
    racs: [
      {
        codigo: 'RAC 1',
        descripcion:
          'Interpreta los estados financieros y los indicadores de liquidez de una empresa.',
        rap: 2,
        contribucion:
          'Aporta la lectura del entorno financiero de la organización y su incidencia en las decisiones.',
        evaluaciones: [
          {
            instrumento: 'Taller',
            descripcion: 'Análisis de estados financieros de una pyme.',
            porcentaje: 50,
          },
          {
            instrumento: 'Examen final',
            descripcion: 'Indicadores de liquidez y capital de trabajo.',
            porcentaje: 50,
          },
        ],
      },
    ],
    estrategias: ESTRATEGIAS_GENERALES,
    temas: TEMAS_FINANZAS_CORTO_PLAZO,
    bibliografia: [
      'Gitman, L. J. y Zutter, C. J. Principios de administración financiera. Pearson.',
    ],
    horario: { dias: [1, 3], horaInicio: '14:00', horaFin: '16:00' },
    matriculados: COHORTE_2026_1,
    medicion: MEDICION_2026_1,
    evidencias: [
      { semana: 5, descripcion: 'Ejercicio de presupuesto de caja.' },
    ],
  },
];

/**
 * Semanas del período cerrado en que una sesión quedó sin registrar: al cerrarse el período,
 * cada una cuenta como «incumplida» en el tablero (RF-23, excepción p4).
 */
export const SEMANAS_INCUMPLIDAS = [4, 9, 13];

/**
 * En el período vigente, las sesiones de los últimos días se dejan sin registrar, para que el
 * tablero muestre sesiones vencidas (RF-23). Las anteriores a este margen quedan registradas.
 */
export const DIAS_SIN_REGISTRAR = 7;
