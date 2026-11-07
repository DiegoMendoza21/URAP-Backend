/**
 * Catálogos que la aplicación necesita en cualquier ambiente. Cada valor sale de un documento
 * del proyecto, citado en su comentario; lo que los documentos no definen no se inventa aquí.
 * Se cargan con `npm run db:sembrar` (ver sembrar.ts).
 */

/** RF-03 y docs/glosario-dominio.md: los seis roles del sistema. */
export const ROLES = [
  {
    nombre: 'Administrador',
    descripcion:
      'Usuarios, roles, parámetros y festivos; vela por el cumplimiento del diligenciamiento.',
  },
  {
    nombre: 'Departamento académico',
    descripcion: 'Crea proyectos docentes, asigna docentes, revisa y aprueba.',
  },
  {
    nombre: 'Docente responsable',
    descripcion:
      'Diligencia el proyecto, registra clases y evidencias, valora estudiantes.',
  },
  {
    nombre: 'Líder RAP',
    descripcion:
      'Analiza el consolidado de los RAP a su cargo y registra acciones de mejora.',
  },
  {
    nombre: 'Dirección del programa',
    descripcion: 'Consulta reportes e indicadores.',
  },
  {
    nombre: 'Estudiante',
    descripcion: 'Consulta el proyecto docente aprobado y publicado.',
  },
] as const;

export type NombreRol = (typeof ROLES)[number]['nombre'];

/**
 * Módulos y permisos de la matriz de RF-03, con los códigos del modelo de datos (DBML v2.4).
 * La asignación de permisos a cada rol (rol_permiso) no se siembra: está en la Tabla 17 del
 * Producto 1, que no está en el repositorio, y la configura HU-02-06.
 */
export const MODULOS = [
  { codigo: 'usuarios', nombre: 'Usuarios y roles', orden: 1 },
  { codigo: 'estructura', nombre: 'Estructura académica', orden: 2 },
  { codigo: 'proyectos', nombre: 'Proyectos docentes', orden: 3 },
  { codigo: 'rap', nombre: 'Resultados de aprendizaje', orden: 4 },
  { codigo: 'clases', nombre: 'Registro de clases', orden: 5 },
  { codigo: 'documentos', nombre: 'Documentos y evidencias', orden: 6 },
  { codigo: 'reportes', nombre: 'Reportes', orden: 7 },
  { codigo: 'auditoria', nombre: 'Auditoría', orden: 8 },
];

export const PERMISOS = [
  { codigo: 'leer', nombre: 'Leer' },
  { codigo: 'crear', nombre: 'Crear' },
  { codigo: 'actualizar', nombre: 'Actualizar' },
  { codigo: 'eliminar', nombre: 'Eliminar' },
  { codigo: 'generar', nombre: 'Generar' },
  { codigo: 'administrar', nombre: 'Administrar' },
  { codigo: 'aprobar', nombre: 'Aprobar' },
];

/**
 * RF-17: estados del proyecto docente, con los códigos del DBML. Solo se edita en
 * diligenciamiento o devuelto: son los dos estados desde los que el docente puede enviarlo a
 * revisión (RF-17, precondición).
 */
export const ESTADOS_PROYECTO = [
  {
    codigo: 'en_diligenciamiento',
    nombre: 'En diligenciamiento',
    descripcion: 'El docente diligencia el proyecto.',
    orden: 1,
    permite_edicion: true,
  },
  {
    codigo: 'enviado',
    nombre: 'Enviado a revisión',
    descripcion: 'Pendiente de la revisión del departamento académico.',
    orden: 2,
    permite_edicion: false,
  },
  {
    codigo: 'devuelto',
    nombre: 'Devuelto con observaciones',
    descripcion: 'El docente atiende las observaciones de la revisión.',
    orden: 3,
    permite_edicion: true,
  },
  {
    codigo: 'aprobado',
    nombre: 'Aprobado',
    descripcion: 'Aprobado por el departamento académico.',
    orden: 4,
    permite_edicion: false,
  },
  {
    codigo: 'en_ejecucion',
    nombre: 'En ejecución',
    descripcion: 'El curso se está dictando.',
    orden: 5,
    permite_edicion: false,
  },
  {
    codigo: 'cerrado',
    nombre: 'Cerrado',
    descripcion: 'El período terminó.',
    orden: 6,
    permite_edicion: false,
  },
];

/**
 * RF-21: tipos de sesión. Solo la clase exige tema (DBML). El parcial y la actividad
 * complementaria ocupan la sesión, así que cuentan como dictadas; el festivo no.
 */
export const TIPOS_SESION = [
  {
    codigo: 'clase',
    nombre: 'Clase',
    exige_tema: true,
    cuenta_como_dictada: true,
  },
  {
    codigo: 'parcial',
    nombre: 'Parcial',
    exige_tema: false,
    cuenta_como_dictada: true,
  },
  {
    codigo: 'festivo',
    nombre: 'Festivo',
    exige_tema: false,
    cuenta_como_dictada: false,
  },
  {
    codigo: 'actividad_complementaria',
    nombre: 'Actividad complementaria',
    exige_tema: false,
    cuenta_como_dictada: true,
  },
];

/** RF-26: eventos que se notifican, con los códigos del DBML. Las plantillas llegan con EP-13. */
export const TIPOS_NOTIFICACION = [
  {
    codigo: 'asignacion_proyecto',
    nombre: 'Asignación de un proyecto docente',
  },
  { codigo: 'sesion_por_vencer', nombre: 'Sesión por vencer' },
  { codigo: 'sesion_vencida', nombre: 'Sesión vencida' },
  {
    codigo: 'proyecto_devuelto',
    nombre: 'Proyecto devuelto con observaciones',
  },
  { codigo: 'proyecto_aprobado', nombre: 'Proyecto aprobado' },
  { codigo: 'cierre_periodo', nombre: 'Cierre del período' },
  {
    codigo: 'festivos_no_parametrizados',
    nombre: 'Año sin días festivos parametrizados (RF-19)',
  },
];

/**
 * HU-03-07: parámetros de negocio con sus valores iniciales. El secreto y la vigencia del JWT
 * no van aquí: son variables de entorno (NFR-003).
 */
export const PARAMETROS = [
  {
    clave: 'alerta_dias_anticipacion',
    valor: '2',
    tipo_dato: 'entero',
    descripcion:
      'Días antes del vencimiento en que una sesión se marca «Por vencer» (RF-23).',
  },
  {
    clave: 'inicio_sesion_intentos_maximos',
    valor: '5',
    tipo_dato: 'entero',
    descripcion:
      'Intentos fallidos consecutivos antes del bloqueo temporal del acceso (RF-01).',
  },
  {
    clave: 'inicio_sesion_minutos_bloqueo',
    valor: '15',
    tipo_dato: 'entero',
    descripcion:
      'Minutos de bloqueo tras superar los intentos (HU-01-04). Valor propuesto, por validar.',
  },
  {
    clave: 'archivo_tamano_maximo_mb',
    valor: '10',
    tipo_dato: 'entero',
    descripcion:
      'Tamaño máximo de cada archivo cargado, en MB (RF-24, NFR-019). Por validar.',
  },
  {
    clave: 'archivo_tipos_permitidos',
    valor: 'jpg,png,pdf,xlsx,docx',
    tipo_dato: 'lista',
    descripcion:
      'Extensiones de archivo permitidas, separadas por coma (NFR-019). Por validar.',
  },
  {
    clave: 'descripcion_curso_longitud_maxima',
    valor: '4000',
    tipo_dato: 'entero',
    descripcion:
      'Caracteres máximos de la descripción del curso, punto 2 del proyecto docente (RF-11). Valor propuesto, por validar.',
  },
  {
    clave: 'evidencia_tipos_permitidos',
    valor: 'jpg,png,pdf',
    tipo_dato: 'lista',
    descripcion:
      'Extensiones permitidas para las evidencias fotográficas de los RAP, separadas por coma (RF-24). Por validar.',
  },
];

/**
 * RF-19: festivos de Colombia en 2026, con el traslado al lunes de la Ley 51 de 1983. El
 * calendario de 2026 tiene 18.
 */
export const FESTIVOS_2026 = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-01-12', nombre: 'Día de los Reyes Magos' },
  { fecha: '2026-03-23', nombre: 'Día de San José' },
  { fecha: '2026-04-02', nombre: 'Jueves Santo' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajo' },
  { fecha: '2026-05-18', nombre: 'Ascensión del Señor' },
  { fecha: '2026-06-08', nombre: 'Corpus Christi' },
  { fecha: '2026-06-15', nombre: 'Sagrado Corazón de Jesús' },
  { fecha: '2026-06-29', nombre: 'San Pedro y San Pablo' },
  { fecha: '2026-07-20', nombre: 'Día de la Independencia' },
  { fecha: '2026-08-07', nombre: 'Batalla de Boyacá' },
  { fecha: '2026-08-17', nombre: 'Asunción de la Virgen' },
  { fecha: '2026-10-12', nombre: 'Día de la Raza' },
  { fecha: '2026-11-02', nombre: 'Día de Todos los Santos' },
  { fecha: '2026-11-16', nombre: 'Independencia de Cartagena' },
  { fecha: '2026-12-08', nombre: 'Día de la Inmaculada Concepción' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
];
