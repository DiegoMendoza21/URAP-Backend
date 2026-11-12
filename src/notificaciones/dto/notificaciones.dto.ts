import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const TAMANO_PAGINA_POR_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;

/** Qué notificaciones pide la bandeja: todas o solo las que el usuario no ha leído. */
export const FILTROS_NOTIFICACIONES = ['todas', 'no_leidas'] as const;
export type FiltroNotificaciones = (typeof FILTROS_NOTIFICACIONES)[number];

/** HU-13-01 y HU-13-03: consulta de la bandeja de notificaciones del usuario. */
export class ConsultarNotificacionesDto {
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
    enum: FILTROS_NOTIFICACIONES,
    default: 'todas',
    description:
      'Con «no_leidas», solo las que el usuario todavía no ha abierto',
  })
  @IsOptional()
  @IsIn(FILTROS_NOTIFICACIONES, {
    message: 'El filtro debe ser «todas» o «no_leidas».',
  })
  filtro: FiltroNotificaciones = 'todas';
}

export class NotificacionDto {
  @ApiProperty({ example: 315 })
  id: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'proyecto_devuelto',
    description: 'Código del tipo de notificación (`tipo_notificacion.codigo`)',
  })
  tipo: string | null;

  @ApiProperty({ example: 'Proyecto docente devuelto con observaciones' })
  titulo: string;

  @ApiProperty({
    example:
      'El departamento académico devolvió el proyecto docente de Mercados (2026-2) con 2 observaciones.',
  })
  mensaje: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/proyectos-docentes/12/diligenciar',
    description:
      'Ruta del frontend que abre lo que originó el aviso (RF-26, poscondición); vacía si no hay a dónde ir',
  })
  urlDestino: string | null;

  @ApiProperty({ example: false })
  leida: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T15:04:05.000Z',
  })
  fecha: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Cuándo la abrió el usuario; vacía mientras no la haya leído',
  })
  fechaLectura: string | null;
}

export class PaginaNotificacionesDto {
  @ApiProperty({ type: [NotificacionDto] })
  elementos: NotificacionDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: TAMANO_PAGINA_POR_DEFECTO })
  tamano: number;

  @ApiProperty({ example: 3 })
  total: number;
}

export class ContadorNotificacionesDto {
  @ApiProperty({
    example: 2,
    description: 'Notificaciones del usuario que todavía no ha leído',
  })
  noLeidas: number;
}

export class NotificacionesMarcadasDto {
  @ApiProperty({
    example: 2,
    description: 'Cuántas notificaciones pasaron a leídas con esta petición',
  })
  marcadas: number;
}
