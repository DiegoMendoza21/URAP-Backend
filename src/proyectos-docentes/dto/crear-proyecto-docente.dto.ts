import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** El formato FO-DO/PC-001 admite hasta tres docentes por proyecto (HU-05-03). */
export const MAXIMO_DOCENTES = 3;

export class DocenteAsignadoDto {
  @ApiProperty({
    example: 12,
    description: 'Usuario con el rol Docente responsable',
  })
  @IsInt({ message: 'Cada docente debe indicar un usuario válido.' })
  @Min(1, { message: 'Cada docente debe indicar un usuario válido.' })
  idUsuario: number;

  @ApiProperty({
    example: true,
    description:
      'Si es el docente responsable: quien diligencia el proyecto y firma «elaboró». ' +
      'Debe haber exactamente uno.',
  })
  @IsBoolean({ message: 'Indique si cada docente es el responsable.' })
  responsable: boolean;
}

/** Recorte de espacios; una cadena vacía equivale a no indicar el grupo. */
function normalizarGrupo({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const grupo = value.trim();
  return grupo === '' ? undefined : grupo;
}

export class CrearProyectoDocenteDto {
  @ApiProperty({ example: 3, description: 'Asignatura del proyecto (paso 2)' })
  @IsInt({ message: 'Seleccione la asignatura.' })
  @Min(1, { message: 'Seleccione la asignatura.' })
  idAsignatura: number;

  @ApiProperty({
    type: [Number],
    example: [1, 3],
    description:
      'RAP del programa a los que contribuye la asignatura (paso 3). Al menos uno (RF-08, p4).',
  })
  @IsArray({ message: 'Seleccione al menos un RAP.' })
  @ArrayMinSize(1, { message: 'Seleccione al menos un RAP.' })
  @ArrayUnique({ message: 'Un RAP no puede seleccionarse dos veces.' })
  @IsInt({ each: true, message: 'Los RAP seleccionados no son válidos.' })
  idsRap: number[];

  @ApiProperty({
    type: [DocenteAsignadoDto],
    description: `De 1 a ${MAXIMO_DOCENTES} docentes, con un único responsable (HU-05-03).`,
  })
  @IsArray({ message: 'Asigne al menos un docente.' })
  @ArrayMinSize(1, { message: 'Asigne al menos un docente.' })
  @ArrayMaxSize(MAXIMO_DOCENTES, {
    message: `Se pueden asignar como máximo ${MAXIMO_DOCENTES} docentes.`,
  })
  @ValidateNested({ each: true })
  @Type(() => DocenteAsignadoDto)
  docentes: DocenteAsignadoDto[];

  @ApiPropertyOptional({
    example: 'A',
    description: 'Grupo del curso, si la asignatura tiene varios en el período',
  })
  @IsOptional()
  @Transform(normalizarGrupo)
  @IsString({ message: 'El grupo debe ser un texto.' })
  @MaxLength(20, { message: 'El grupo no puede superar 20 caracteres.' })
  grupo?: string;
}
