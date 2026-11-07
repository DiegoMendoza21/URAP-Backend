import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ConsultarProyectosDocentesDto } from '../../proyectos-docentes/dto/consultas.dto.js';
import { ESTADO_MATRICULA, type EstadoMatricula } from '../estados.js';

/** Misma paginación que la bandeja de proyectos, más el estado de la matrícula. */
export class ConsultarMatriculadosDto extends ConsultarProyectosDocentesDto {
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
