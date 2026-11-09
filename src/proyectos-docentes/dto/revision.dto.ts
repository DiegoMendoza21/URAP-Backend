import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SECCIONES } from '../entities/secciones.js';
import { ConsultarProyectosDocentesDto } from './consultas.dto.js';
import {
  EstadoProyectoDto,
  ProyectoDocenteResumenDto,
} from './respuestas.dto.js';

/** Claves de las secciones que se pueden observar, en el orden del formato. */
export const CLAVES_SECCION = SECCIONES.map((seccion) => seccion.clave);

export const OBSERVACION_LONGITUD_MAXIMA = 2000;
export const OBSERVACION_GENERAL_LONGITUD_MAXIMA = 4000;
/** Tope técnico de observaciones por devolución: una revisión real no se acerca. */
export const OBSERVACIONES_MAXIMAS = 50;

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const vacioANulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

// ——— Envío a revisión (RF-17, HU-07-01) ———

export class SeccionIncompletaDto {
  @ApiProperty({ example: 3, description: 'Punto del formato FO-DO/PC-001' })
  numero: number;

  @ApiProperty({ example: 'rac', enum: CLAVES_SECCION })
  clave: string;

  @ApiProperty({ example: 'Resultados de aprendizaje del curso' })
  titulo: string;

  @ApiProperty({
    type: [String],
    example: ['RAP 2 no tiene RAC asociados.'],
  })
  pendientes: string[];
}

export class VerificacionEnvioDto {
  @ApiProperty({ example: 41 })
  idProyecto: number;

  @ApiProperty({ type: EstadoProyectoDto, nullable: true })
  estado: EstadoProyectoDto | null;

  @ApiProperty({
    example: false,
    description:
      'Si el usuario puede enviar el proyecto ahora (RF-17, p2 a p4)',
  })
  puedeEnviar: boolean;

  @ApiProperty({
    example:
      'El proyecto todavía tiene secciones incompletas. Complételas para enviarlo a revisión.',
    nullable: true,
    type: String,
    description: 'Por qué no se puede enviar; nulo si se puede',
  })
  motivo: string | null;

  @ApiProperty({
    type: [SeccionIncompletaDto],
    description: 'RF-17, p2: secciones obligatorias con pendientes',
  })
  seccionesIncompletas: SeccionIncompletaDto[];

  @ApiProperty({
    example: 1,
    description:
      'HU-07-05: observaciones de la última devolución sin marcar como resueltas. Es una ' +
      'advertencia: no impide el envío.',
  })
  observacionesSinResolver: number;
}

export class TransicionProyectoDto {
  @ApiProperty({ example: 41 })
  idProyecto: number;

  @ApiProperty({ type: EstadoProyectoDto })
  estado: EstadoProyectoDto;

  @ApiProperty({ example: '2026-11-08T15:00:00.000Z' })
  fecha: string;
}

// ——— Bandeja de revisión (RF-18, HU-07-02) ———

export class ConsultarPendientesRevisionDto extends ConsultarProyectosDocentesDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El programa no es válido.' })
  @Min(1, { message: 'El programa no es válido.' })
  idPrograma?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La asignatura no es válida.' })
  @Min(1, { message: 'La asignatura no es válida.' })
  idAsignatura?: number;

  @ApiPropertyOptional({ example: 12, description: 'Docente asignado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El docente no es válido.' })
  @Min(1, { message: 'El docente no es válido.' })
  idDocente?: number;
}

export class PendienteRevisionDto extends ProyectoDocenteResumenDto {
  @ApiProperty({
    example: '2026-11-08T15:00:00.000Z',
    nullable: true,
    type: String,
    description: 'Desde cuándo está pendiente: el último envío a revisión',
  })
  fechaEnvio: string | null;

  @ApiProperty({
    example: true,
    description:
      'Si el usuario puede aprobarlo o devolverlo (RF-18). Es falso cuando es docente del ' +
      'proyecto y el parámetro `revision_bloquear_autoaprobacion` está encendido ' +
      '(separación de funciones): debe revisarlo otra persona del Departamento.',
  })
  puedeRevisar: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description:
      'Por qué no puede revisarlo, en lenguaje del usuario; nulo si puede. Ejemplo: «Usted ' +
      'es docente de este proyecto: debe revisarlo otra persona del Departamento.»',
  })
  motivo: string | null;
}

export class PaginaPendientesRevisionDto {
  @ApiProperty({ type: [PendienteRevisionDto] })
  elementos: PendienteRevisionDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ example: 3 })
  total: number;
}

// ——— Aprobación y devolución (RF-18, HU-07-03 y HU-07-04) ———

export class VerificacionRevisionDto {
  @ApiProperty({ example: 41 })
  idProyecto: number;

  @ApiProperty({ type: EstadoProyectoDto, nullable: true })
  estado: EstadoProyectoDto | null;

  @ApiProperty({
    example: false,
    description:
      'Si el usuario puede aprobar o devolver el proyecto ahora (RF-18). Es verdadero solo si ' +
      'el proyecto está «Enviado a revisión» y el usuario no es docente de él mientras ' +
      '`revision_bloquear_autoaprobacion` esté encendido (separación de funciones). Es la ' +
      'única señal para mostrar las decisiones.',
  })
  puedeRevisar: boolean;

  @ApiProperty({
    example:
      'Usted es docente de este proyecto: debe revisarlo otra persona del Departamento.',
    nullable: true,
    type: String,
    description:
      'Cuál de las dos condiciones falla, en lenguaje del usuario: es docente del proyecto, o ' +
      'el proyecto no está enviado a revisión. Si fallan las dos, la primera. Nulo si puede.',
  })
  motivo: string | null;
}

export class AprobarProyectoDto {
  @ApiPropertyOptional({
    example: 'Proyecto completo y coherente con los RAP del programa.',
    maxLength: OBSERVACION_GENERAL_LONGITUD_MAXIMA,
  })
  @IsOptional()
  @Transform(vacioANulo)
  @IsString({ message: 'La observación general debe ser un texto.' })
  @MaxLength(OBSERVACION_GENERAL_LONGITUD_MAXIMA, {
    message: `La observación general no puede superar ${OBSERVACION_GENERAL_LONGITUD_MAXIMA} caracteres.`,
  })
  observacionGeneral?: string;
}

export class ObservacionEntradaDto {
  @ApiProperty({ example: 'rac', enum: CLAVES_SECCION })
  @IsIn(CLAVES_SECCION, {
    message: 'Indique una sección del proyecto docente para cada observación.',
  })
  seccion: string;

  @ApiProperty({
    example: 'El RAC 2 no indica cómo contribuye al RAP 3.',
    maxLength: OBSERVACION_LONGITUD_MAXIMA,
  })
  @Transform(recortar)
  @IsString({ message: 'Escriba el texto de cada observación.' })
  @IsNotEmpty({ message: 'Escriba el texto de cada observación.' })
  @MaxLength(OBSERVACION_LONGITUD_MAXIMA, {
    message: `Cada observación puede tener hasta ${OBSERVACION_LONGITUD_MAXIMA} caracteres.`,
  })
  observacion: string;
}

export class DevolverProyectoDto extends AprobarProyectoDto {
  @ApiProperty({
    type: [ObservacionEntradaDto],
    description: 'Al menos una (RF-18, excepción de p4)',
  })
  @IsArray({
    message: 'Registre al menos una observación para devolver el proyecto.',
  })
  @ArrayMinSize(1, {
    message: 'Registre al menos una observación para devolver el proyecto.',
  })
  @ArrayMaxSize(OBSERVACIONES_MAXIMAS, {
    message: `Una devolución admite hasta ${OBSERVACIONES_MAXIMAS} observaciones.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ObservacionEntradaDto)
  observaciones: ObservacionEntradaDto[];
}

// ——— Observaciones de la devolución (HU-07-05) ———

export class ObservacionDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'rac', enum: CLAVES_SECCION })
  seccion: string;

  @ApiProperty({ example: 3, nullable: true, type: Number })
  numeroSeccion: number | null;

  @ApiProperty({
    example: 'Resultados de aprendizaje del curso',
    nullable: true,
    type: String,
  })
  tituloSeccion: string | null;

  @ApiProperty({ example: 'El RAC 2 no indica cómo contribuye al RAP 3.' })
  observacion: string;

  @ApiProperty({ example: false })
  resuelta: boolean;
}

export class PersonaDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'Departamento', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Demo', nullable: true, type: String })
  apellidos: string | null;
}

export class DevolucionDto {
  @ApiProperty({ example: 9 })
  idRevision: number;

  @ApiProperty({
    example: '2026-11-08T15:00:00.000Z',
    nullable: true,
    type: String,
  })
  fecha: string | null;

  @ApiProperty({ type: PersonaDto, nullable: true })
  revisor: PersonaDto | null;

  @ApiProperty({ nullable: true, type: String })
  observacionGeneral: string | null;

  @ApiProperty({
    type: [ObservacionDto],
    description: 'En el orden del formato',
  })
  observaciones: ObservacionDto[];

  @ApiProperty({ example: 1 })
  sinResolver: number;
}

export class ObservacionesProyectoDto {
  @ApiProperty({
    example: true,
    description:
      'Si el proyecto está devuelto con observaciones: las observaciones están por atender',
  })
  vigentes: boolean;

  @ApiProperty({
    type: DevolucionDto,
    nullable: true,
    description:
      'La última devolución; nula si el proyecto nunca se ha devuelto',
  })
  devolucion: DevolucionDto | null;
}

export class MarcarObservacionDto {
  @ApiProperty({ example: true })
  @IsBoolean({ message: 'Indique si la observación quedó resuelta.' })
  resuelta: boolean;
}

// ——— Historial de revisiones (HU-07-06) ———

export class EventoRevisionDto {
  @ApiProperty({ example: 9 })
  id: number;

  @ApiProperty({
    example: 'elaboracion',
    description:
      'elaboracion | revision | aprobacion: «elaboró», «revisó» y «aprobó»',
  })
  tipo: string;

  @ApiProperty({
    example: 'enviado',
    description: 'enviado | devuelto | aprobado',
  })
  resultado: string;

  @ApiProperty({
    example: '2026-11-08T15:00:00.000Z',
    nullable: true,
    type: String,
  })
  fecha: string | null;

  @ApiProperty({ type: PersonaDto, nullable: true })
  usuario: PersonaDto | null;

  @ApiProperty({ type: EstadoProyectoDto, nullable: true })
  estadoAnterior: EstadoProyectoDto | null;

  @ApiProperty({ type: EstadoProyectoDto, nullable: true })
  estadoNuevo: EstadoProyectoDto | null;

  @ApiProperty({ nullable: true, type: String })
  observacionGeneral: string | null;

  @ApiProperty({
    example: 2,
    description: 'Observaciones por sección del evento',
  })
  observaciones: number;
}
