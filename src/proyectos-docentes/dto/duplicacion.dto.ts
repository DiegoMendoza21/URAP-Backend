import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DocenteAsignadoDto,
  MAXIMO_DOCENTES,
} from './crear-proyecto-docente.dto.js';
import {
  DocenteOpcionDto,
  PeriodoAcademicoDto,
  ProyectoDocenteResumenDto,
  RapDto,
  RapOpcionDto,
} from './respuestas.dto.js';

/** Recorte de espacios; una cadena vacía equivale a no indicar el grupo. */
function normalizarGrupo({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const grupo = value.trim();
  return grupo === '' ? undefined : grupo;
}

/**
 * RF-09, p4: lo que se puede cambiar antes de guardar la copia. Lo demás (descripción, RAC,
 * estrategias, evaluación, contenidos y bibliografía) se copia del proyecto de origen y se
 * edita después, por secciones, como cualquier proyecto en diligenciamiento.
 */
export class DuplicarProyectoDocenteDto {
  @ApiPropertyOptional({
    example: 4,
    description:
      'Período del proyecto nuevo: uno activo y sin cerrar. Si se omite, el vigente.',
  })
  @IsOptional()
  @IsInt({ message: 'Seleccione un período académico válido.' })
  @Min(1, { message: 'Seleccione un período académico válido.' })
  idPeriodo?: number;

  @ApiPropertyOptional({
    example: 'B',
    description:
      'Grupo del curso nuevo. Vacío si la asignatura tiene un solo grupo en el período.',
  })
  @IsOptional()
  @Transform(normalizarGrupo)
  @IsString({ message: 'El grupo debe ser un texto.' })
  @MaxLength(20, { message: 'El grupo no puede superar 20 caracteres.' })
  grupo?: string;

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
    type: [Number],
    example: [1, 3],
    description:
      'RAP del proyecto nuevo (RF-09, excepción de p4: revisar la selección si la asignatura ' +
      'cambió de RAP). Si se omite, los del origen que siguen activos. Las relaciones de los ' +
      'RAC con un RAP que no quede seleccionado no se copian.',
  })
  @IsOptional()
  @IsArray({ message: 'Seleccione al menos un RAP.' })
  @ArrayMinSize(1, { message: 'Seleccione al menos un RAP.' })
  @ArrayUnique({ message: 'Un RAP no puede seleccionarse dos veces.' })
  @IsInt({ each: true, message: 'Los RAP seleccionados no son válidos.' })
  idsRap?: number[];
}

/** Cuánto hay en cada sección del origen: lo que la copia va a llevar. */
export class ContenidoCopiadoDto {
  @ApiProperty({ description: 'Punto 2: si el origen tiene descripción' })
  descripcion: boolean;

  @ApiProperty({ example: 3, description: 'Punto 3: RAC' })
  racs: number;

  @ApiProperty({
    example: 4,
    description: 'Punto 3: relaciones de los RAC con los RAP',
  })
  relacionesRap: number;

  @ApiProperty({ example: 5, description: 'Punto 4: estrategias' })
  estrategias: number;

  @ApiProperty({
    example: 6,
    description: 'Punto 5: actividades de evaluación de los RAC',
  })
  actividadesEvaluacion: number;

  @ApiProperty({ example: 16, description: 'Punto 6: semanas de contenido' })
  semanasContenido: number;

  @ApiProperty({ example: 4, description: 'Punto 7: referencias' })
  referencias: number;
}

export class PeriodoParaDuplicarDto extends PeriodoAcademicoDto {
  @ApiProperty({
    example: 0,
    description:
      'Semanas de contenido del origen que no caben en este período (tiene menos semanas). No se copian.',
  })
  semanasQueNoCaben: number;
}

/** RF-09, excepción de p4. */
export class AvisoRapDto {
  @ApiProperty({
    example:
      'La asignatura cambió de RAP desde el proyecto de origen. Revise la selección antes de duplicar.',
  })
  mensaje: string;

  @ApiProperty({
    type: [RapDto],
    description:
      'RAP del origen que ya no están activos o que la asignatura ya no tiene en su mapeo curricular',
  })
  retirados: RapDto[];

  @ApiProperty({
    type: [RapDto],
    description: 'RAP del mapeo actual de la asignatura que el origen no tenía',
  })
  nuevos: RapDto[];
}

/** RF-09, p3: el formulario de la copia, con todo lo del origen. */
export class PreparacionDuplicadoDto {
  @ApiProperty({ type: ProyectoDocenteResumenDto })
  origen: ProyectoDocenteResumenDto;

  @ApiProperty({ type: ContenidoCopiadoDto })
  contenido: ContenidoCopiadoDto;

  @ApiProperty({
    type: [PeriodoParaDuplicarDto],
    description:
      'Períodos activos y sin cerrar, del más reciente al más antiguo',
  })
  periodos: PeriodoParaDuplicarDto[];

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'El período vigente, o nulo si no hay ninguno abierto',
  })
  idPeriodoSugerido: number | null;

  @ApiProperty({
    type: [DocenteOpcionDto],
    description: 'Docentes del programa que se pueden asignar',
  })
  docentes: DocenteOpcionDto[];

  @ApiProperty({
    type: [DocenteAsignadoDto],
    description:
      'Los docentes del origen que todavía se pueden asignar, con su responsable',
  })
  docentesSugeridos: DocenteAsignadoDto[];

  @ApiProperty({
    type: [RapOpcionDto],
    description:
      'RAP activos del programa, con los del mapeo curricular actual marcados',
  })
  raps: RapOpcionDto[];

  @ApiProperty({
    type: [Number],
    description: 'Los RAP del origen que siguen activos',
  })
  idsRapSugeridos: number[];

  @ApiProperty({ type: AvisoRapDto, nullable: true })
  avisoRap: AvisoRapDto | null;
}
