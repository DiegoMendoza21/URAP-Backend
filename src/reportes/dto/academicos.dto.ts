import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  EstadoProyectoSeguimientoDto,
  FiltrarSeguimientoDto,
  PeriodoSeguimientoDto,
  ProyectoSeguimientoDto,
} from './seguimiento.dto.js';

/* Reportes académicos (RF-28): cumplimiento por período (HU-12-03) y contribución de los RAC
   a los RAP (HU-12-05). Datos de los proyectos docentes: ninguna información de estudiantes. */

/** RF-28, p2: los filtros del tablero más el estado del proyecto. */
export class ConsultarCumplimientoDto extends FiltrarSeguimientoDto {
  @ApiPropertyOptional({
    example: 'aprobado',
    description: 'Código del estado del proyecto docente',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString({ message: 'El estado no es válido.' })
  @MaxLength(50, { message: 'El estado no es válido.' })
  estado?: string;
}

export class CantidadPorEstadoDto extends EstadoProyectoSeguimientoDto {
  @ApiProperty({ example: 12 })
  cantidad: number;
}

/** Indicadores del conjunto de proyectos del reporte. */
export class ResumenCumplimientoDto {
  @ApiProperty({ example: 24 })
  proyectos: number;

  @ApiProperty({
    type: [CantidadPorEstadoDto],
    description: 'Proyectos por estado, en el orden del ciclo del proyecto',
  })
  porEstado: CantidadPorEstadoDto[];

  @ApiProperty({
    example: 98,
    description: 'Secciones completas, sumando todos los proyectos',
  })
  seccionesCompletas: number;

  @ApiProperty({ example: 144 })
  seccionesTotales: number;

  @ApiProperty({ example: 68.06, nullable: true, type: Number })
  porcentajeSecciones: number | null;

  @ApiProperty({ example: 180 })
  sesionesRegistradas: number;

  @ApiProperty({ example: 420 })
  sesionesProgramadas: number;

  @ApiProperty({ example: 42.86, nullable: true, type: Number })
  porcentajeSesiones: number | null;

  @ApiProperty({
    example: 15,
    description: 'Proyectos con secciones o sesiones pendientes',
  })
  conPendientes: number;
}

export class ReporteCumplimientoDto {
  @ApiProperty({ type: PeriodoSeguimientoDto, nullable: true })
  periodo: PeriodoSeguimientoDto | null;

  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  generado: string;

  @ApiProperty({ type: ResumenCumplimientoDto })
  resumen: ResumenCumplimientoDto;

  @ApiProperty({
    type: [ProyectoSeguimientoDto],
    description:
      'Vacío si no hay proyectos para los filtros (RF-28, excepción de p3)',
  })
  proyectos: ProyectoSeguimientoDto[];
}

/** HU-12-05: RAP y período; sin RAP, todos los que el usuario puede consultar. */
export class ConsultarContribucionDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El período académico no es válido.' })
  @Min(1, { message: 'El período académico no es válido.' })
  idPeriodo?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El RAP no es válido.' })
  @Min(1, { message: 'El RAP no es válido.' })
  idRap?: number;
}

export class RacContribucionDto {
  @ApiProperty({ example: 'RAC 1', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ nullable: true, type: String })
  descripcion: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Cómo contribuye el RAC al RAP (`rac_rap.descripcion_contribucion`)',
  })
  contribucion: string | null;
}

export class AsignaturaContribucionDto {
  @ApiProperty({ example: 13 })
  idProyecto: number;

  @ApiProperty({ example: 'Finanzas a corto plazo' })
  asignatura: string;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ type: [String], example: ['Docente Demo'] })
  docentes: string[];

  @ApiProperty({ type: EstadoProyectoSeguimientoDto, nullable: true })
  estado: EstadoProyectoSeguimientoDto | null;

  @ApiProperty({
    type: [RacContribucionDto],
    description: 'RAC del curso asociados al RAP; vacío si todavía no tiene',
  })
  racs: RacContribucionDto[];

  @ApiProperty({
    example: 3,
    description: 'Evidencias del curso cargadas para el RAP',
  })
  evidencias: number;

  @ApiProperty({
    example: '2026-10-12T15:30:00.000Z',
    nullable: true,
    type: String,
    description: 'Fecha de la evidencia más reciente',
  })
  ultimaEvidencia: string | null;
}

export class RapContribucionDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({ nullable: true, type: String })
  descripcion: string | null;

  @ApiProperty({
    type: [AsignaturaContribucionDto],
    description: 'Cursos del período que contribuyen al RAP; vacío si ninguno',
  })
  asignaturas: AsignaturaContribucionDto[];
}

export class ReporteContribucionDto {
  @ApiProperty({ type: PeriodoSeguimientoDto, nullable: true })
  periodo: PeriodoSeguimientoDto | null;

  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  generado: string;

  @ApiProperty({
    type: [RapContribucionDto],
    description:
      'Solo los RAP que el usuario puede consultar: el líder RAP, los que lidera en el período',
  })
  raps: RapContribucionDto[];
}
