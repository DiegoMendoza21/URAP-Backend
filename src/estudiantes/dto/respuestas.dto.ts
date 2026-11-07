import { ApiProperty } from '@nestjs/swagger';
import { ESTADO_MATRICULA, type EstadoMatricula } from '../estados.js';

/* Respuestas de la lista de estudiantes matriculados (RF-22, HU-09-01). Los ejemplos son
   ficticios: nunca datos reales de estudiantes (Ley 1581 de 2012). */

export class MatriculadoDto {
  @ApiProperty({ example: 41, description: 'Identificador de la matrícula' })
  idMatricula: number;

  @ApiProperty({ example: '1000000001' })
  documento: string;

  @ApiProperty({ example: 'Estudiante Uno' })
  nombres: string;

  @ApiProperty({ example: 'Ficticio Demo' })
  apellidos: string;

  @ApiProperty({
    example: 'estudiante.uno@ejemplo.edu.co',
    nullable: true,
    type: String,
  })
  correo: string | null;

  @ApiProperty({ enum: Object.values(ESTADO_MATRICULA) })
  estado: EstadoMatricula;
}

export class UltimaCargaDto {
  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  fecha: string;

  @ApiProperty({ example: 'Administrador Demo', description: 'Quién la cargó' })
  cargadoPor: string;
}

export class PaginaMatriculadosDto {
  @ApiProperty({ type: [MatriculadoDto] })
  elementos: MatriculadoDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ example: 32, description: 'Total con el estado consultado' })
  total: number;

  @ApiProperty({ example: 32 })
  totalMatriculados: number;

  @ApiProperty({ example: 2 })
  totalRetirados: number;

  @ApiProperty({
    type: UltimaCargaDto,
    nullable: true,
    description:
      'Nulo si el curso todavía no tiene lista cargada (RF-22, excepción de p3)',
  })
  ultimaCarga: UltimaCargaDto | null;
}

export class ResultadoCargaMatriculadosDto {
  @ApiProperty({ example: 32, description: 'Estudiantes en el archivo' })
  matriculados: number;

  @ApiProperty({
    example: 30,
    description: 'Estudiantes que no estaban en la lista del curso',
  })
  nuevos: number;

  @ApiProperty({
    example: 1,
    description: 'Estaban retirados y vuelven a aparecer en el archivo',
  })
  reincorporados: number;

  @ApiProperty({
    example: 2,
    description:
      'Estaban en la lista y no aparecen en el archivo: quedan como retirados, sin borrarse',
  })
  retirados: number;

  @ApiProperty({
    example: 3,
    description:
      'Estudiantes ya registrados cuyos nombres o correo se actualizaron con el archivo',
  })
  actualizados: number;

  @ApiProperty({ type: UltimaCargaDto })
  carga: UltimaCargaDto;
}
