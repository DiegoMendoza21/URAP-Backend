import { ApiProperty } from '@nestjs/swagger';
import { TIPOS_ALERTA, type TipoAlerta } from '../alertas.js';

/* Respuestas del horario (HU-08-02) y del calendario de sesiones (HU-08-03), RF-19. */

export class BloqueHorarioDto {
  @ApiProperty({ example: 1, description: '1 = lunes … 6 = sábado' })
  diaSemana: number;

  @ApiProperty({ example: '07:00' })
  horaInicio: string;

  @ApiProperty({ example: '09:00' })
  horaFin: string;
}

export class HorarioCursoDto {
  @ApiProperty({ example: 4 })
  idProyectoDocente: number;

  @ApiProperty({ type: [BloqueHorarioDto] })
  bloques: BloqueHorarioDto[];

  @ApiProperty({
    example: true,
    description:
      'Si el usuario puede cambiar el horario y generar el calendario: el docente asignado ' +
      'al proyecto o el administrador, con el período abierto.',
  })
  puedeEditar: boolean;
}

export class TipoSesionDto {
  @ApiProperty({
    example: 'clase',
    description: 'clase | parcial | festivo | actividad_complementaria',
  })
  codigo: string;

  @ApiProperty({ example: 'Clase' })
  nombre: string;
}

export class SesionCalendarioDto {
  @ApiProperty({ example: 120 })
  id: number;

  @ApiProperty({ example: 1, description: 'Semana del período' })
  semana: number;

  @ApiProperty({ example: '2026-08-03', format: 'date' })
  fecha: string;

  @ApiProperty({ example: 1, description: '1 = lunes … 6 = sábado' })
  diaSemana: number;

  @ApiProperty({
    example: '07:00',
    nullable: true,
    type: String,
    description:
      'Del horario vigente; nulo si ese día ya no está en el horario',
  })
  horaInicio: string | null;

  @ApiProperty({ example: '09:00', nullable: true, type: String })
  horaFin: string | null;

  @ApiProperty({ type: TipoSesionDto, nullable: true })
  tipo: TipoSesionDto | null;

  @ApiProperty({
    example: 'programada',
    nullable: true,
    type: String,
    description: 'programada | registrada (RF-20). Las retiradas no se listan.',
  })
  estado: string | null;

  @ApiProperty({
    example: 'Batalla de Boyacá',
    nullable: true,
    type: String,
    description: 'Nombre del festivo con el que coincide la fecha (RF-19, p4)',
  })
  festivo: string | null;

  @ApiProperty({
    example: false,
    description:
      'Si el docente ya la diligenció. Una sesión diligenciada no se recalcula.',
  })
  diligenciada: boolean;

  @ApiProperty({
    enum: TIPOS_ALERTA,
    enumName: 'TipoAlertaSesion',
    nullable: true,
    example: 'vencida',
    description:
      'RF-23. vencida: la fecha pasó sin registro (rojo). por_vencer: es hoy o cae dentro del ' +
      'umbral del parámetro alerta_dias_anticipacion (advertencia). incumplida: vencida de un ' +
      'período cerrado. Nulo: diligenciada, festivo o todavía lejos.',
  })
  alerta: TipoAlerta | null;

  @ApiProperty({
    example: 3,
    nullable: true,
    type: Number,
    description: 'Días de atraso de una vencida o incumplida (RF-23, p3)',
  })
  diasAtraso: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description: 'Días que faltan para una sesión por vencer: 0 es hoy',
  })
  diasRestantes: number | null;
}

export class ResumenAlertasDto {
  @ApiProperty({ example: 3, description: 'Sesiones vencidas sin diligenciar' })
  vencidas: number;

  @ApiProperty({ example: 1, description: 'Sesiones por vencer' })
  porVencer: number;

  @ApiProperty({
    example: 0,
    description: 'Vencidas de un período cerrado (RF-23, excepción p4)',
  })
  incumplidas: number;

  @ApiProperty({
    example: 12,
    nullable: true,
    type: Number,
    description: 'Días de atraso de la vencida más antigua',
  })
  mayorAtraso: number | null;
}

export class PeriodoCalendarioDto {
  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({
    example: '2026-08-03',
    format: 'date',
    nullable: true,
    type: String,
  })
  fechaInicio: string | null;

  @ApiProperty({
    example: '2026-11-21',
    format: 'date',
    nullable: true,
    type: String,
  })
  fechaFin: string | null;

  @ApiProperty({ example: 16, nullable: true, type: Number })
  numeroSemanas: number | null;

  @ApiProperty({ example: false })
  cerrado: boolean;
}

export class SemanaRecesoDto {
  @ApiProperty({ example: '2026-11-09', format: 'date', description: 'Lunes' })
  desde: string;

  @ApiProperty({ example: '2026-11-14', format: 'date', description: 'Sábado' })
  hasta: string;
}

export class CalendarioSesionesDto {
  @ApiProperty({ type: [SesionCalendarioDto] })
  elementos: SesionCalendarioDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 100 })
  tamano: number;

  @ApiProperty({ example: 48 })
  total: number;

  @ApiProperty({ type: PeriodoCalendarioDto })
  periodo: PeriodoCalendarioDto;

  @ApiProperty({ example: true })
  puedeEditar: boolean;

  @ApiProperty({
    type: [String],
    example: [],
    description:
      'Avisos para el usuario, por ejemplo un año del período sin festivos parametrizados ' +
      '(RF-19, excepción p3)',
  })
  advertencias: string[];

  @ApiProperty({
    example: '2026-11-07',
    format: 'date',
    description:
      'La fecha de hoy en la zona horaria de la institución (America/Bogota)',
  })
  hoy: string;

  @ApiProperty({
    example: 2,
    nullable: true,
    type: Number,
    description:
      'Umbral de «Por vencer» en días, del parámetro alerta_dias_anticipacion. Nulo si falta.',
  })
  umbralDias: number | null;

  @ApiProperty({
    type: ResumenAlertasDto,
    description: 'Alertas de todo el calendario, no solo de la página (RF-23)',
  })
  resumen: ResumenAlertasDto;

  @ApiProperty({
    type: [SemanaRecesoDto],
    description:
      'Semanas de receso del período: de lunes a sábado sin clase en la tabla de festivos. No ' +
      'tienen sesiones ni cuentan en la numeración de semanas (Acuerdo 46 de 2026).',
  })
  recesos: SemanaRecesoDto[];
}

export class ProyectoConPendientesDto {
  @ApiProperty({ example: 4 })
  idProyectoDocente: number;

  @ApiProperty({ example: 'Investigación de operaciones' })
  asignatura: string;

  @ApiProperty({ example: 'DEMO-03', nullable: true, type: String })
  codigoAsignatura: string | null;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  periodo: string | null;

  @ApiProperty({ example: 3 })
  vencidas: number;

  @ApiProperty({ example: 1 })
  porVencer: number;

  @ApiProperty({ example: 12, nullable: true, type: Number })
  mayorAtraso: number | null;
}

export class PendientesDocenteDto {
  @ApiProperty({ example: '2026-11-07', format: 'date' })
  hoy: string;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  umbralDias: number | null;

  @ApiProperty({
    example: 5,
    description:
      'Vencidas de todos sus proyectos con el período abierto (RF-23, p5)',
  })
  vencidas: number;

  @ApiProperty({ example: 1 })
  porVencer: number;

  @ApiProperty({
    type: [ProyectoConPendientesDto],
    description:
      'Proyectos con vencidas o por vencer, los más atrasados primero',
  })
  elementos: ProyectoConPendientesDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ example: 2, description: 'Proyectos con pendientes' })
  total: number;
}

export class ResultadoGeneracionDto {
  @ApiProperty({ example: 48, description: 'Sesiones nuevas o reactivadas' })
  creadas: number;

  @ApiProperty({
    example: 0,
    description:
      'Sesiones sin diligenciar a las que se les recalculó la semana o el festivo',
  })
  actualizadas: number;

  @ApiProperty({
    example: 0,
    description:
      'Sesiones sin diligenciar que ya no caen en el horario: se inactivan (estado «retirada») y ' +
      'salen del calendario',
  })
  retiradas: number;

  @ApiProperty({
    example: 0,
    description:
      'Sesiones diligenciadas o con datos del docente, que se dejan intactas',
  })
  conservadas: number;

  @ApiProperty({ example: 3, description: 'Sesiones marcadas como festivo' })
  festivos: number;

  @ApiProperty({
    example: 48,
    description: 'Sesiones del calendario después de generar',
  })
  total: number;

  @ApiProperty({ type: [String], example: [] })
  advertencias: string[];
}
