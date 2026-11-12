import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ConsultarProyectosDocentesDto } from '../../proyectos-docentes/dto/consultas.dto.js';
import { ESTADO_MATRICULA, type EstadoMatricula } from '../estados.js';

/** Orden de la lista: por apellidos o, primero, quienes más inasistencias tienen (HU-09-03). */
export const ORDEN_MATRICULADOS = ['apellidos', 'inasistencias'] as const;
export type OrdenMatriculados = (typeof ORDEN_MATRICULADOS)[number];

/** Misma paginación que la bandeja de proyectos, más el estado de la matrícula y el orden. */
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

  @ApiPropertyOptional({
    enum: ORDEN_MATRICULADOS,
    default: 'apellidos',
    description:
      'Por apellidos (por defecto) o por inasistencias, de más a menos; con el mismo número, ' +
      'por apellidos',
  })
  @IsOptional()
  @IsIn(ORDEN_MATRICULADOS, {
    message: 'El orden debe ser «apellidos» o «inasistencias».',
  })
  orden: OrdenMatriculados = 'apellidos';
}
