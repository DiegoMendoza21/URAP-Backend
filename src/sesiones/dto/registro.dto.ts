import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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
} from 'class-validator';
import { SesionCalendarioDto } from './respuestas.dto.js';

/* Registro de la clase (RF-20, HU-08-04) y de los estudiantes ausentes (RF-22, HU-09-02). */

/** Tope de las observaciones de la sesión: la columna es `text`, pero se escriben desde el teléfono. */
export const OBSERVACIONES_MAXIMO = 2000;

export const MENSAJE_SIN_TEMAS =
  'Seleccione al menos un tema del contenido programático.';

function recortar({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegistrarSesionDto {
  @ApiProperty({
    type: [Number],
    example: [12, 13],
    description:
      'Temas desarrollados en la sesión: semanas del contenido programático (punto 6) con su ' +
      'tema (RF-20, p4). Al menos uno.',
  })
  @IsArray({ message: MENSAJE_SIN_TEMAS })
  @ArrayMinSize(1, { message: MENSAJE_SIN_TEMAS })
  @ArrayMaxSize(100, {
    message: 'Se pueden seleccionar como máximo 100 temas.',
  })
  @ArrayUnique({ message: 'Un tema no puede seleccionarse dos veces.' })
  @IsInt({ each: true, message: 'Los temas seleccionados no son válidos.' })
  @Min(1, { each: true, message: 'Los temas seleccionados no son válidos.' })
  idsContenido: number[];

  @ApiPropertyOptional({
    type: [Number],
    example: [101],
    default: [],
    description:
      'Matrículas de los estudiantes que no asistieron (RF-22, p4). Vacío si asistieron todos ' +
      'o si el curso no tiene lista cargada.',
  })
  @IsOptional()
  @IsArray({ message: 'Los estudiantes ausentes no son válidos.' })
  @ArrayMaxSize(1000, {
    message: 'Se pueden marcar como máximo 1000 estudiantes.',
  })
  @ArrayUnique({ message: 'Un estudiante no puede marcarse dos veces.' })
  @IsInt({ each: true, message: 'Los estudiantes ausentes no son válidos.' })
  @Min(1, { each: true, message: 'Los estudiantes ausentes no son válidos.' })
  ausentes: number[] = [];

  @ApiPropertyOptional({
    example: 'Se hizo un taller en grupos.',
    maxLength: OBSERVACIONES_MAXIMO,
    description:
      'Observaciones de la sesión (RF-20, p5; RF-22, p5). Si el curso no tiene lista cargada, ' +
      'aquí se anota la inasistencia en texto libre (RF-22, excepción p3). Sin el campo se ' +
      'conservan las anteriores; un texto vacío las borra.',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'Las observaciones deben ser un texto.' })
  @MaxLength(OBSERVACIONES_MAXIMO, {
    message: `Las observaciones no pueden superar ${OBSERVACIONES_MAXIMO} caracteres.`,
  })
  observaciones?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Confirma que no asistió ningún estudiante del grupo (RF-22, excepción p6). Sin esta ' +
      'confirmación, marcar a todo el grupo responde 409.',
  })
  @IsOptional()
  @IsBoolean({ message: 'Indique si confirma que faltó todo el grupo.' })
  confirmarTodoElGrupo?: boolean;
}

export class TemaContenidoDto {
  @ApiProperty({ example: 12, description: 'Fila del contenido programático' })
  idContenido: number;

  @ApiProperty({ example: 3 })
  semana: number;

  @ApiProperty({ example: 'Programación lineal: método gráfico' })
  tema: string;

  @ApiProperty({
    example: true,
    description: 'Es el tema previsto para la semana de la sesión',
  })
  previsto: boolean;

  @ApiProperty({
    example: false,
    description: 'Ya está registrado en la sesión',
  })
  seleccionado: boolean;
}

export class EstudianteSesionDto {
  @ApiProperty({ example: 101 })
  idMatricula: number;

  @ApiProperty({ example: 'Estudiante', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Ficticio Uno', nullable: true, type: String })
  apellidos: string | null;

  @ApiProperty({ example: false, description: 'No asistió a la sesión' })
  ausente: boolean;

  @ApiProperty({
    example: false,
    description:
      'Ya no está matriculado; solo aparece si quedó marcado como ausente antes de retirarse',
  })
  retirado: boolean;
}

export class AsistenciaSesionDto {
  @ApiProperty({
    example: true,
    description:
      'Si el curso tiene lista de matriculados. Sin lista, la inasistencia se anota en las ' +
      'observaciones (RF-22, excepción p3).',
  })
  listaCargada: boolean;

  @ApiProperty({
    example: 30,
    description: 'Estudiantes matriculados hoy en el curso',
  })
  totalMatriculados: number;

  @ApiProperty({
    type: [EstudianteSesionDto],
    description: 'Los matriculados del curso, por apellidos',
  })
  estudiantes: EstudianteSesionDto[];
}

export class RegistroSesionDto {
  @ApiProperty({ example: '2026-11-04T19:30:00.000Z', format: 'date-time' })
  fecha: string;

  @ApiProperty({ example: 'Docente Demo', nullable: true, type: String })
  registradoPor: string | null;
}

export class DetalleSesionDto {
  @ApiProperty({ example: 4 })
  idProyectoDocente: number;

  @ApiProperty({
    example: 'Investigación de operaciones',
    nullable: true,
    type: String,
  })
  asignatura: string | null;

  @ApiProperty({ type: SesionCalendarioDto })
  sesion: SesionCalendarioDto;

  @ApiProperty({
    example: true,
    description: 'Si el usuario puede registrar o corregir la sesión ahora',
  })
  puedeRegistrar: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description:
      'Por qué no se puede registrar, para quien sí registra clases: fecha futura, período ' +
      'cerrado, proyecto sin aprobar, sesión de otro tipo o sin contenido programático',
  })
  motivoNoRegistrable: string | null;

  @ApiProperty({
    type: [TemaContenidoDto],
    description:
      'Temas del contenido programático del proyecto (RF-20, p3), por semana. El previsto para ' +
      'la semana de la sesión va marcado.',
  })
  temas: TemaContenidoDto[];

  @ApiProperty({
    example: 3,
    description: 'Número de ausentes de la sesión (RF-22, p6)',
  })
  numeroAusentes: number;

  @ApiProperty({
    type: AsistenciaSesionDto,
    nullable: true,
    description:
      'Lista del curso con los ausentes marcados. Nula para quien no puede ver datos ' +
      'personales: solo el docente asignado y el administrador (Ley 1581 de 2012).',
  })
  asistencia: AsistenciaSesionDto | null;

  @ApiProperty({
    example: 'Se hizo un taller en grupos.',
    nullable: true,
    type: String,
    description:
      'Observaciones de la sesión. Pueden nombrar estudiantes, así que se reservan como la lista.',
  })
  observaciones: string | null;

  @ApiProperty({ type: RegistroSesionDto, nullable: true })
  registro: RegistroSesionDto | null;
}
