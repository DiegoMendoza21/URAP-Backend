import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** RF-26, HU-13-04: un tipo de notificación con su configuración. */
export class TipoNotificacionDto {
  @ApiProperty({ example: 'sesion_vencida' })
  codigo: string;

  @ApiProperty({ example: 'Sesión vencida' })
  nombre: string;

  @ApiProperty({
    description: 'Si está apagado, el sistema deja de generar este aviso',
  })
  activo: boolean;

  @ApiProperty({
    description:
      'Si el aviso sale también por correo. Se guarda desde ya; el envío llega con el servicio de correo institucional (ACT-07)',
  })
  enviaEmail: boolean;
}

export class ConfiguracionNotificacionesDto {
  @ApiProperty({ type: [TipoNotificacionDto] })
  tipos: TipoNotificacionDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 7,
    description:
      'Cada cuántos días se recuerdan las sesiones pendientes (`recordatorio_sesiones_dias`). Se cambia en `PATCH /parametros/recordatorio_sesiones_dias`. Vacío si el parámetro falta o es inválido',
  })
  recordatorioSesionesDias: number | null;
}

/** Lo que se cambia de un tipo. Lo que no llega queda como está. */
export class ActualizarTipoNotificacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'Indique si el tipo de notificación está activo.' })
  activo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'Indique si el aviso se envía también por correo.' })
  enviaEmail?: boolean;
}
