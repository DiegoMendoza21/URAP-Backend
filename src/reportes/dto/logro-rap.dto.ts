import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import {
  PERIODO_TOMA,
  type PeriodoToma,
  TIPO_VALORACION,
  type TipoValoracion,
} from '../../mediciones/constantes.js';

/* Reporte de logro de los RAP del programa (RF-32, HU-11-08). Solo datos agregados: ninguna
   valoración individual de estudiantes (Ley 1581 de 2012). */

export class ConsultarLogroRapDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Seleccione el programa.' })
  @Min(1, { message: 'Seleccione el programa.' })
  idPrograma: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Seleccione el período académico.' })
  @Min(1, { message: 'Seleccione el período académico.' })
  idPeriodo: number;

  @ApiPropertyOptional({ example: 2, description: 'Solo este RAP' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El RAP no es válido.' })
  @Min(1, { message: 'El RAP no es válido.' })
  idRap?: number;
}

export class RapOpcionReporteDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;
}

export class ProgramaOpcionReporteDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administración Industrial' })
  nombre: string;

  @ApiProperty({
    type: [RapOpcionReporteDto],
    description: 'RAP del programa que el usuario puede consultar',
  })
  raps: RapOpcionReporteDto[];
}

export class PeriodoOpcionReporteDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2026-2' })
  codigo: string;
}

export class FiltrosLogroRapDto {
  @ApiProperty({ type: [ProgramaOpcionReporteDto] })
  programas: ProgramaOpcionReporteDto[];

  @ApiProperty({
    type: [PeriodoOpcionReporteDto],
    description: 'Del más reciente al más antiguo',
  })
  periodos: PeriodoOpcionReporteDto[];
}

export class IndicadorReporteDto {
  @ApiProperty({ example: 1, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({
    example: 'Taller de análisis financiero',
    nullable: true,
    type: String,
  })
  instrumento: string | null;

  @ApiProperty({ example: 34 })
  muestra: number;

  @ApiProperty({ example: 85.29, nullable: true, type: Number })
  porcentajeCumplimiento: number | null;
}

/** Una asignatura (medición cerrada) que evaluó el RAP en el período. */
export class AsignaturaEvaluadaDto {
  @ApiProperty({ example: 8 })
  idMedicion: number;

  @ApiProperty({ example: 'Finanzas a corto plazo' })
  asignatura: string;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ type: [String], example: ['Docente Demo'] })
  docentes: string[];

  @ApiProperty({ enum: Object.values(TIPO_VALORACION) })
  tipoValoracion: TipoValoracion;

  @ApiProperty({ enum: Object.values(PERIODO_TOMA) })
  periodoToma: PeriodoToma;

  @ApiProperty({ example: 2026 })
  anioToma: number;

  @ApiProperty({ example: 34 })
  tamanoMuestra: number;

  @ApiProperty({
    example: 63.97,
    nullable: true,
    type: Number,
    description:
      'Porcentaje en los niveles de cumplimiento (promedio de los indicadores)',
  })
  porcentajeCumplimiento: number | null;

  @ApiProperty({ example: null, nullable: true, type: Number })
  porcentajeEsperado: number | null;

  @ApiProperty({ example: null, nullable: true, type: Boolean })
  alcanzado: boolean | null;

  @ApiProperty({ type: [IndicadorReporteDto] })
  indicadores: IndicadorReporteDto[];

  @ApiProperty({ nullable: true, type: String })
  accionesImplementadas: string | null;

  @ApiProperty({ nullable: true, type: String })
  resultadosObtenidos: string | null;

  @ApiProperty({ nullable: true, type: String })
  accionesPropuestas: string | null;
}

export class ComparacionPeriodoDto {
  @ApiProperty({ example: '2026-1' })
  periodo: string;

  @ApiProperty({ example: 70.5 })
  porcentajeCumplimiento: number;

  @ApiProperty({
    example: 2,
    description: 'Mediciones cerradas que lo componen',
  })
  mediciones: number;
}

export class RapReporteDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({ nullable: true, type: String })
  descripcion: string | null;

  @ApiProperty({
    example: true,
    description:
      'Falso: no tiene mediciones cerradas en el período y se presenta como no evaluado ' +
      '(RF-32, excepción de p2)',
  })
  evaluado: boolean;

  @ApiProperty({ type: [AsignaturaEvaluadaDto] })
  asignaturas: AsignaturaEvaluadaDto[];

  @ApiProperty({
    example: 63.97,
    nullable: true,
    type: Number,
    description: 'Promedio de las asignaturas que lo evaluaron en el período',
  })
  porcentajeCumplimiento: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description:
      'Porcentaje esperado vigente del programa; nulo si no lo ha definido',
  })
  porcentajeEsperado: number | null;

  @ApiProperty({ example: null, nullable: true, type: Boolean })
  alcanzado: boolean | null;

  @ApiProperty({
    type: [ComparacionPeriodoDto],
    description:
      'Períodos anteriores con mediciones cerradas, del más antiguo al más reciente',
  })
  comparacion: ComparacionPeriodoDto[];

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Por qué no hay comparación con períodos anteriores (RF-32, excepción de p4); nulo si la hay',
  })
  motivoSinComparacion: string | null;
}

export class ProgramaReporteDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administración Industrial' })
  nombre: string;
}

export class ReporteLogroRapDto {
  @ApiProperty({ type: ProgramaReporteDto })
  programa: ProgramaReporteDto;

  @ApiProperty({ type: PeriodoOpcionReporteDto })
  periodo: PeriodoOpcionReporteDto;

  @ApiProperty({ example: '2026-11-20T15:30:00.000Z' })
  generado: string;

  @ApiProperty({ example: false })
  metaDefinida: boolean;

  @ApiProperty({ type: [RapReporteDto] })
  raps: RapReporteDto[];
}
