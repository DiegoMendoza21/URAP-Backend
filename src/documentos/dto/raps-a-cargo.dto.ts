import { ApiProperty } from '@nestjs/swagger';
import { EvidenciaDto, UsuarioEvidenciaDto } from './respuestas.dto.js';

/* Evidencias de los RAP a cargo del Líder RAP (RF-24, HU-10-04). */

export class PeriodoLiderazgoDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  codigo: string | null;
}

export class RapACargoDto {
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
    description:
      'Si lidera el RAP sin período (`lider_rap.id_periodo` vacío): entonces ve todos los ' +
      'períodos y `periodos` va vacía',
  })
  todosLosPeriodos: boolean;

  @ApiProperty({
    type: [PeriodoLiderazgoDto],
    description: 'Períodos en los que lidera el RAP',
  })
  periodos: PeriodoLiderazgoDto[];

  @ApiProperty({
    example: 5,
    description:
      'Evidencias del RAP en los proyectos docentes de esos períodos',
  })
  totalEvidencias: number;

  @ApiProperty({
    example: 4,
    description: 'Proyectos docentes de esos períodos que tributan al RAP',
  })
  totalProyectos: number;

  @ApiProperty({
    example: 3,
    description:
      'Cuántos de esos proyectos tienen al menos una evidencia del RAP',
  })
  proyectosConEvidencias: number;
}

export class RapsACargoDto {
  @ApiProperty({
    type: [RapACargoDto],
    description:
      'RAP que lidera el usuario, por número. Vacía si no lidera ninguno o no es Líder RAP.',
  })
  raps: RapACargoDto[];
}

export class ProyectoEvidenciaDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({
    example: 'Organización y dirección',
    nullable: true,
    type: String,
  })
  asignatura: string | null;

  @ApiProperty({ example: 'A', nullable: true, type: String })
  grupo: string | null;

  @ApiProperty({ example: '2026-2', nullable: true, type: String })
  periodo: string | null;

  @ApiProperty({
    type: UsuarioEvidenciaDto,
    nullable: true,
    description: 'Docente responsable del proyecto',
  })
  docenteResponsable: UsuarioEvidenciaDto | null;
}

export class EvidenciaRapACargoDto extends EvidenciaDto {
  @ApiProperty({
    type: ProyectoEvidenciaDto,
    description:
      'Proyecto docente de la evidencia: asignatura, grupo y docente',
  })
  proyecto: ProyectoEvidenciaDto;
}

export class PaginaEvidenciasRapACargoDto {
  @ApiProperty({ type: [EvidenciaRapACargoDto] })
  elementos: EvidenciaRapACargoDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 12 })
  tamano: number;

  @ApiProperty({ example: 5 })
  total: number;
}
