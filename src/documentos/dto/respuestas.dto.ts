import { ApiProperty } from '@nestjs/swagger';

/* Respuestas de las evidencias fotográficas por RAP (RF-24). */

export class RapEvidenciasDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 2, nullable: true, type: Number })
  numero: number | null;

  @ApiProperty({ example: 'RAP 2', nullable: true, type: String })
  codigo: string | null;

  @ApiProperty({
    example: 'Diseña sistemas productivos…',
    nullable: true,
    type: String,
  })
  descripcion: string | null;

  @ApiProperty({
    example: 3,
    description: 'Evidencias del RAP en este proyecto que el usuario puede ver',
  })
  totalEvidencias: number;
}

export class SesionEvidenciaDto {
  @ApiProperty({ example: 31 })
  id: number;

  @ApiProperty({ example: '2026-09-14', format: 'date' })
  fecha: string;

  @ApiProperty({ example: 6, nullable: true, type: Number })
  semana: number | null;
}

export class OpcionesEvidenciasDto {
  @ApiProperty({ example: 12 })
  idProyectoDocente: number;

  @ApiProperty({
    description:
      'Si el usuario puede cargar evidencias en este proyecto: es uno de sus docentes, el ' +
      'período no está cerrado y el proyecto tiene RAP',
  })
  puedeCargar: boolean;

  @ApiProperty({
    example: 'El período académico del proyecto ya está cerrado.',
    nullable: true,
    type: String,
    description: 'Por qué no puede cargar, cuando es un docente del proyecto',
  })
  motivoSinCarga: string | null;

  @ApiProperty({
    type: [RapEvidenciasDto],
    description: 'RAP del proyecto cuyas evidencias puede consultar el usuario',
  })
  raps: RapEvidenciasDto[];

  @ApiProperty({
    type: [SesionEvidenciaDto],
    description:
      'Sesiones del calendario que se pueden relacionar con una evidencia. Vacía si el ' +
      'usuario no puede cargar o si el calendario no se ha generado.',
  })
  sesiones: SesionEvidenciaDto[];

  @ApiProperty({
    example: 10,
    description:
      'Tamaño máximo de cada archivo, en MB (`archivo_tamano_maximo_mb`)',
  })
  tamanoMaximoMb: number;

  @ApiProperty({
    example: ['jpg', 'jpeg', 'png', 'pdf'],
    type: [String],
    description: 'Extensiones permitidas (`evidencia_tipos_permitidos`)',
  })
  extensionesPermitidas: string[];

  @ApiProperty({
    example: ['image/jpeg', 'image/png', 'application/pdf'],
    type: [String],
  })
  tiposMimePermitidos: string[];

  @ApiProperty({ example: 5, description: 'Archivos por cada carga' })
  maximoArchivosPorCarga: number;
}

export class UsuarioEvidenciaDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'Docente', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Demostración', nullable: true, type: String })
  apellidos: string | null;
}

export class EvidenciaDto {
  @ApiProperty({ example: 40 })
  id: number;

  @ApiProperty({ example: 12 })
  idProyectoDocente: number;

  @ApiProperty({ example: 2 })
  idRap: number;

  @ApiProperty({ type: SesionEvidenciaDto, nullable: true })
  sesion: SesionEvidenciaDto | null;

  @ApiProperty({ example: 'Exposición de los grupos.' })
  descripcion: string;

  @ApiProperty({ example: '2026-09-14', format: 'date' })
  fecha: string;

  @ApiProperty({ example: 'IMG_20260914_101500.jpg' })
  nombreOriginal: string;

  @ApiProperty({ example: 'image/jpeg' })
  tipo: string;

  @ApiProperty({ example: 2_481_337 })
  tamanoBytes: number;

  @ApiProperty({ example: '2026-09-14T15:20:00.000Z', format: 'date-time' })
  fechaSubida: string;

  @ApiProperty({ type: UsuarioEvidenciaDto, nullable: true })
  subidoPor: UsuarioEvidenciaDto | null;
}

export class CargaEvidenciasDto {
  @ApiProperty({ type: [EvidenciaDto] })
  evidencias: EvidenciaDto[];
}

export class PaginaEvidenciasDto {
  @ApiProperty({ type: [EvidenciaDto] })
  elementos: EvidenciaDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ example: 3 })
  total: number;
}
