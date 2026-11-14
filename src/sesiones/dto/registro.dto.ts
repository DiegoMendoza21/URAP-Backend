import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SesionCalendarioDto } from './respuestas.dto.js';

/* Registro de la clase (RF-20, HU-08-04) y de los estudiantes ausentes (RF-22, HU-09-02). */

/** RF-21: largo de la descripción de un parcial o una actividad; la columna es varchar(255). */
export const DESCRIPCION_SESION_MAXIMO = 255;

/** Tope de las observaciones de la sesión: la columna es `text`, pero se escriben desde el teléfono. */
export const OBSERVACIONES_MAXIMO = 2000;

export const MENSAJE_SIN_TEMAS =
  'Seleccione al menos un tema del contenido programático o escriba un tema no planeado.';

/** HU-08-05: largo de cada tema no planeado; la columna `tema_adicional` es varchar(255). */
export const TEMA_ADICIONAL_MAXIMO = 200;
/** Temas no planeados por clase: se escriben desde el teléfono, saliendo del salón. */
export const TEMAS_ADICIONALES_MAXIMO = 10;
export const MENSAJE_TEMA_ADICIONAL_VACIO =
  'Un tema no planeado no puede quedar vacío: escríbalo o quítelo.';

function recortar({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Recorta cada texto de la lista y deja un solo espacio entre palabras. */
function recortarLista({ value }: { value: unknown }): unknown {
  return Array.isArray(value)
    ? value.map((texto: unknown) =>
        typeof texto === 'string' ? texto.trim().replace(/\s+/g, ' ') : texto,
      )
    : value;
}

export class RegistrarSesionDto {
  @ApiProperty({
    type: [Number],
    example: [12, 13],
    description:
      'Temas desarrollados en la sesión: semanas del contenido programático (punto 6) con su ' +
      'tema (RF-20, p4). Puede ir vacío solo si la sesión lleva al menos un tema no planeado.',
  })
  @IsArray({ message: MENSAJE_SIN_TEMAS })
  @ArrayMaxSize(100, {
    message: 'Se pueden seleccionar como máximo 100 temas.',
  })
  @ArrayUnique({ message: 'Un tema no puede seleccionarse dos veces.' })
  @IsInt({ each: true, message: 'Los temas seleccionados no son válidos.' })
  @Min(1, { each: true, message: 'Los temas seleccionados no son válidos.' })
  idsContenido: number[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Charla de un invitado del sector'],
    maxItems: TEMAS_ADICIONALES_MAXIMO,
    description:
      'Temas desarrollados que no están en el contenido programático (RF-20, excepción de p4; ' +
      'HU-08-05): se guardan como no planeados. Sin el campo se conservan los anteriores; una ' +
      'lista vacía los borra. Sin repetir y distintos de los temas del contenido programático.',
  })
  @IsOptional()
  @Transform(recortarLista)
  @IsArray({ message: 'Los temas no planeados deben enviarse como una lista.' })
  @ArrayMaxSize(TEMAS_ADICIONALES_MAXIMO, {
    message: `Se pueden escribir como máximo ${TEMAS_ADICIONALES_MAXIMO} temas no planeados por clase.`,
  })
  @IsString({ each: true, message: 'Cada tema no planeado debe ser un texto.' })
  @MinLength(1, { each: true, message: MENSAJE_TEMA_ADICIONAL_VACIO })
  @MaxLength(TEMA_ADICIONAL_MAXIMO, {
    each: true,
    message: `Cada tema no planeado puede tener hasta ${TEMA_ADICIONAL_MAXIMO} caracteres.`,
  })
  temasAdicionales?: string[];

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

  @ApiPropertyOptional({
    example: 'Primer parcial escrito: unidades 1 a 3.',
    maxLength: DESCRIPCION_SESION_MAXIMO,
    description:
      'Solo para una sesión de un tipo que no lleva temas pero sí hay clase, como el parcial ' +
      '(RF-21, p4). Sin el campo se conserva la que ya tiene; la sesión no se registra sin ' +
      'descripción (RF-21, excepción de p5). En una clase se ignora.',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser un texto.' })
  @MaxLength(DESCRIPCION_SESION_MAXIMO, {
    message: `La descripción no puede superar ${DESCRIPCION_SESION_MAXIMO} caracteres.`,
  })
  descripcion?: string;
}

/** RF-21, HU-08-06: el tipo nuevo de una sesión y, si no lleva temas, su descripción. */
export class CambiarTipoSesionDto {
  @ApiProperty({
    example: 'parcial',
    description:
      'Código del tipo de sesión del catálogo (`tipo_sesion`): clase, parcial, festivo, ' +
      'actividad_complementaria u otro que agregue el programa',
  })
  @Transform(recortar)
  @IsString({ message: 'Elija el tipo de sesión.' })
  @MaxLength(50, { message: 'El tipo de sesión no es válido.' })
  tipo: string;

  @ApiPropertyOptional({
    example: 'Primer parcial escrito: unidades 1 a 3.',
    maxLength: DESCRIPCION_SESION_MAXIMO,
    description:
      'Obligatoria si el tipo no lleva temas (RF-21, p3 y p4). En una clase se ignora.',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser un texto.' })
  @MaxLength(DESCRIPCION_SESION_MAXIMO, {
    message: `La descripción no puede superar ${DESCRIPCION_SESION_MAXIMO} caracteres.`,
  })
  descripcion?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Confirma que se quiten los temas o los ausentes ya registrados que el tipo nuevo no ' +
      'admite. Sin esta confirmación, el cambio responde 409 y dice qué se quitaría.',
  })
  @IsOptional()
  @IsBoolean({ message: 'Indique si confirma quitar lo ya registrado.' })
  confirmarQuitarRegistro?: boolean;
}

/** Un tipo de sesión del catálogo, para elegirlo en la sesión (RF-21, p2). */
export class TipoSesionOpcionDto {
  @ApiProperty({ example: 'parcial' })
  codigo: string;

  @ApiProperty({ example: 'Parcial' })
  nombre: string;

  @ApiProperty({
    description:
      'Si la sesión lleva temas del contenido programático. Si no, pide una descripción.',
  })
  llevaTemas: boolean;

  @ApiProperty({
    description:
      'Si en la sesión hay clase: se toma la asistencia y cuenta para las alertas. El festivo no.',
  })
  hayClase: boolean;
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
    type: [String],
    example: ['Charla de un invitado del sector'],
    description:
      'Temas desarrollados fuera del contenido programático: no planeados (HU-08-05)',
  })
  temasAdicionales: string[];

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

  @ApiProperty({
    example: 'Primer parcial escrito: unidades 1 a 3.',
    nullable: true,
    type: String,
    description: 'Descripción del parcial o de la actividad (RF-21, p4)',
  })
  descripcion: string | null;

  @ApiProperty({
    example: true,
    description:
      'Si el usuario puede cambiar el tipo de la sesión (RF-21): docente asignado o ' +
      'administrador, con el proyecto aprobado o en ejecución y el período abierto. También ' +
      'en una sesión futura, para marcar un parcial con anticipación.',
  })
  puedeCambiarTipo: boolean;

  @ApiProperty({
    type: [TipoSesionOpcionDto],
    description:
      'Tipos de sesión activos del catálogo, para elegir (RF-21, p2)',
  })
  tiposSesion: TipoSesionOpcionDto[];
}
