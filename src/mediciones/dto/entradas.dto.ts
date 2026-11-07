import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ANIO_TOMA_MAXIMO,
  ANIO_TOMA_MINIMO,
  INSTRUMENTO_LONGITUD_MAXIMA,
  PERIODO_TOMA,
  type PeriodoToma,
  TEXTO_LARGO_MAXIMO,
  TIPO_VALORACION,
  type TipoValoracion,
  VALORACIONES_POR_GUARDADO_MAXIMO,
} from '../constantes.js';

/** Recorta los espacios de un texto; uno vacío equivale a no indicarlo. */
export function textoOpcional({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const texto = value.trim();
  return texto === '' ? null : texto;
}

/** RF-30, p1 y p2 (HU-11-01): con qué se identifica la medición. */
export class IniciarMedicionDto {
  @ApiProperty({
    example: 2,
    description: 'RAP a evaluar: uno de los RAP del proyecto docente',
  })
  @IsInt({ message: 'Seleccione el RAP a evaluar.' })
  @Min(1, { message: 'Seleccione el RAP a evaluar.' })
  idRap: number;

  @ApiProperty({ enum: Object.values(TIPO_VALORACION) })
  @IsIn(Object.values(TIPO_VALORACION), {
    message: 'El tipo de valoración debe ser formativa o sumativa.',
  })
  tipoValoracion: TipoValoracion;

  @ApiProperty({
    enum: Object.values(PERIODO_TOMA),
    description: 'Período del año en que se tomaron los datos',
  })
  @IsIn(Object.values(PERIODO_TOMA), {
    message: 'El período de toma de datos debe ser el primero o el segundo.',
  })
  periodoToma: PeriodoToma;

  @ApiProperty({ example: 2026, description: 'Año de toma de datos' })
  @IsInt({ message: 'Indique el año de toma de datos.' })
  @Min(ANIO_TOMA_MINIMO, {
    message: `El año de toma de datos debe estar entre ${ANIO_TOMA_MINIMO} y ${ANIO_TOMA_MAXIMO}.`,
  })
  @Max(ANIO_TOMA_MAXIMO, {
    message: `El año de toma de datos debe estar entre ${ANIO_TOMA_MINIMO} y ${ANIO_TOMA_MAXIMO}.`,
  })
  anioToma: number;

  @ApiPropertyOptional({
    example: 34,
    nullable: true,
    type: Number,
    description:
      'Tamaño de la cohorte, si el docente lo conoce. Ningún porcentaje lo usa: si no se ' +
      'registra, el consolidado toma el tamaño de la muestra y lo advierte (RF-31, p3).',
  })
  @IsOptional()
  @IsInt({ message: 'El tamaño de la cohorte debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de la cohorte debe ser mayor que cero.' })
  @Max(10_000, { message: 'El tamaño de la cohorte no es válido.' })
  tamanoCohorte?: number | null;
}

/** RF-30, p4 (HU-11-02): el instrumento con que se evaluó un indicador. */
export class InstrumentoIndicadorDto {
  @ApiProperty({
    example: 7,
    description: 'Indicador de desempeño de la rúbrica de la medición',
  })
  @IsInt({ message: 'Indique el indicador.' })
  @Min(1, { message: 'Indique el indicador.' })
  idIndicador: number;

  @ApiProperty({ example: 'Taller de análisis financiero' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Escriba el instrumento de evaluación.' })
  @MinLength(1, { message: 'Escriba el instrumento de evaluación.' })
  @MaxLength(INSTRUMENTO_LONGITUD_MAXIMA, {
    message: `El instrumento admite hasta ${INSTRUMENTO_LONGITUD_MAXIMA} caracteres.`,
  })
  instrumento: string;

  @ApiPropertyOptional({
    example: 'Caso práctico sobre el capital de trabajo de una empresa local.',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(textoOpcional)
  @IsString({ message: 'La descripción del instrumento debe ser un texto.' })
  @MaxLength(TEXTO_LARGO_MAXIMO, {
    message: `La descripción del instrumento admite hasta ${TEXTO_LARGO_MAXIMO} caracteres.`,
  })
  descripcionInstrumento?: string | null;
}

export class RegistrarInstrumentosDto {
  @ApiProperty({ type: [InstrumentoIndicadorDto] })
  @IsArray({ message: 'Indique los instrumentos de evaluación.' })
  @ArrayMinSize(1, { message: 'Indique al menos un instrumento.' })
  @ArrayMaxSize(50, { message: 'Hay demasiados indicadores.' })
  @ValidateNested({ each: true })
  @Type(() => InstrumentoIndicadorDto)
  indicadores: InstrumentoIndicadorDto[];
}

/** RF-30, p6 (HU-11-03): el nivel de un estudiante en un indicador. */
export class ValoracionDto {
  @ApiProperty({
    example: 41,
    description: 'Matrícula del estudiante en el curso',
  })
  @IsInt({ message: 'Indique el estudiante.' })
  @Min(1, { message: 'Indique el estudiante.' })
  idMatricula: number;

  @ApiProperty({ example: 7, description: 'Indicador de desempeño' })
  @IsInt({ message: 'Indique el indicador.' })
  @Min(1, { message: 'Indique el indicador.' })
  idIndicador: number;

  @ApiProperty({
    example: 3,
    nullable: true,
    type: Number,
    description:
      'Valor del nivel en la escala del programa (1 a 4 en Administración Industrial). ' +
      'Nulo deja al estudiante sin valorar en ese indicador.',
  })
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt({ message: 'El nivel debe ser un número de la escala.' })
  valor: number | null;
}

export class RegistrarValoracionesDto {
  @ApiProperty({ type: [ValoracionDto] })
  @IsArray({ message: 'Indique las valoraciones.' })
  @ArrayMinSize(1, { message: 'Indique al menos una valoración.' })
  @ArrayMaxSize(VALORACIONES_POR_GUARDADO_MAXIMO, {
    message: `Se pueden guardar hasta ${VALORACIONES_POR_GUARDADO_MAXIMO} valoraciones a la vez.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ValoracionDto)
  valoraciones: ValoracionDto[];
}
