import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ConsultarProyectosDocentesDto } from '../../proyectos-docentes/dto/consultas.dto.js';
import { COLORES_SEMAFORO, type ColorSemaforo } from '../semaforo.js';

/* Tablero de seguimiento del diligenciamiento (RF-25, HU-12-01 y HU-12-02). Datos de los
   proyectos docentes: ninguna información de estudiantes. */

/** Filtros de RF-25, p2. Sin período, se usa el período activo más reciente. */
export class FiltrarSeguimientoDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El período académico no es válido.' })
  @Min(1, { message: 'El período académico no es válido.' })
  idPeriodo?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El programa no es válido.' })
  @Min(1, { message: 'El programa no es válido.' })
  idPrograma?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La asignatura no es válida.' })
  @Min(1, { message: 'La asignatura no es válida.' })
  idAsignatura?: number;

  @ApiPropertyOptional({ example: 3, description: 'Usuario docente asignado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El docente no es válido.' })
  @Min(1, { message: 'El docente no es válido.' })
  idDocente?: number;
}

/** Los filtros con paginación, para la consulta en pantalla. */
export class ConsultarSeguimientoDto extends IntersectionType(
  FiltrarSeguimientoDto,
  ConsultarProyectosDocentesDto,
) {}

export class OpcionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administración Industrial' })
  nombre: string;
}

export class AsignaturaOpcionSeguimientoDto extends OpcionDto {
  @ApiProperty({ example: 1, nullable: true, type: Number })
  idPrograma: number | null;
}

export class PeriodoOpcionSeguimientoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2026-2' })
  codigo: string;

  @ApiProperty({ example: true, description: 'Período activo y sin cerrar' })
  vigente: boolean;
}

/** Opciones de los filtros, según el alcance del usuario (RF-25, p2). */
export class FiltrosSeguimientoDto {
  @ApiProperty({ type: [OpcionDto] })
  programas: OpcionDto[];

  @ApiProperty({
    type: [PeriodoOpcionSeguimientoDto],
    description: 'Del más reciente al más antiguo',
  })
  periodos: PeriodoOpcionSeguimientoDto[];

  @ApiProperty({
    type: [AsignaturaOpcionSeguimientoDto],
    description:
      'Asignaturas con proyectos docentes en los programas del usuario',
  })
  asignaturas: AsignaturaOpcionSeguimientoDto[];

  @ApiProperty({
    type: [OpcionDto],
    description: 'Docentes asignados a proyectos de los programas del usuario',
  })
  docentes: OpcionDto[];
}

export class EstadoProyectoSeguimientoDto {
  @ApiProperty({ example: 'en_diligenciamiento' })
  codigo: string;

  @ApiProperty({ example: 'En diligenciamiento' })
  nombre: string;
}

export class SeccionesSeguimientoDto {
  @ApiProperty({ example: 4 })
  completas: number;

  @ApiProperty({ example: 6 })
  total: number;

  @ApiProperty({ example: 66.67, description: 'Con dos decimales' })
  porcentaje: number;

  @ApiProperty({
    type: [String],
    example: ['2. Descripción', '7. Bibliografía'],
    description: 'Secciones incompletas, con la numeración del formato',
  })
  incompletas: string[];
}

export class SesionesSeguimientoDto {
  @ApiProperty({
    example: 32,
    description: 'Sesiones del calendario sin contar festivos ni retiradas',
  })
  programadas: number;

  @ApiProperty({
    example: 10,
    description: 'Programadas que el docente ya registró (RF-20)',
  })
  registradas: number;

  @ApiProperty({ example: 3, description: 'Vencidas sin registrar (RF-23)' })
  vencidas: number;

  @ApiProperty({
    example: 0,
    description: 'Vencidas en un período ya cerrado (RF-23, excepción de p4)',
  })
  incumplidas: number;

  @ApiProperty({
    example: 1,
    description: 'Por vencer dentro del umbral de alerta',
  })
  porVencer: number;

  @ApiProperty({
    example: 12,
    nullable: true,
    type: Number,
    description: 'Días de atraso de la vencida más antigua',
  })
  mayorAtraso: number | null;
}

export class EvidenciasRapDto {
  @ApiProperty({ example: 2 })
  idRap: number;

  @ApiProperty({ example: 'RAP 2' })
  rap: string;

  @ApiProperty({
    example: 3,
    description: 'Evidencias cargadas para el RAP en el curso',
  })
  cantidad: number;
}

/** Un proyecto docente en el tablero (RF-25, p3 y p4). */
export class ProyectoSeguimientoDto {
  @ApiProperty({ example: 13 })
  idProyecto: number;

  @ApiProperty({ example: 'Finanzas a corto plazo' })
  asignatura: string;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({
    example: 'Administración Industrial',
    nullable: true,
    type: String,
  })
  programa: string | null;

  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  periodo: string | null;

  @ApiProperty({
    type: [String],
    example: ['Docente Demo'],
    description: 'El responsable va primero',
  })
  docentes: string[];

  @ApiProperty({ type: EstadoProyectoSeguimientoDto, nullable: true })
  estado: EstadoProyectoSeguimientoDto | null;

  @ApiProperty({ type: SeccionesSeguimientoDto })
  secciones: SeccionesSeguimientoDto;

  @ApiProperty({ type: SesionesSeguimientoDto })
  sesiones: SesionesSeguimientoDto;

  @ApiProperty({ type: [EvidenciasRapDto] })
  evidencias: EvidenciasRapDto[];

  @ApiProperty({ enum: COLORES_SEMAFORO })
  color: ColorSemaforo;

  @ApiProperty({ example: '3 sesiones vencidas sin registrar.' })
  motivoColor: string;
}

export class ResumenSeguimientoDto {
  @ApiProperty({ example: 24 })
  proyectos: number;

  @ApiProperty({ example: 3 })
  rojo: number;

  @ApiProperty({ example: 12 })
  amarillo: number;

  @ApiProperty({ example: 9 })
  verde: number;

  @ApiProperty({
    example: 15,
    description: 'Proyectos con pendientes (HU-12-02)',
  })
  conPendientes: number;
}

export class PeriodoSeguimientoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2026-2' })
  codigo: string;
}

export class PaginaSeguimientoDto {
  @ApiProperty({
    type: PeriodoSeguimientoDto,
    nullable: true,
    description: 'Período consultado; nulo si no hay ninguno registrado',
  })
  periodo: PeriodoSeguimientoDto | null;

  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  generado: string;

  @ApiProperty({ type: ResumenSeguimientoDto })
  resumen: ResumenSeguimientoDto;

  @ApiProperty({ type: [ProyectoSeguimientoDto] })
  elementos: ProyectoSeguimientoDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 50 })
  tamano: number;

  @ApiProperty({ example: 24, description: 'Proyectos de la lista consultada' })
  total: number;
}
