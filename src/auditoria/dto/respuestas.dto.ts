import { ApiProperty } from '@nestjs/swagger';
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
} from '../auditoria.service.js';
import { type EventoDeAuditoria, EVENTOS_DE_AUDITORIA } from '../eventos.js';

export class UsuarioAuditoriaDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'Usuario Demo' })
  nombre: string;
}

export class RegistroAuditoriaDto {
  @ApiProperty({ example: 1543 })
  id: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-11-10T15:04:05.000Z',
  })
  fecha: string | null;

  @ApiProperty({ enum: ACCIONES_AUDITORIA, example: 'aprobar' })
  accion: AccionAuditoria;

  @ApiProperty({
    enum: EVENTOS_DE_AUDITORIA,
    example: 'aprobacion',
    description:
      'Lo que pasó, con palabras del dominio: un inicio de sesión se guarda como la ' +
      'creación de una sesión, y aquí llega como inicio_sesion',
  })
  evento: EventoDeAuditoria;

  @ApiProperty({
    example: 'proyecto_docente',
    description: 'Código de la entidad afectada',
  })
  entidad: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 12,
    description:
      'Identificador del registro afectado; vacío si la acción no recae sobre uno solo',
  })
  idRegistro: number | null;

  @ApiProperty({
    type: UsuarioAuditoriaDto,
    nullable: true,
    description:
      'Quién hizo la acción; vacío si la hizo el sistema (por ejemplo, un bloqueo automático)',
  })
  usuario: UsuarioAuditoriaDto | null;

  @ApiProperty({ type: String, nullable: true, example: '190.0.2.15' })
  ip: string | null;

  @ApiProperty({
    type: [String],
    example: ['estado', 'fechaAprobacion'],
    description:
      'Nombres de los campos que guarda el registro en sus valores anterior y nuevo',
  })
  campos: string[];
}

export class PaginaAuditoriaDto {
  @ApiProperty({ type: [RegistroAuditoriaDto] })
  elementos: RegistroAuditoriaDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({
    example: 134,
    description: 'Registros que cumplen los filtros',
  })
  total: number;
}

/** HU-14-03: el registro con el valor anterior y el nuevo. */
export class DetalleAuditoriaDto extends RegistroAuditoriaDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { estado: 'enviado' },
    description:
      'Campos antes del cambio. Vacío cuando no aplica (una creación o una consulta). Nunca trae contraseñas ni tokens',
  })
  valorAnterior: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { estado: 'aprobado' },
    description:
      'Campos después del cambio. Vacío cuando no aplica (una eliminación o una consulta). Nunca trae contraseñas ni tokens',
  })
  valorNuevo: Record<string, unknown> | null;
}
