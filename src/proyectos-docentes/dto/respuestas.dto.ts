import { ApiProperty } from '@nestjs/swagger';

/* Respuestas del asistente (RF-08) y de la consulta de proyectos docentes. */

export class ProgramaOpcionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administración Industrial' })
  nombre: string;

  @ApiProperty({
    example: 'Facultad de Ciencias Económicas',
    nullable: true,
    type: String,
  })
  facultad: string | null;
}

export class AsignaturaOpcionDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 'DEMO-01', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 'Finanzas a corto plazo' })
  nombre: string;

  @ApiProperty({ example: 6, nullable: true, type: Number })
  semestre: number | null;
}

export class DocenteOpcionDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Ana María', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Pérez Gómez', nullable: true, type: String })
  apellidos: string | null;

  @ApiProperty({ example: 'docente@unicartagena.edu.co' })
  correo: string;
}

export class AsignaturaRequisitoDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'DEMO-02', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 'Gestión de la producción' })
  nombre: string;
}

export class PeriodoAcademicoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2026-2' })
  codigo: string;

  @ApiProperty({
    example: '2026-08-03',
    nullable: true,
    type: String,
    format: 'date',
  })
  fechaInicio: string | null;

  @ApiProperty({
    example: '2026-11-21',
    nullable: true,
    type: String,
    format: 'date',
  })
  fechaFin: string | null;

  @ApiProperty({ example: 16, nullable: true, type: Number })
  numeroSemanas: number | null;
}

export class RapDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Enunciado completo del RAP',
  })
  descripcion: string | null;
}

export class RapOpcionDto extends RapDto {
  @ApiProperty({
    example: true,
    description:
      'Si el mapeo curricular (asignatura_rap) ya relaciona la asignatura con este RAP. ' +
      'El asistente lo propone seleccionado, pero el usuario decide.',
  })
  mapeado: boolean;
}

/**
 * Información institucional que el sistema completa a partir de la asignatura y del período
 * (RF-08, p5; HU-05-02). Es el punto 1 del formato FO-DO/PC-001.
 */
export class InformacionInstitucionalDto {
  @ApiProperty({
    example: 'Facultad de Ciencias Económicas',
    nullable: true,
    type: String,
  })
  facultad: string | null;

  @ApiProperty({
    example: 'Administración Industrial',
    nullable: true,
    type: String,
  })
  programa: string | null;

  @ApiProperty({ example: 3 })
  idAsignatura: number;

  @ApiProperty({ example: 'DEMO-01', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({
    example: 'Finanzas a corto plazo',
    nullable: true,
    type: String,
  })
  asignatura: string | null;

  @ApiProperty({ example: 6, nullable: true, type: Number })
  semestre: number | null;

  @ApiProperty({ example: 'PROFESIONAL', nullable: true, type: String })
  componente: string | null;

  @ApiProperty({ example: 'Obligatorio', nullable: true, type: String })
  tipoCurso: string | null;

  @ApiProperty({ example: 3, nullable: true, type: Number })
  creditos: number | null;

  @ApiProperty({
    example: 48,
    nullable: true,
    type: Number,
    description: 'Horas TDE',
  })
  horasTde: number | null;

  @ApiProperty({
    example: 0,
    nullable: true,
    type: Number,
    description: 'Horas TDP',
  })
  horasTdp: number | null;

  @ApiProperty({
    example: 96,
    nullable: true,
    type: Number,
    description: 'Horas TI',
  })
  horasTi: number | null;

  @ApiProperty({ example: 144, nullable: true, type: Number })
  horasTotales: number | null;

  @ApiProperty({ type: [AsignaturaRequisitoDto] })
  prerrequisitos: AsignaturaRequisitoDto[];

  @ApiProperty({ type: [AsignaturaRequisitoDto] })
  correquisitos: AsignaturaRequisitoDto[];

  @ApiProperty({
    example: false,
    description:
      'RF-08, p7: la asignatura no tiene registrados los créditos o alguna de las horas. ' +
      'Se calcula a partir de la asignatura, así que desaparece cuando se completan.',
  })
  informacionIncompleta: boolean;

  @ApiProperty({
    type: [String],
    example: [],
    description:
      'Datos que faltan, para mostrarlos al usuario (p. ej. «horas TDE»)',
  })
  camposFaltantes: string[];
}

export class InformacionAsignaturaDto {
  @ApiProperty({ type: InformacionInstitucionalDto })
  informacion: InformacionInstitucionalDto;

  @ApiProperty({
    type: PeriodoAcademicoDto,
    nullable: true,
    description:
      'Período académico vigente, en el que se crea el proyecto. Nulo si no hay ninguno ' +
      'activo: en ese caso no se puede crear el proyecto (precondición de RF-08).',
  })
  periodo: PeriodoAcademicoDto | null;

  @ApiProperty({
    type: [RapOpcionDto],
    description:
      'RAP activos del programa, para el paso 3. Vacío si el programa no tiene catálogo.',
  })
  raps: RapOpcionDto[];
}

export class EstadoProyectoDto {
  @ApiProperty({ example: 'en_diligenciamiento' })
  codigo: string;

  @ApiProperty({ example: 'En diligenciamiento' })
  nombre: string;
}

export class DocenteProyectoDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Ana María', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Pérez Gómez', nullable: true, type: String })
  apellidos: string | null;

  @ApiProperty({
    example: true,
    description:
      'Docente responsable: diligencia el proyecto y firma «elaboró»',
  })
  responsable: boolean;
}

export class ProyectoDocenteResumenDto {
  @ApiProperty({ example: 41 })
  id: number;

  @ApiProperty({ example: 3 })
  idAsignatura: number;

  @ApiProperty({ example: 'DEMO-01', nullable: true, type: String })
  codigoAsignatura: string | null;

  @ApiProperty({
    example: 'Finanzas a corto plazo',
    nullable: true,
    type: String,
  })
  asignatura: string | null;

  @ApiProperty({
    example: 'Administración Industrial',
    nullable: true,
    type: String,
  })
  programa: string | null;

  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  periodo: string | null;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ type: EstadoProyectoDto, nullable: true })
  estado: EstadoProyectoDto | null;

  @ApiProperty({
    type: [DocenteProyectoDto],
    description: 'Docentes asignados, con el responsable primero',
  })
  docentes: DocenteProyectoDto[];

  @ApiProperty({ example: false, description: 'RF-08, p7' })
  informacionIncompleta: boolean;

  @ApiProperty({
    example: '2026-11-06T14:00:00.000Z',
    nullable: true,
    type: String,
  })
  fechaCreacion: string | null;
}

export class ProyectoDocenteDetalleDto extends ProyectoDocenteResumenDto {
  @ApiProperty({
    example: 'manual',
    nullable: true,
    type: String,
    description: 'manual | duplicado | importado_excel',
  })
  origen: string | null;

  @ApiProperty({ type: PeriodoAcademicoDto, nullable: true })
  periodoAcademico: PeriodoAcademicoDto | null;

  @ApiProperty({ type: InformacionInstitucionalDto })
  informacion: InformacionInstitucionalDto;

  @ApiProperty({
    type: [RapDto],
    description: 'RAP a los que contribuye el curso (paso 3)',
  })
  raps: RapDto[];
}

export class PaginaProyectosDocentesDto {
  @ApiProperty({ type: [ProyectoDocenteResumenDto] })
  elementos: ProyectoDocenteResumenDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({
    example: 42,
    description: 'Total de proyectos visibles para el usuario',
  })
  total: number;
}

export class ProyectoExistenteDto {
  @ApiProperty({
    type: ProyectoDocenteResumenDto,
    nullable: true,
    description:
      'Proyecto ya creado para la misma asignatura, período vigente y grupo (RF-08, p6), ' +
      'o nulo si no hay ninguno.',
  })
  proyecto: ProyectoDocenteResumenDto | null;
}
