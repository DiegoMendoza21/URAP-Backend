import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  LONGITUD_MAXIMA_VALOR,
  TIPOS_PARAMETRO,
  type TipoParametro,
} from '../reglas-parametros.js';

/** Tope de elementos de una lista: muy por encima de lo que cabe en el valor. */
export const ELEMENTOS_MAXIMOS = 100;

/**
 * HU-03-07: el valor nuevo de un parámetro. Un parámetro entero o de sí/no recibe `valor`; uno
 * de tipo lista, `elementos`. Las reglas de cada parámetro (rango, elementos repetidos, tipos de
 * archivo) las valida el servicio.
 */
export class CambiarParametroDto {
  @ApiPropertyOptional({
    example: '3',
    description:
      'Para los parámetros de tipo entero (el número, en texto) y de sí/no («si» o «no»).',
    maxLength: LONGITUD_MAXIMA_VALOR,
  })
  @IsOptional()
  @IsString({ message: 'El valor debe ser un texto.' })
  @MaxLength(LONGITUD_MAXIMA_VALOR, {
    message: `El valor no puede superar los ${LONGITUD_MAXIMA_VALOR} caracteres.`,
  })
  valor?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['jpg', 'png', 'pdf'],
    description:
      'Para los parámetros de tipo lista: sus elementos, en el orden en que deben quedar.',
    maxItems: ELEMENTOS_MAXIMOS,
  })
  @IsOptional()
  @IsArray({ message: 'Los elementos deben enviarse como una lista.' })
  @ArrayMaxSize(ELEMENTOS_MAXIMOS, {
    message: `La lista no puede tener más de ${ELEMENTOS_MAXIMOS} elementos.`,
  })
  @IsString({ each: true, message: 'Cada elemento debe ser un texto.' })
  @MaxLength(LONGITUD_MAXIMA_VALOR, {
    each: true,
    message: `Cada elemento puede tener hasta ${LONGITUD_MAXIMA_VALOR} caracteres.`,
  })
  elementos?: string[];
}

export class ParametroDto {
  @ApiProperty({ example: 'alerta_dias_anticipacion' })
  clave: string;

  @ApiProperty({ enum: TIPOS_PARAMETRO, example: 'entero' })
  tipoDato: TipoParametro;

  @ApiProperty({
    example: '2',
    nullable: true,
    type: String,
    description:
      'El valor tal como está guardado: el número, «si» o «no», o los elementos separados por ' +
      'coma. `null` si el parámetro todavía no está en la base (falta sembrar los datos base).',
  })
  valor: string | null;

  @ApiProperty({
    type: [String],
    example: [],
    description:
      'Los elementos del valor, si el parámetro es una lista; si no, vacío.',
  })
  elementos: string[];

  @ApiProperty({
    example:
      'Días antes del vencimiento en que una sesión se marca «Por vencer».',
    nullable: true,
    type: String,
  })
  descripcion: string | null;

  @ApiProperty({
    example: 0,
    nullable: true,
    type: Number,
    description: 'Valor mínimo, si el parámetro es un entero.',
  })
  minimo: number | null;

  @ApiProperty({
    example: 365,
    nullable: true,
    type: Number,
    description: 'Valor máximo, si el parámetro es un entero.',
  })
  maximo: number | null;

  @ApiProperty({
    example: false,
    description:
      'Si el parámetro es una lista, si puede quedar sin elementos; si no, `false`.',
  })
  admiteVacia: boolean;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: null,
    description:
      'Si el parámetro es una lista cerrada, los únicos elementos que admite.',
  })
  elementosPermitidos: string[] | null;

  @ApiProperty({
    example: '2026-11-10T15:20:00.000Z',
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Cuándo se guardó el valor por última vez.',
  })
  actualizadoEn: string | null;

  @ApiProperty({
    example: 'Administrador Demostración',
    nullable: true,
    type: String,
    description:
      'Quién lo cambió por última vez. `null` si conserva el valor inicial.',
  })
  actualizadoPor: string | null;
}

export class ListaParametrosDto {
  @ApiProperty({ type: [ParametroDto] })
  elementos: ParametroDto[];
}
