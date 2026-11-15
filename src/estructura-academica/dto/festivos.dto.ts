import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * De dónde sale un día sin clase (DBML, `dia_festivo.origen`): de la Ley 51 de 1983, de la
 * Universidad (receso, día cívico) o de un ajuste puntual del administrador.
 */
export const ORIGENES_FESTIVO = [
  'ley',
  'institucional',
  'ajuste_manual',
] as const;
export type OrigenFestivo = (typeof ORIGENES_FESTIVO)[number];

/** Años que se pueden administrar: los de la Universidad que el sistema va a ver. */
export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2100;
export const NOMBRE_FESTIVO_MAXIMO = 255;

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function recortar({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ConsultarFestivosDto {
  @ApiProperty({ example: 2026, minimum: ANIO_MINIMO, maximum: ANIO_MAXIMO })
  @Type(() => Number)
  @IsInt({ message: 'El año debe ser un número entero.' })
  @Min(ANIO_MINIMO, { message: `El año debe ser ${ANIO_MINIMO} o posterior.` })
  @Max(ANIO_MAXIMO, { message: `El año debe ser ${ANIO_MAXIMO} o anterior.` })
  anio: number;
}

export class CargarFestivosLeyDto extends ConsultarFestivosDto {}

export class CrearFestivoDto {
  @ApiProperty({ example: '2026-10-09', format: 'date' })
  @Transform(recortar)
  @Matches(PATRON_FECHA, {
    message: 'Indique la fecha con el formato AAAA-MM-DD.',
  })
  @IsISO8601({ strict: true }, { message: 'La fecha no es válida.' })
  fecha: string;

  @ApiProperty({ example: 'Día cívico institucional', maxLength: 255 })
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser un texto.' })
  @IsNotEmpty({ message: 'Escriba el nombre del día sin clase.' })
  @MaxLength(NOMBRE_FESTIVO_MAXIMO, {
    message: `El nombre no puede superar ${NOMBRE_FESTIVO_MAXIMO} caracteres.`,
  })
  nombre: string;

  @ApiPropertyOptional({
    enum: ORIGENES_FESTIVO,
    default: 'institucional',
    description:
      'ley: festivo nacional. institucional: día no hábil de la Universidad (receso, día cívico). ' +
      'ajuste_manual: corrección puntual.',
  })
  @IsOptional()
  @IsIn(ORIGENES_FESTIVO, {
    message: 'El origen del día sin clase no es válido.',
  })
  origen?: OrigenFestivo;
}

export class EditarFestivoDto {
  @ApiPropertyOptional({ example: '2026-10-09', format: 'date' })
  @IsOptional()
  @Transform(recortar)
  @Matches(PATRON_FECHA, {
    message: 'Indique la fecha con el formato AAAA-MM-DD.',
  })
  @IsISO8601({ strict: true }, { message: 'La fecha no es válida.' })
  fecha?: string;

  @ApiPropertyOptional({ example: 'Día cívico institucional', maxLength: 255 })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El nombre debe ser un texto.' })
  @IsNotEmpty({ message: 'Escriba el nombre del día sin clase.' })
  @MaxLength(NOMBRE_FESTIVO_MAXIMO, {
    message: `El nombre no puede superar ${NOMBRE_FESTIVO_MAXIMO} caracteres.`,
  })
  nombre?: string;

  @ApiPropertyOptional({ enum: ORIGENES_FESTIVO })
  @IsOptional()
  @IsIn(ORIGENES_FESTIVO, {
    message: 'El origen del día sin clase no es válido.',
  })
  origen?: OrigenFestivo;
}

export class EliminarFestivoDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Confirma quitar un día que ya marca sesiones de algún calendario. Sin ella, responde 409.',
  })
  @IsOptional()
  // Llega en la consulta como texto: «false» no debe leerse como verdadero.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'La confirmación debe ser sí o no.' })
  confirmar?: boolean;
}

export class FestivoDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: '2026-08-07', format: 'date' })
  fecha: string;

  @ApiProperty({ example: 'Batalla de Boyacá' })
  nombre: string;

  @ApiProperty({ enum: ORIGENES_FESTIVO, nullable: true, example: 'ley' })
  origen: string | null;

  @ApiProperty({
    example: 4,
    description: 'Sesiones de los calendarios que caen ese día (RF-19, p4)',
  })
  sesiones: number;
}

export class ListaFestivosDto {
  @ApiProperty({ example: 2026 })
  anio: number;

  @ApiProperty({
    type: [FestivoDto],
    description:
      'Los días sin clase del año, por fecha. Un año tiene pocas decenas: no se pagina.',
  })
  elementos: FestivoDto[];

  @ApiProperty({
    example: 18,
    description: 'Cuántos festivos de ley hay ese año según la Ley 51 de 1983',
  })
  festivosDeLey: number;

  @ApiProperty({
    example: 0,
    description:
      'Festivos de ley del año que todavía no están en la tabla. Si es mayor que cero, se pueden cargar.',
  })
  faltantesDeLey: number;
}

export class ResultadoFestivoDto {
  @ApiProperty({ type: FestivoDto, nullable: true })
  festivo: FestivoDto | null;

  @ApiProperty({
    example: 3,
    description:
      'Calendarios de períodos abiertos que se recalcularon (RF-19, excepción p5). Las sesiones ' +
      'ya diligenciadas no se tocan.',
  })
  calendariosRecalculados: number;
}

export class ResultadoCargaLeyDto {
  @ApiProperty({ example: 2027 })
  anio: number;

  @ApiProperty({ example: 18, description: 'Festivos de ley que se agregaron' })
  creados: number;

  @ApiProperty({
    example: 0,
    description:
      'Fechas que ya estaban en la tabla: se conservan como están, con su nombre y su origen',
  })
  existentes: number;

  @ApiProperty({ example: 0 })
  calendariosRecalculados: number;
}
