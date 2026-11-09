import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ESTADO_SECCION, type EstadoSeccion } from '../entities/secciones.js';
import { EstadoProyectoDto, RapDto } from './respuestas.dto.js';

/*
 * Diligenciamiento del proyecto docente (HU-06-01 a HU-06-03 y HU-06-08): resumen de
 * secciones, punto 2 «Descripción» (RF-11) y punto 3 «Resultados de aprendizaje del curso»
 * (RF-12).
 */

/**
 * Tope técnico del cuerpo de la descripción, por encima del que se configura en
 * `parametro_sistema` (RF-11, p3). Protege la columna `text` (64 KB en utf8mb4).
 */
export const DESCRIPCION_TOPE_TECNICO = 16_000;
export const RAC_CODIGO_MAXIMO = 30;
export const RAC_ENUNCIADO_MAXIMO = 2000;
export const CONTRIBUCION_MAXIMO = 1000;
/** Un programa tiene pocos RAP (Administración Industrial, siete). */
export const RAP_POR_RAC_MAXIMO = 20;

function recortar({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Saltos de línea de Windows a `\n`, para que el conteo coincida con el del navegador. */
function normalizarSaltos({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value;
}

/** Contribución opcional: una cadena vacía equivale a no describirla. */
function normalizarContribucion({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const texto = value.trim();
  return texto === '' ? undefined : texto;
}

// ---------------------------------------------------------------- Entradas

export class GuardarDescripcionDto {
  @ApiProperty({
    example:
      'El curso presenta las herramientas de planeación financiera de corto plazo…',
    description:
      'Texto del punto 2. Conserva los saltos de línea. Una cadena vacía borra la ' +
      'descripción (el progreso parcial se permite, HU-06-08). La longitud máxima la define ' +
      'el parámetro `descripcion_curso_longitud_maxima`.',
  })
  @Transform(normalizarSaltos)
  @IsString({ message: 'La descripción debe ser un texto.' })
  @MaxLength(DESCRIPCION_TOPE_TECNICO, {
    message: 'La descripción supera la longitud máxima permitida.',
  })
  texto: string;
}

export class RapDelRacEntradaDto {
  @ApiProperty({
    example: 2,
    description: 'RAP seleccionado para el proyecto al que contribuye el RAC',
  })
  @IsInt({ message: 'Seleccione un RAP válido.' })
  @Min(1, { message: 'Seleccione un RAP válido.' })
  idRap: number;

  @ApiPropertyOptional({
    example: 'Aporta el análisis de liquidez que pide el RAP.',
    description: 'Cómo contribuye el RAC a este RAP (HU-06-03). Opcional.',
  })
  @IsOptional()
  @Transform(normalizarContribucion)
  @IsString({ message: 'La contribución debe ser un texto.' })
  @MaxLength(CONTRIBUCION_MAXIMO, {
    message: `La contribución no puede superar ${CONTRIBUCION_MAXIMO} caracteres.`,
  })
  descripcionContribucion?: string;
}

export class GuardarRacDto {
  @ApiProperty({ example: 'RAC 1', description: 'Código del RAC en el curso' })
  @Transform(recortar)
  @IsString({ message: 'Escriba el código del RAC.' })
  @IsNotEmpty({ message: 'Escriba el código del RAC.' })
  @MaxLength(RAC_CODIGO_MAXIMO, {
    message: `El código del RAC no puede superar ${RAC_CODIGO_MAXIMO} caracteres.`,
  })
  codigo: string;

  @ApiProperty({
    example:
      'Analiza la liquidez de una empresa a partir de sus estados financieros.',
    description: 'Enunciado del RAC',
  })
  @Transform(recortar)
  @IsString({ message: 'Escriba el enunciado del RAC.' })
  @IsNotEmpty({ message: 'Escriba el enunciado del RAC.' })
  @MaxLength(RAC_ENUNCIADO_MAXIMO, {
    message: `El enunciado del RAC no puede superar ${RAC_ENUNCIADO_MAXIMO} caracteres.`,
  })
  enunciado: string;

  @ApiProperty({
    type: [RapDelRacEntradaDto],
    description:
      'RAP del proyecto a los que contribuye. Al menos uno (RF-12, p3) y sin repetir ' +
      '(HU-06-03).',
  })
  @IsArray({ message: 'Asocie el RAC al menos a un RAP.' })
  @ArrayMinSize(1, { message: 'Asocie el RAC al menos a un RAP.' })
  @ArrayMaxSize(RAP_POR_RAC_MAXIMO, {
    message: 'El RAC tiene demasiados RAP asociados.',
  })
  @ValidateNested({ each: true })
  @Type(() => RapDelRacEntradaDto)
  raps: RapDelRacEntradaDto[];
}

// ---------------------------------------------------------------- Respuestas

export class SeccionResumenDto {
  @ApiProperty({
    example: 2,
    description: 'Número del punto en el formato FO-DO/PC-001',
  })
  numero: number;

  @ApiProperty({ example: 'descripcion' })
  clave: string;

  @ApiProperty({ example: 'Descripción' })
  titulo: string;

  @ApiProperty({ example: false })
  completa: boolean;

  @ApiProperty({
    enum: Object.values(ESTADO_SECCION),
    example: ESTADO_SECCION.incompleta,
    description:
      'HU-06-09: «completa» (sin pendientes), «incompleta» (tiene algo, pero le falta) o ' +
      '«vacia» (el docente no ha registrado nada)',
  })
  estado: EstadoSeccion;

  @ApiProperty({
    type: [String],
    example: ['Redacte la descripción del curso.'],
    description: 'Lo que le falta a la sección. Vacío si está completa.',
  })
  pendientes: string[];
}

export class CompletitudDto {
  @ApiProperty({ example: 4, description: 'Secciones completas' })
  completas: number;

  @ApiProperty({
    example: 6,
    description: 'Secciones del formato (puntos 2 a 7)',
  })
  total: number;

  @ApiProperty({
    example: 66.67,
    description:
      'Porcentaje de secciones completas, con dos decimales. Es la misma cuenta del tablero ' +
      'de seguimiento (RF-25).',
  })
  porcentaje: number;
}

export class DiligenciamientoDto {
  @ApiProperty({ example: 7 })
  idProyecto: number;

  @ApiProperty({ type: EstadoProyectoDto, nullable: true })
  estado: EstadoProyectoDto | null;

  @ApiProperty({
    example: true,
    description:
      'Si el usuario puede editar ahora: es docente asignado al proyecto y el estado lo ' +
      'permite (`estado_proyecto.permite_edicion`).',
  })
  puedeEditar: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: 'Por qué no puede editar, en lenguaje del usuario (RF-11, p4)',
  })
  motivoNoEditable: string | null;

  @ApiProperty({
    example: '2026-11-07T15:20:00.000Z',
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Última modificación del proyecto',
  })
  fechaActualizacion: string | null;

  @ApiProperty({
    type: [SeccionResumenDto],
    description: 'Secciones en el orden del formato',
  })
  secciones: SeccionResumenDto[];

  @ApiProperty({
    type: CompletitudDto,
    description: 'HU-06-09: cuántas secciones están completas',
  })
  completitud: CompletitudDto;
}

export class DescripcionDto {
  @ApiProperty({ nullable: true, type: String })
  texto: string | null;

  @ApiProperty({
    example: 4000,
    description: 'Caracteres máximos permitidos (parámetro del sistema)',
  })
  longitudMaxima: number;

  @ApiProperty({
    example: '2026-11-07T15:20:00.000Z',
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Última modificación del proyecto',
  })
  fechaActualizacion: string | null;
}

export class RapDelRacDto {
  @ApiProperty({ example: 2 })
  idRap: number;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({ nullable: true, type: String })
  descripcionContribucion: string | null;
}

export class RacDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiProperty({ example: 'RAC 1' })
  codigo: string;

  @ApiProperty({ example: 'Analiza la liquidez de una empresa…' })
  enunciado: string;

  @ApiProperty({ example: 1, nullable: true, type: Number })
  orden: number | null;

  @ApiProperty({
    type: [RapDelRacDto],
    description: 'RAP a los que contribuye',
  })
  raps: RapDelRacDto[];
}

export class GrupoRacDto {
  @ApiProperty({ type: RapDto, description: 'RAP con su enunciado completo' })
  rap: RapDto;

  @ApiProperty({
    type: [RacDto],
    description:
      'RAC que contribuyen a este RAP. Un RAC asociado a varios RAP aparece en cada grupo.',
  })
  racs: RacDto[];
}

export class SeccionRacDto {
  @ApiProperty({
    type: [GrupoRacDto],
    description: 'Un grupo por RAP del proyecto, en orden',
  })
  grupos: GrupoRacDto[];

  @ApiProperty({
    type: [Number],
    example: [3],
    description: 'RAP que todavía no tienen RAC (RF-12, p5)',
  })
  rapsSinRac: number[];
}
