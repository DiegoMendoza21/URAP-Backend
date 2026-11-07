import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  TAMANO_PAGINA_MAXIMO,
  TAMANO_PAGINA_POR_DEFECTO,
} from '../../proyectos-docentes/dto/consultas.dto.js';
import { ESTADO_MATRICULA, type EstadoMatricula } from '../estados.js';

export class ConsultarMatriculadosDto {
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
    enum: Object.values(ESTADO_MATRICULA),
    default: ESTADO_MATRICULA.matriculado,
    description:
      'Matriculados (por defecto) o retirados: los que estaban en una carga anterior y no en la última',
  })
  @IsOptional()
  @IsIn(Object.values(ESTADO_MATRICULA), {
    message: 'El estado debe ser «matriculado» o «retirado».',
  })
  estado: EstadoMatricula = ESTADO_MATRICULA.matriculado;
}
