import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ConsultarProyectosDocentesDto } from '../../proyectos-docentes/dto/consultas.dto.js';

/** Galería de evidencias (p6): paginada y, normalmente, de un solo RAP. */
export class ConsultarEvidenciasDto extends ConsultarProyectosDocentesDto {
  @ApiPropertyOptional({
    example: 2,
    description:
      'Solo las evidencias de este RAP. Sin él, todas las que el usuario puede ver.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El RAP seleccionado no es válido.' })
  @Min(1, { message: 'El RAP seleccionado no es válido.' })
  idRap?: number;
}
