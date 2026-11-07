import type { NombreRol } from './catalogos.js';

/**
 * Datos de demostración: un período con fechas de ejemplo y usuarios ficticios. Solo se cargan
 * con `npm run db:sembrar:demo`, nunca en producción. Los datos institucionales del programa
 * (facultad, escala, RAP y plan de estudios) están en programa.ts y son datos base.
 */

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
