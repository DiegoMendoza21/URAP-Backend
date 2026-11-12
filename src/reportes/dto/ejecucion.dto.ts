import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import type { EstadoTema } from '../ejecucion-contenidos.js';
import {
  EstadoProyectoSeguimientoDto,
  PeriodoSeguimientoDto,
} from './seguimiento.dto.js';

/* Reporte de ejecución de contenidos (RF-28, HU-12-04): lo planeado en el punto 6 del proyecto
   docente frente a los temas marcados en las clases registradas. Sin datos de estudiantes. */

const ESTADOS_TEMA: EstadoTema[] = ['dictado', 'no_dictado', 'por_dictar'];

/** HU-12-04: período y asignatura; el programa, como en los demás reportes de RF-28. */
export class ConsultarEjecucionDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Sin período, el activo más reciente',
  })
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
}

export class TemaEjecucionDto {
  @ApiProperty({ example: 3, nullable: true, type: Number })
  semana: number | null;

  @ApiProperty({ example: 'Flujo de caja proyectado' })
  tema: string;

  @ApiProperty({
    enum: ESTADOS_TEMA,
    example: 'dictado',
    description:
      'dictado: se marcó en al menos una clase registrada. no_dictado: no se marcó y su ' +
      'semana ya terminó (su última sesión del calendario ya pasó). por_dictar: no se marcó ' +
      'y su semana todavía no termina; no cuenta como incumplimiento. La semana es la del ' +
      'calendario de RF-19, que no cuenta las semanas de receso.',
  })
  estado: EstadoTema;

  @ApiProperty({
    type: [String],
    example: ['2026-08-19'],
    description: 'Fechas de las clases en que se marcó el tema',
  })
  fechas: string[];
}

export class TemaAdicionalDto {
  @ApiProperty({ example: 'Charla de un invitado del sector' })
  tema: string;

  @ApiProperty({ type: [String], example: ['2026-09-02'] })
  fechas: string[];
}

export class CursoEjecucionDto {
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

  @ApiProperty({
    type: [String],
    example: ['Docente Demo'],
    description: 'El responsable va primero',
  })
  docentes: string[];

  @ApiProperty({ type: EstadoProyectoSeguimientoDto, nullable: true })
  estado: EstadoProyectoSeguimientoDto | null;

  @ApiProperty({
    example: 16,
    description: 'Semanas del contenido programático que tienen tema',
  })
  planeados: number;

  @ApiProperty({ example: 9 })
  dictados: number;

  @ApiProperty({ example: 2 })
  noDictados: number;

  @ApiProperty({ example: 5 })
  porDictar: number;

  @ApiProperty({
    example: 0,
    description:
      'Temas dictados fuera del contenido programático: los que el docente escribe como no ' +
      'planeados al registrar la clase (HU-08-05), sin repetir el mismo texto.',
  })
  adicionales: number;

  @ApiProperty({
    example: 56.25,
    nullable: true,
    type: Number,
    description: 'Dictados sobre planeados; nulo si no hay temas planeados',
  })
  porcentajeDictados: number | null;

  @ApiProperty({
    example: 32,
    description:
      'Sesiones vigentes del calendario del curso (RF-19); 0 si todavía no tiene calendario',
  })
  sesiones: number;

  @ApiProperty({
    example: 14,
    description:
      'Clases ya registradas (RF-20). Con 0, el reporte no puede saber qué se dictó: la ' +
      'pantalla lo dice en vez de presentarlo como incumplimiento.',
  })
  clasesRegistradas: number;

  @ApiProperty({ type: [TemaEjecucionDto] })
  temas: TemaEjecucionDto[];

  @ApiProperty({ type: [TemaAdicionalDto] })
  temasAdicionales: TemaAdicionalDto[];
}

export class ResumenEjecucionDto {
  @ApiProperty({ example: 12 })
  cursos: number;

  @ApiProperty({ example: 192 })
  planeados: number;

  @ApiProperty({ example: 110 })
  dictados: number;

  @ApiProperty({ example: 14 })
  noDictados: number;

  @ApiProperty({ example: 68 })
  porDictar: number;

  @ApiProperty({ example: 0 })
  adicionales: number;

  @ApiProperty({
    example: 57.29,
    nullable: true,
    type: Number,
    description:
      'Dictados sobre planeados, sumando todos los cursos; nulo si no hay temas planeados',
  })
  porcentajeDictados: number | null;
}

export class ReporteEjecucionDto {
  @ApiProperty({ type: PeriodoSeguimientoDto, nullable: true })
  periodo: PeriodoSeguimientoDto | null;

  @ApiProperty({ example: '2026-11-12T15:30:00.000Z' })
  generado: string;

  @ApiProperty({ type: ResumenEjecucionDto })
  resumen: ResumenEjecucionDto;

  @ApiProperty({
    type: [CursoEjecucionDto],
    description:
      'Vacío si no hay proyectos para los filtros (RF-28, excepción de p3)',
  })
  cursos: CursoEjecucionDto[];
}
