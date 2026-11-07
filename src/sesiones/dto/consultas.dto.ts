import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Un curso tiene a lo sumo 6 sesiones por semana: con 16 semanas son 96. Por eso la página por
 * defecto trae el calendario completo, sin dejar de ser un listado paginado (CLAUDE.md).
 */
export const TAMANO_CALENDARIO_POR_DEFECTO = 100;
export const TAMANO_CALENDARIO_MAXIMO = 200;

export class ConsultarCalendarioDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser 1 o mayor.' })
  pagina: number = 1;

  @ApiPropertyOptional({
    example: TAMANO_CALENDARIO_POR_DEFECTO,
    default: TAMANO_CALENDARIO_POR_DEFECTO,
    maximum: TAMANO_CALENDARIO_MAXIMO,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de página debe ser 1 o mayor.' })
  @Max(TAMANO_CALENDARIO_MAXIMO, {
    message: `El tamaño de página no puede superar ${TAMANO_CALENDARIO_MAXIMO}.`,
  })
  tamano: number = TAMANO_CALENDARIO_POR_DEFECTO;
}
