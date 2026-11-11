import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
} from '../auditoria.service.js';

export const TAMANO_PAGINA_POR_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;

/** Recorta espacios; una cadena vacía cuenta como no indicada. */
function recortar({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const texto = value.trim();
  return texto === '' ? undefined : texto;
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros de la consulta de auditoría (HU-14-02; RF-29, p4): usuario, fecha, acción y entidad. */
export class ConsultarAuditoriaDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser 1 o mayor.' })
  pagina: number = 1;

  @ApiPropertyOptional({
    example: TAMANO_PAGINA_POR_DEFECTO,
    default: TAMANO_PAGINA_POR_DEFECTO,
    maximum: TAMANO_PAGINA_MAXIMO,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de página debe ser 1 o mayor.' })
  @Max(TAMANO_PAGINA_MAXIMO, {
    message: `El tamaño de página no puede superar ${TAMANO_PAGINA_MAXIMO}.`,
  })
  tamano: number = TAMANO_PAGINA_POR_DEFECTO;

  @ApiPropertyOptional({
    example: '2026-11-01',
    format: 'date',
    description:
      'Primer día del rango (AAAA-MM-DD), en la hora de la institución (America/Bogota)',
  })
  @IsOptional()
  @Transform(recortar)
  @Matches(PATRON_FECHA, {
    message: 'Indique la fecha inicial con el formato AAAA-MM-DD.',
  })
  @IsISO8601({ strict: true }, { message: 'La fecha inicial no es válida.' })
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-11-20',
    format: 'date',
    description: 'Último día del rango (AAAA-MM-DD), incluido',
  })
  @IsOptional()
  @Transform(recortar)
  @Matches(PATRON_FECHA, {
    message: 'Indique la fecha final con el formato AAAA-MM-DD.',
  })
  @IsISO8601({ strict: true }, { message: 'La fecha final no es válida.' })
  hasta?: string;

  @ApiPropertyOptional({
    example: 'Demo',
    description:
      'Texto que debe aparecer en el nombre, los apellidos o el correo de quien hizo la acción',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El usuario debe ser un texto.' })
  @MaxLength(100, {
    message: 'El texto del usuario no puede superar 100 caracteres.',
  })
  usuario?: string;

  @ApiPropertyOptional({ enum: ACCIONES_AUDITORIA })
  @IsOptional()
  @Transform(recortar)
  @IsIn(ACCIONES_AUDITORIA, {
    message:
      'La acción debe ser crear, actualizar, eliminar, aprobar o consulta_sensible.',
  })
  accion?: AccionAuditoria;

  @ApiPropertyOptional({
    example: 'proyecto_docente',
    description: 'Código de la entidad afectada, como llega en cada registro',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La entidad debe ser un texto.' })
  @Matches(/^[a-z0-9_]{1,64}$/, {
    message: 'La entidad indicada no es válida.',
  })
  entidad?: string;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Identificador del registro afectado. Junto con la entidad da el historial completo de ese registro (HU-14-03)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'El identificador del registro debe ser un número entero.',
  })
  @Min(1, { message: 'El identificador del registro debe ser 1 o mayor.' })
  idRegistro?: number;
}
