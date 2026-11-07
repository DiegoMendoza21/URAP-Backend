import { ApiProperty } from '@nestjs/swagger';
import {
  ESTADO_MEDICION,
  type EstadoMedicion,
  PERIODO_TOMA,
  type PeriodoToma,
  TIPO_VALORACION,
  type TipoValoracion,
} from '../constantes.js';

/* Respuestas de la medición de RAP (RF-30). Los ejemplos son ficticios: nunca datos reales
   de estudiantes (Ley 1581 de 2012). */

export class EstadoProyectoMedicionDto {
  @ApiProperty({ example: 'aprobado' })
  codigo: string;

  @ApiProperty({ example: 'Aprobado' })
  nombre: string;
}

/** El curso que se mide: asignatura, grupo y período. */
export class ProyectoMedicionDto {
  @ApiProperty({ example: 13 })
  id: number;

  @ApiProperty({ example: 'Finanzas a corto plazo' })
  asignatura: string;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  periodo: string | null;
}

export class RapMedicionDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({
    example:
      'Identifica, interpreta y evalúa el entorno económico y financiero de las organizaciones…',
    nullable: true,
    type: String,
  })
  descripcion: string | null;
}

export class RubricaVigenteDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 1, nullable: true, type: Number })
  version: number | null;

  @ApiProperty({
    example: 4,
    description: 'Indicadores de desempeño que valora',
  })
  indicadores: number;
}

/** Un RAP del curso y si se puede medir (RF-30, excepción de p3). */
export class RapMedibleDto extends RapMedicionDto {
  @ApiProperty({
    type: RubricaVigenteDto,
    nullable: true,
    description:
      'Rúbrica con la que se mediría hoy. Nula si el RAP no tiene rúbrica vigente: no se ' +
      'puede iniciar su medición hasta registrarla (RF-06).',
  })
  rubricaVigente: RubricaVigenteDto | null;
}

/** Precondiciones de RF-30 para el curso. */
export class RequisitosMedicionDto {
  @ApiProperty({
    example: true,
    description: 'El departamento académico aprobó el proyecto docente',
  })
  proyectoAprobado: boolean;

  @ApiProperty({
    example: true,
    description: 'El período académico del curso no está cerrado (RF-17)',
  })
  periodoAbierto: boolean;

  @ApiProperty({
    example: true,
    description: 'El curso tiene la lista de estudiantes matriculados (RF-22)',
  })
  listaCargada: boolean;

  @ApiProperty({ example: 34, description: 'Estudiantes matriculados hoy' })
  matriculados: number;
}

export class PeriodoTomaSugeridoDto {
  @ApiProperty({ enum: Object.values(PERIODO_TOMA) })
  periodoToma: PeriodoToma;

  @ApiProperty({ example: 2026 })
  anioToma: number;
}

export class MedicionResumenDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ type: ProyectoMedicionDto })
  proyecto: ProyectoMedicionDto;

  @ApiProperty({ type: RapMedicionDto })
  rap: RapMedicionDto;

  @ApiProperty({ enum: Object.values(TIPO_VALORACION) })
  tipoValoracion: TipoValoracion;

  @ApiProperty({ enum: Object.values(PERIODO_TOMA) })
  periodoToma: PeriodoToma;

  @ApiProperty({ example: 2026 })
  anioToma: number;

  @ApiProperty({ enum: Object.values(ESTADO_MEDICION) })
  estado: EstadoMedicion;

  @ApiProperty({ example: 1, nullable: true, type: Number })
  versionRubrica: number | null;

  @ApiProperty({
    example: '2026-11-07T15:30:00.000Z',
    nullable: true,
    type: String,
    description: 'Último cambio de la medición',
  })
  actualizada: string | null;
}

/** Página «Medición de RAP» del curso (RF-30, p1 y p2). */
export class MedicionesDelProyectoDto {
  @ApiProperty({ type: ProyectoMedicionDto })
  proyecto: ProyectoMedicionDto;

  @ApiProperty({ type: EstadoProyectoMedicionDto, nullable: true })
  estadoProyecto: EstadoProyectoMedicionDto | null;

  @ApiProperty({ type: RequisitosMedicionDto })
  requisitos: RequisitosMedicionDto;

  @ApiProperty({
    example: true,
    description:
      'Quien consulta es docente asignado al curso: es quien inicia y registra las mediciones',
  })
  puedeRegistrar: boolean;

  @ApiProperty({
    type: PeriodoTomaSugeridoDto,
    nullable: true,
    description:
      'Período y año de toma deducidos del período académico del curso (2026-2 → segundo, 2026)',
  })
  periodoSugerido: PeriodoTomaSugeridoDto | null;

  @ApiProperty({ type: [RapMedibleDto] })
  raps: RapMedibleDto[];

  @ApiProperty({ type: [MedicionResumenDto] })
  mediciones: MedicionResumenDto[];
}

export class NivelEscalaDto {
  @ApiProperty({ example: 3 })
  valor: number;

  @ApiProperty({ example: 'Competente' })
  etiqueta: string;
}

/** Escala del programa con la que se valora (RF-07). */
export class EscalaMedicionDto {
  @ApiProperty({
    example: 'Escala de valoración de los RAP',
    nullable: true,
    type: String,
  })
  nombre: string | null;

  @ApiProperty({
    example: 3,
    description: 'Nivel desde el cual se considera logrado el resultado',
  })
  umbralCumplimiento: number;

  @ApiProperty({ type: [NivelEscalaDto] })
  niveles: NivelEscalaDto[];
}

export class DescriptorNivelDto {
  @ApiProperty({ example: 2 })
  valor: number;

  @ApiProperty({
    example:
      'Raras veces identifica las variables del entorno económico y financiero de las organizaciones',
  })
  descripcion: string;
}

/** Un indicador de la rúbrica con el instrumento registrado (RF-30, p3 y p4). */
export class IndicadorMedicionDto {
  @ApiProperty({ example: 7 })
  idIndicador: number;

  @ApiProperty({ example: 1, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({
    example:
      'Identifica las variables del entorno económico y financiero de las organizaciones',
    nullable: true,
    type: String,
  })
  descripcion: string | null;

  @ApiProperty({
    example: 'Taller de análisis financiero',
    nullable: true,
    type: String,
  })
  instrumento: string | null;

  @ApiProperty({ nullable: true, type: String })
  descripcionInstrumento: string | null;

  @ApiProperty({
    type: [DescriptorNivelDto],
    description:
      'Desempeño esperado en cada nivel de la escala (celdas de la rúbrica)',
  })
  descriptores: DescriptorNivelDto[];
}

export class ValoracionRegistradaDto {
  @ApiProperty({ example: 7 })
  idIndicador: number;

  @ApiProperty({ example: 3, description: 'Valor del nivel en la escala' })
  valor: number;
}

/** Un estudiante con sus niveles por indicador. Datos personales (Ley 1581 de 2012). */
export class EstudianteMedicionDto {
  @ApiProperty({ example: 41 })
  idMatricula: number;

  @ApiProperty({ example: '1000000001' })
  documento: string;

  @ApiProperty({ example: 'Estudiante Uno' })
  nombres: string;

  @ApiProperty({ example: 'Ficticio Demo' })
  apellidos: string;

  @ApiProperty({
    example: false,
    description:
      'Salió de la lista del curso después de ser valorado: sus valoraciones se conservan',
  })
  retirado: boolean;

  @ApiProperty({
    type: [ValoracionRegistradaDto],
    description: 'Un indicador que no aparece aquí está sin valorar',
  })
  valoraciones: ValoracionRegistradaDto[];
}

/** Hoja «Valoración» del formato FO-DO/PC-023 (RF-30). */
export class MedicionDetalleDto extends MedicionResumenDto {
  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description: 'Tamaño de la cohorte registrado; nulo si no se registró',
  })
  tamanoCohorte: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description:
      'Porcentaje esperado en los niveles de cumplimiento, copiado de la escala del programa ' +
      'al iniciar la medición. Nulo: el programa no lo ha definido.',
  })
  porcentajeEsperado: number | null;

  @ApiProperty({ type: EscalaMedicionDto })
  escala: EscalaMedicionDto;

  @ApiProperty({ type: [IndicadorMedicionDto] })
  indicadores: IndicadorMedicionDto[];

  @ApiProperty({ type: [EstudianteMedicionDto] })
  estudiantes: EstudianteMedicionDto[];

  @ApiProperty({ example: 'Docente Demo', nullable: true, type: String })
  registradoPor: string | null;

  @ApiProperty({
    example: true,
    description:
      'Quien consulta puede registrar instrumentos y valoraciones: es docente asignado al ' +
      'curso y la medición está en borrador',
  })
  puedeEditar: boolean;
}

export class ResultadoValoracionesDto {
  @ApiProperty({
    example: 136,
    description: 'Valoraciones con un nivel registrado',
  })
  registradas: number;

  @ApiProperty({
    example: 2,
    description: 'Valoraciones que quedaron sin nivel',
  })
  borradas: number;
}
