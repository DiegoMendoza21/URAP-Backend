import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/*
 * Planeación del curso en el proyecto docente (HU-06-04 a HU-06-07): punto 4 «Estrategias
 * metodológicas» (RF-13), punto 5 «Evaluación de los resultados de aprendizaje» (RF-14),
 * punto 6 «Contenidos del curso» (RF-15) y punto 7 «Bibliografía» (RF-16).
 *
 * Los topes de esta sección son técnicos (protegen la base y la pantalla), no reglas del
 * programa: ninguno aparece en los RF.
 */

export const ESTRATEGIA_MAXIMO = 1000;
export const ESTRATEGIAS_MAXIMO = 50;
export const ACTIVIDAD_MAXIMO = 1000;
/** `evaluacion_rac.instrumento` es varchar(255). */
export const INSTRUMENTO_MAXIMO = 255;
export const ACTIVIDADES_POR_RAC_MAXIMO = 20;
/** `contenido_programatico.tema` es varchar(255). */
export const TEMA_MAXIMO = 255;
/** Semanas de un año: ningún período puede tener más. */
export const SEMANAS_MAXIMO = 53;
export const HORAS_SEMANA_MAXIMO = 99;
export const REFERENCIA_MAXIMO = 2000;
export const REFERENCIAS_MAXIMO = 100;

/** Saltos de línea de Windows a `\n` y sin espacios a los lados. */
function limpiar(valor: unknown): unknown {
  return typeof valor === 'string'
    ? valor.replace(/\r\n?/g, '\n').trim()
    : valor;
}

function limpiarCada({ value }: { value: unknown }): unknown {
  return Array.isArray(value) ? value.map(limpiar) : value;
}

/** Texto opcional: vacío o solo espacios equivale a no escribirlo. */
function textoOpcional({ value }: { value: unknown }): unknown {
  const texto = limpiar(value);
  return texto === '' ? null : texto;
}

// ---------------------------------------------------------------- Entradas

export class GuardarEstrategiasDto {
  @ApiProperty({
    type: [String],
    example: ['Aprendizaje basado en problemas', 'Estudio de caso'],
    description:
      'Listado completo de estrategias, en el orden en que se presentan. Reemplaza el ' +
      'anterior: así se agregan, reordenan y eliminan (RF-13, p2 y p3). Un listado vacío ' +
      'deja la sección pendiente (HU-06-08).',
  })
  @Transform(limpiarCada)
  @IsArray({ message: 'Envíe el listado de estrategias.' })
  @ArrayMaxSize(ESTRATEGIAS_MAXIMO, {
    message: `El proyecto admite hasta ${ESTRATEGIAS_MAXIMO} estrategias.`,
  })
  @IsString({ each: true, message: 'Cada estrategia debe ser un texto.' })
  @IsNotEmpty({ each: true, message: 'Hay una estrategia vacía.' })
  @MaxLength(ESTRATEGIA_MAXIMO, {
    each: true,
    message: `Cada estrategia puede tener hasta ${ESTRATEGIA_MAXIMO} caracteres.`,
  })
  estrategias: string[];
}

export class ActividadEvaluacionEntradaDto {
  @ApiProperty({
    example: 'Taller grupal sobre el flujo de caja de una empresa',
    description: 'Actividad de evaluación prevista',
  })
  @Transform(({ value }) => limpiar(value))
  @IsString({ message: 'Describa la actividad de evaluación.' })
  @IsNotEmpty({ message: 'Describa la actividad de evaluación.' })
  @MaxLength(ACTIVIDAD_MAXIMO, {
    message: `La actividad puede tener hasta ${ACTIVIDAD_MAXIMO} caracteres.`,
  })
  actividad: string;

  @ApiProperty({
    example: 'Rúbrica',
    description: 'Instrumento con el que se evalúa: rúbrica, lista de chequeo…',
  })
  @Transform(({ value }) => limpiar(value))
  @IsString({ message: 'Indique el instrumento de evaluación.' })
  @IsNotEmpty({ message: 'Indique el instrumento de evaluación.' })
  @MaxLength(INSTRUMENTO_MAXIMO, {
    message: `El instrumento puede tener hasta ${INSTRUMENTO_MAXIMO} caracteres.`,
  })
  instrumento: string;

  @ApiPropertyOptional({
    example: 30,
    nullable: true,
    type: Number,
    description:
      'Peso de la actividad dentro del RAC, de 0,01 a 100, con dos decimales. Opcional.',
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El peso debe ser un número con hasta dos decimales.' },
  )
  @Min(0.01, { message: 'El peso debe ser mayor que 0 %.' })
  @Max(100, { message: 'El peso no puede superar el 100 %.' })
  porcentaje?: number | null;
}

export class GuardarEvaluacionRacDto {
  @ApiProperty({
    type: [ActividadEvaluacionEntradaDto],
    description:
      'Todas las actividades de evaluación del RAC, en orden. Reemplazan las anteriores. ' +
      'Un listado vacío deja el RAC sin evaluación (RF-14, p4).',
  })
  @IsArray({ message: 'Envíe el listado de actividades de evaluación.' })
  @ArrayMaxSize(ACTIVIDADES_POR_RAC_MAXIMO, {
    message: `Un RAC admite hasta ${ACTIVIDADES_POR_RAC_MAXIMO} actividades de evaluación.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ActividadEvaluacionEntradaDto)
  actividades: ActividadEvaluacionEntradaDto[];
}

export class SemanaContenidoEntradaDto {
  @ApiProperty({ example: 1, description: 'Semana del período, desde 1' })
  @IsInt({ message: 'La semana debe ser un número entero.' })
  @Min(1, { message: 'La semana debe ser 1 o mayor.' })
  @Max(SEMANAS_MAXIMO, { message: 'La semana no es válida.' })
  semana: number;

  @ApiPropertyOptional({
    example: 'Presentación del curso y conceptos básicos',
    nullable: true,
    type: String,
    description: 'Tema previsto. Vacío o nulo: la semana queda pendiente (p5).',
  })
  @IsOptional()
  @Transform(textoOpcional)
  @IsString({ message: 'El tema debe ser un texto.' })
  @MaxLength(TEMA_MAXIMO, {
    message: `El tema de cada semana puede tener hasta ${TEMA_MAXIMO} caracteres.`,
  })
  tema?: string | null;

  @ApiPropertyOptional({ example: 2, nullable: true, type: Number })
  @IsOptional()
  @IsInt({ message: 'Las horas TDE deben ser un número entero.' })
  @Min(0, { message: 'Las horas TDE no pueden ser negativas.' })
  @Max(HORAS_SEMANA_MAXIMO, {
    message: `Las horas TDE de una semana no pueden superar ${HORAS_SEMANA_MAXIMO}.`,
  })
  horasTde?: number | null;

  @ApiPropertyOptional({ example: 0, nullable: true, type: Number })
  @IsOptional()
  @IsInt({ message: 'Las horas TDP deben ser un número entero.' })
  @Min(0, { message: 'Las horas TDP no pueden ser negativas.' })
  @Max(HORAS_SEMANA_MAXIMO, {
    message: `Las horas TDP de una semana no pueden superar ${HORAS_SEMANA_MAXIMO}.`,
  })
  horasTdp?: number | null;

  @ApiPropertyOptional({ example: 4, nullable: true, type: Number })
  @IsOptional()
  @IsInt({ message: 'Las horas TI deben ser un número entero.' })
  @Min(0, { message: 'Las horas TI no pueden ser negativas.' })
  @Max(HORAS_SEMANA_MAXIMO, {
    message: `Las horas TI de una semana no pueden superar ${HORAS_SEMANA_MAXIMO}.`,
  })
  horasTi?: number | null;
}

export class GuardarContenidosDto {
  @ApiProperty({
    type: [SemanaContenidoEntradaDto],
    description:
      'La tabla completa del punto 6, una fila por semana y sin repetir semanas. Las ' +
      'semanas que no se envían quedan vacías.',
  })
  @IsArray({ message: 'Envíe las semanas del contenido.' })
  @ArrayMaxSize(SEMANAS_MAXIMO, { message: 'Hay demasiadas semanas.' })
  @ValidateNested({ each: true })
  @Type(() => SemanaContenidoEntradaDto)
  semanas: SemanaContenidoEntradaDto[];
}

export class GuardarBibliografiaDto {
  @ApiProperty({
    type: [String],
    example: [
      'Autor, A. (2020). Título del libro. Editorial.',
      'Autora, B. (2022). Título del artículo. Revista, 10(2), 1-20.',
    ],
    description:
      'Listado completo de referencias, en orden: la posición es su número. Reemplaza el ' +
      'anterior. Texto libre, sin imponer una norma de citación (RF-16).',
  })
  @Transform(limpiarCada)
  @IsArray({ message: 'Envíe el listado de referencias.' })
  @ArrayMaxSize(REFERENCIAS_MAXIMO, {
    message: `La bibliografía admite hasta ${REFERENCIAS_MAXIMO} referencias.`,
  })
  @IsString({ each: true, message: 'Cada referencia debe ser un texto.' })
  @IsNotEmpty({ each: true, message: 'Hay una referencia vacía.' })
  @MaxLength(REFERENCIA_MAXIMO, {
    each: true,
    message: `Cada referencia puede tener hasta ${REFERENCIA_MAXIMO} caracteres.`,
  })
  referencias: string[];
}

// ---------------------------------------------------------------- Respuestas

export class EstrategiaDto {
  @ApiProperty({ example: 31 })
  id: number;

  @ApiProperty({ example: 1, description: 'Posición en el listado, desde 1' })
  numero: number;

  @ApiProperty({ example: 'Aprendizaje basado en problemas' })
  descripcion: string;
}

export class CatalogoEstrategiasDto {
  @ApiProperty({
    type: [String],
    example: ['Lluvia de ideas', 'Matriz C-Q-A'],
    description:
      'Estrategias de enseñanza del MEN, que propone y conduce el docente. Salen del ' +
      'parámetro `catalogo_estrategias_ensenanza`, en su orden.',
  })
  ensenanza: string[];

  @ApiProperty({
    type: [String],
    example: ['Portafolio'],
    description:
      'Estrategias de aprendizaje del MEN, que ejecuta el estudiante. Salen del parámetro ' +
      '`catalogo_estrategias_aprendizaje`, en su orden.',
  })
  aprendizaje: string[];
}

export class SeccionEstrategiasDto {
  @ApiProperty({ type: [EstrategiaDto], description: 'En orden' })
  estrategias: EstrategiaDto[];

  @ApiProperty({
    type: CatalogoEstrategiasDto,
    description:
      'Catálogo sugerido del MEN (RF-13, p2): estrategias que se pueden agregar con un toque. ' +
      'No incluye las que ya están en el proyecto, y una que esté en los dos grupos sale solo ' +
      'en el de enseñanza. Si falta uno de los parámetros, su grupo llega vacío.',
  })
  catalogo: CatalogoEstrategiasDto;

  @ApiProperty({
    type: [String],
    description:
      'Estrategias que usan otros proyectos docentes del programa, de la más usada a la menos ' +
      'usada. No incluye las que ya están en el proyecto ni las del catálogo del MEN.',
  })
  sugeridas: string[];
}

export class ActividadEvaluacionDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Taller grupal sobre el flujo de caja' })
  actividad: string;

  @ApiProperty({ example: 'Rúbrica' })
  instrumento: string;

  @ApiProperty({ example: 30, nullable: true, type: Number })
  porcentaje: number | null;
}

export class RacEvaluacionDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiProperty({ example: 'RAC 1' })
  codigo: string;

  @ApiProperty({ example: 'Analiza la liquidez de una empresa…' })
  enunciado: string;

  @ApiProperty({
    type: [String],
    example: ['RAP 2'],
    description: 'RAP a los que contribuye el RAC',
  })
  raps: string[];

  @ApiProperty({ type: [ActividadEvaluacionDto] })
  actividades: ActividadEvaluacionDto[];

  @ApiProperty({
    example: 100,
    nullable: true,
    type: Number,
    description:
      'Suma de los pesos de las actividades que lo tienen. Nulo si ninguna tiene peso.',
  })
  pesoTotal: number | null;
}

export class SeccionEvaluacionDto {
  @ApiProperty({
    type: [RacEvaluacionDto],
    description: 'Los RAC del proyecto, en orden (RF-14, p2)',
  })
  racs: RacEvaluacionDto[];

  @ApiProperty({
    type: [Number],
    example: [16],
    description: 'RAC que todavía no tienen actividades de evaluación (p4)',
  })
  racsSinEvaluacion: number[];
}

export class SemanaContenidoDto {
  @ApiProperty({ example: 1 })
  semana: number;

  @ApiProperty({
    example: 40,
    nullable: true,
    type: Number,
    description:
      'Fila de `contenido_programatico`. Nulo si la semana nunca se ha guardado. El ' +
      'registro de clase (RF-20) enlaza los temas dictados con esta fila.',
  })
  id: number | null;

  @ApiProperty({ nullable: true, type: String })
  tema: string | null;

  @ApiProperty({ nullable: true, type: Number })
  horasTde: number | null;

  @ApiProperty({ nullable: true, type: Number })
  horasTdp: number | null;

  @ApiProperty({ nullable: true, type: Number })
  horasTi: number | null;
}

export class ComparacionHorasDto {
  @ApiProperty({ enum: ['TDE', 'TDP', 'TI', 'Total'], example: 'TDE' })
  tipo: 'TDE' | 'TDP' | 'TI' | 'Total';

  @ApiProperty({ example: 30, description: 'Suma de las semanas' })
  contenidos: number;

  @ApiProperty({
    example: 32,
    nullable: true,
    type: Number,
    description:
      'Horas de la asignatura. Nulo si el plan de estudios no las trae.',
  })
  asignatura: number | null;

  @ApiProperty({
    example: -2,
    nullable: true,
    type: Number,
    description: 'Contenidos menos asignatura. Nulo si no se puede comparar.',
  })
  diferencia: number | null;
}

export class SeccionContenidosDto {
  @ApiProperty({
    example: 16,
    nullable: true,
    type: Number,
    description:
      'Semanas del período académico. Nulo si el período no lo define.',
  })
  numeroSemanas: number | null;

  @ApiProperty({
    type: [SemanaContenidoDto],
    description:
      'Una fila por semana del período, de la 1 a la última (RF-15, p2)',
  })
  semanas: SemanaContenidoDto[];

  @ApiProperty({
    type: [Number],
    example: [15, 16],
    description: 'Semanas sin tema (p5)',
  })
  semanasSinTema: number[];

  @ApiProperty({
    type: [ComparacionHorasDto],
    description:
      'TDE, TDP, TI y total: lo registrado frente a la asignatura (p4)',
  })
  comparacion: ComparacionHorasDto[];

  @ApiProperty({
    example: false,
    nullable: true,
    type: Boolean,
    description:
      'Si todas las horas comparables coinciden. Nulo si la asignatura no tiene horas ' +
      'registradas y no hay con qué comparar.',
  })
  horasCoinciden: boolean | null;

  @ApiProperty({
    type: [String],
    example: ['créditos', 'horas TDE'],
    description:
      'Datos que le faltan a la asignatura en el plan de estudios (información incompleta, ' +
      'RF-08, p7). Vacío si los tiene todos.',
  })
  datosAsignaturaFaltantes: string[];
}

export class ReferenciaDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 1, description: 'Número de la referencia, desde 1' })
  numero: number;

  @ApiProperty({ example: 'Autor, A. (2020). Título del libro. Editorial.' })
  referencia: string;
}

export class SeccionBibliografiaDto {
  @ApiProperty({
    type: [ReferenciaDto],
    description: 'Listado numerado, en orden',
  })
  referencias: ReferenciaDto[];
}

export class ProyectoConBibliografiaDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiProperty({ example: 'Gestión ambiental' })
  asignatura: string;

  @ApiProperty({ example: '2026-1', nullable: true, type: String })
  periodo: string | null;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ example: 12, description: 'Cuántas referencias tiene' })
  referencias: number;

  @ApiProperty({
    example: true,
    description: 'Es de la misma asignatura que el proyecto que se diligencia',
  })
  mismaAsignatura: boolean;
}
