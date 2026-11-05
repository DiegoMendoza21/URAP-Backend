import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Forma única de toda respuesta de error de la API. Es parte del contrato con el frontend. */
export class RespuestaErrorDto {
  @ApiProperty({ example: 404, description: 'Código de estado HTTP' })
  estado: number;

  @ApiProperty({
    example: 'No encontrado',
    description: 'Nombre del tipo de error',
  })
  error: string;

  @ApiProperty({
    example: 'El recurso solicitado no existe.',
    description: 'Mensaje en español, apto para mostrarlo al usuario',
  })
  mensaje: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['El correo institucional no es válido.'],
    description: 'Detalle por campo cuando los datos enviados no son válidos',
  })
  detalles?: string[];

  @ApiProperty({ example: '/api/usuarios/15' })
  ruta: string;

  @ApiProperty({ example: '2026-11-03T21:15:00.000Z' })
  fecha: string;
}
