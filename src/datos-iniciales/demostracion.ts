import type { NombreRol } from './catalogos.js';

/**
 * Datos de demostración: el período 2026-2 con su receso y los usuarios ficticios. Solo se
 * cargan con `npm run db:sembrar:demo`, nunca en producción. Los datos institucionales del
 * programa (facultad, escala con su meta, RAP, rúbricas de los siete RAP y planes de estudio)
 * están en programa.ts y son datos base.
 */

/**
 * Período 2026-2 con las fechas reales del Acuerdo 46 del 26 de mayo de 2026 del Consejo
 * Académico (programas presenciales). Es de demostración porque las clases terminan antes de la
 * prueba beta, que será en 2027-1. Son 17 semanas calendario con una de receso: quedan 16 de
 * clase, las que suponen los créditos.
 */
export const PERIODO = {
  codigo: '2026-2',
  fecha_inicio: '2026-08-03',
  fecha_fin: '2026-11-27',
  numero_semanas: 16,
};

/**
 * Receso de fiestas novembrinas del 2026-2 (Acuerdo 46): del lunes 9 al sábado 14 de noviembre.
 * Va a `dia_festivo` con origen `institucional`, para que RF-19 lo marque igual que un festivo.
 * Los festivos nacionales del período (7 y 17 de agosto, 12 de octubre, 2 y 16 de noviembre y,
 * en la ventana de parciales finales, 8 de diciembre) ya vienen con los datos base, en
 * FESTIVOS_2026 de catalogos.ts, con origen `ley`.
 */
export const RECESO_2026_2 = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
].map((fecha) => ({ fecha, nombre: 'Receso de fiestas novembrinas' }));

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
