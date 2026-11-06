import type { NombreRol } from './catalogos.js';

/**
 * Programa de Administración Industrial y datos de demostración. Lo institucional sale de
 * los documentos del proyecto; lo que todavía no está (los textos de los RAP, el porcentaje
 * esperado, el plan de estudios y el calendario oficial) queda marcado como pendiente o como
 * dato de demostración, para reemplazarlo cuando el programa lo entregue.
 *
 * La facultad, el programa, la escala y los RAP son datos base (`npm run db:sembrar`). El
 * período, las asignaturas y los usuarios solo se cargan con `npm run db:sembrar:demo`.
 */

export const FACULTAD = { nombre: 'Facultad de Ciencias Económicas' };

export const PROGRAMA = { nombre: 'Administración Industrial' };

/**
 * RF-07 y docs/glosario-dominio.md: escala de cuatro niveles, logrado desde el nivel 3. El
 * porcentaje esperado no está definido: sin él, RF-31 presenta el consolidado sin el juicio
 * de cumplimiento.
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

/**
 * Período de demostración: 16 semanas, como el formato vigente (RF-15). Las fechas no son las
 * del calendario académico oficial; se ajustan cuando el programa las entregue.
 */
export const PERIODO = {
  codigo: '2026-2',
  fecha_inicio: '2026-08-03',
  fecha_fin: '2026-11-21',
  numero_semanas: 16,
};

/** RF-05: los siete RAP del programa. Sus textos salen del Proyecto Educativo del Programa. */
export const DESCRIPCION_RAP_PENDIENTE =
  'Pendiente: tomar la descripción del Proyecto Educativo del Programa.';

export const RAPS = [1, 2, 3, 4, 5, 6, 7].map((numero) => ({
  numero,
  codigo: `RAP ${numero}`,
}));

/**
 * Asignaturas de demostración, mientras se carga el plan de estudios (HU-03-02). Sus horas
 * siguen la regla del glosario: 48 horas por crédito, repartidas en TDE, TDP y TI. Finanzas a
 * corto plazo y su relación con el RAP 2 salen de la rúbrica del programa citada en los
 * requisitos; las demás relaciones con los RAP son de demostración.
 */
export const ASIGNATURAS = [
  {
    codigo_interno: 'DEMO-01',
    nombre: 'Finanzas a corto plazo',
    semestre: 6,
    componente: 'PROFESIONAL',
    tipo_curso: 'Obligatorio',
    creditos: 3,
    horas_tde: 48,
    horas_tdp: 0,
    horas_ti: 96,
    raps: [2],
  },
  {
    codigo_interno: 'DEMO-02',
    nombre: 'Gestión de la producción',
    semestre: 5,
    componente: 'PROFESIONAL',
    tipo_curso: 'Obligatorio',
    creditos: 3,
    horas_tde: 48,
    horas_tdp: 0,
    horas_ti: 96,
    raps: [1, 3],
  },
  {
    codigo_interno: 'DEMO-03',
    nombre: 'Investigación de operaciones',
    semestre: 4,
    componente: 'BASICO',
    tipo_curso: 'Obligatorio',
    creditos: 3,
    horas_tde: 32,
    horas_tdp: 16,
    horas_ti: 96,
    raps: [1, 4],
  },
  {
    codigo_interno: 'DEMO-04',
    nombre: 'Gestión de la calidad',
    semestre: 7,
    componente: 'PROFESIONAL',
    tipo_curso: 'Obligatorio',
    creditos: 2,
    horas_tde: 32,
    horas_tdp: 0,
    horas_ti: 64,
    raps: [5],
  },
];

/** Horas de trabajo por crédito académico (glosario: 2 créditos = 96 horas). */
export const HORAS_POR_CREDITO = 48;

export interface UsuarioDemo {
  correo: string;
  nombres: string;
  apellidos: string;
  roles: NombreRol[];
  /** El administrador tiene alcance global; los demás roles, el del programa. */
  global?: boolean;
  /** Número del RAP que lidera en el período de demostración. */
  lideraRap?: number;
  dirigePrograma?: boolean;
}

/**
 * Usuarios ficticios, uno por rol, para probar y demostrar sin pantallas de administración.
 * Nunca datos de personas reales (Ley 1581 de 2012). Uno es docente y además líder RAP,
 * porque un usuario puede tener varios roles. Todos comparten la contraseña de la variable
 * de entorno CONTRASENA_USUARIOS_DEMO.
 */
export const USUARIOS_DEMO: UsuarioDemo[] = [
  {
    correo: 'admin.demo@urap.local',
    nombres: 'Administrador',
    apellidos: 'Demo',
    roles: ['Administrador'],
    global: true,
  },
  {
    correo: 'departamento.demo@urap.local',
    nombres: 'Departamento',
    apellidos: 'Demo',
    roles: ['Departamento académico'],
  },
  {
    correo: 'docente.demo@urap.local',
    nombres: 'Docente',
    apellidos: 'Demo',
    roles: ['Docente responsable'],
  },
  {
    correo: 'lider.demo@urap.local',
    nombres: 'Docente Líder',
    apellidos: 'Demo',
    roles: ['Docente responsable', 'Líder RAP'],
    lideraRap: 2,
  },
  {
    correo: 'direccion.demo@urap.local',
    nombres: 'Dirección',
    apellidos: 'Demo',
    roles: ['Dirección del programa'],
    dirigePrograma: true,
  },
  {
    correo: 'estudiante.demo@urap.local',
    nombres: 'Estudiante',
    apellidos: 'Demo',
    roles: ['Estudiante'],
  },
];
