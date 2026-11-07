import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const DESCRIPCION_MAXIMA = 1000;

/** Texto recortado; un campo vacío del formulario cuenta como no enviado. */
const recortar = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const texto = value.trim();
  return texto === '' ? undefined : texto;
};

/**
 * Campos de texto del formulario multipart de RF-24, p3. Los archivos no llegan en el cuerpo:
 * los recibe y limita `ArchivosEvidenciaInterceptor` y quedan en `req.files`.
 */
export class CargarEvidenciasDto {
  @ApiProperty({
    example: 2,
    description: 'RAP del proyecto al que corresponde (p2)',
  })
  @Type(() => Number)
  @IsInt({ message: 'Seleccione el RAP al que corresponde la evidencia.' })
  @Min(1, { message: 'Seleccione el RAP al que corresponde la evidencia.' })
  idRap: number;

  @ApiProperty({
    example: 'Exposición de los grupos sobre el estudio de métodos.',
    maxLength: DESCRIPCION_MAXIMA,
  })
  // Vacía o ausente queda en '': así el único error es el de IsNotEmpty.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : (value ?? ''),
  )
  @IsString({ message: 'Escriba la descripción de la evidencia.' })
  @IsNotEmpty({ message: 'Escriba la descripción de la evidencia.' })
  @MaxLength(DESCRIPCION_MAXIMA, {
    message: `La descripción no puede superar ${DESCRIPCION_MAXIMA} caracteres.`,
  })
  descripcion: string;

  @ApiProperty({
    example: '2026-09-14',
    format: 'date',
    description: 'Día en que se tomó la evidencia (AAAA-MM-DD)',
  })
  @Transform(recortar)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Indique la fecha de la evidencia (AAAA-MM-DD).',
  })
  @IsISO8601(
    { strict: true },
    { message: 'Indique una fecha de evidencia válida.' },
  )
  fecha: string;

  @ApiPropertyOptional({
    example: 31,
    description: 'Sesión de clase relacionada, si corresponde',
  })
  @Transform(({ value }: { value: unknown }) => {
    const texto = recortar({ value });
    return typeof texto === 'string' ? Number(texto) : texto;
  })
  @IsOptional()
  @IsInt({ message: 'La sesión seleccionada no es válida.' })
  @Min(1, { message: 'La sesión seleccionada no es válida.' })
  idSesion?: number;
}

/** El formulario completo, con los archivos, solo para documentarlo en OpenAPI. */
export class FormularioCargaEvidenciasDto extends CargarEvidenciasDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description:
      'Uno o varios archivos (JPG, PNG o PDF según `evidencia_tipos_permitidos`), cada uno ' +
      'hasta el tamaño de `archivo_tamano_maximo_mb`.',
  })
  archivos: unknown[];
}
