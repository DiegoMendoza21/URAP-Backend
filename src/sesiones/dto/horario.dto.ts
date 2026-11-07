import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DIA_SEMANA_MAXIMO,
  DIA_SEMANA_MINIMO,
  PATRON_HORA,
} from '../calendario.js';

/* Entrada de HU-08-02: días y horas de clase del curso (RF-19). */

export class BloqueHorarioEntradaDto {
  @ApiProperty({
    example: 1,
    minimum: DIA_SEMANA_MINIMO,
    maximum: DIA_SEMANA_MAXIMO,
    description: 'Día de la semana: 1 = lunes … 6 = sábado',
  })
  @IsInt({ message: 'Elija un día de la semana de lunes a sábado.' })
  @Min(DIA_SEMANA_MINIMO, {
    message: 'Elija un día de la semana de lunes a sábado.',
  })
  @Max(DIA_SEMANA_MAXIMO, {
    message: 'Elija un día de la semana de lunes a sábado.',
  })
  diaSemana: number;

  @ApiProperty({ example: '07:00', description: 'Hora de inicio, HH:mm' })
  @IsString({ message: 'Indique la hora de inicio de la clase.' })
  @Matches(PATRON_HORA, {
    message: 'La hora de inicio debe tener la forma HH:mm, por ejemplo 07:00.',
  })
  horaInicio: string;

  @ApiProperty({ example: '09:00', description: 'Hora de fin, HH:mm' })
  @IsString({ message: 'Indique la hora de fin de la clase.' })
  @Matches(PATRON_HORA, {
    message: 'La hora de fin debe tener la forma HH:mm, por ejemplo 09:00.',
  })
  horaFin: string;
}

export class GuardarHorarioDto {
  @ApiProperty({
    type: [BloqueHorarioEntradaDto],
    description:
      'Uno o varios días de clase, cada uno con su hora de inicio y de fin. Un día no se ' +
      'repite: el calendario tiene una sesión por fecha.',
  })
  @IsArray({ message: 'Agregue al menos un día de clase.' })
  @ArrayMinSize(1, { message: 'Agregue al menos un día de clase.' })
  @ArrayMaxSize(DIA_SEMANA_MAXIMO, {
    message: `Se pueden definir como máximo ${DIA_SEMANA_MAXIMO} días de clase.`,
  })
  @ValidateNested({ each: true })
  @Type(() => BloqueHorarioEntradaDto)
  bloques: BloqueHorarioEntradaDto[];
}
