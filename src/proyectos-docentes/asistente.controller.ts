import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { AsistenteService } from './asistente.service.js';
import { ConsultarProyectoExistenteDto } from './dto/consultas.dto.js';
import {
  AsignaturaOpcionDto,
  DocenteOpcionDto,
  InformacionAsignaturaDto,
  ProgramaOpcionDto,
  ProyectoExistenteDto,
} from './dto/respuestas.dto.js';

const SIN_SESION = {
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
};
const SIN_PERMISO = {
  type: RespuestaErrorDto,
  description:
    'El usuario no es Departamento académico, o no lo es en el programa consultado',
};

/** Pasos del asistente de creación del proyecto docente (RF-08, HU-05-01 a HU-05-03). */
@ApiTags('Proyectos docentes · asistente de creación')
@ApiBearerAuth()
@ApiUnauthorizedResponse(SIN_SESION)
@ApiForbiddenResponse(SIN_PERMISO)
@Controller('proyectos-docentes/asistente')
@Roles(ROL.departamento)
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService) {}

  @Get('programas')
  @ApiOperation({
    summary:
      'Paso 1: programas en los que el usuario puede crear proyectos docentes',
  })
  @ApiOkResponse({ type: [ProgramaOpcionDto] })
  programas(
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<ProgramaOpcionDto[]> {
    return this.asistente.programas(usuario.id);
  }

  @Get('programas/:idPrograma/asignaturas')
  @ApiOperation({ summary: 'Paso 2: asignaturas activas del programa' })
  @ApiOkResponse({ type: [AsignaturaOpcionDto] })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El programa no existe',
  })
  asignaturas(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idPrograma', ParseIntPipe) idPrograma: number,
  ): Promise<AsignaturaOpcionDto[]> {
    return this.asistente.asignaturas(usuario.id, idPrograma);
  }

  @Get('asignaturas/:idAsignatura')
  @ApiOperation({
    summary:
      'Pasos 3 y 4: información autocompletada, período vigente y RAP del programa',
    description:
      'RF-08, p5 (HU-05-02): facultad, código, componente, tipo de curso, créditos, horas ' +
      'TDE, TDP y TI, prerrequisitos, correquisitos y período. Marca la información ' +
      'incompleta (p7) y propone los RAP del mapeo curricular.',
  })
  @ApiOkResponse({ type: InformacionAsignaturaDto })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'La asignatura no existe o está inactiva',
  })
  informacionAsignatura(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idAsignatura', ParseIntPipe) idAsignatura: number,
  ): Promise<InformacionAsignaturaDto> {
    return this.asistente.informacionAsignatura(usuario.id, idAsignatura);
  }

  @Get('programas/:idPrograma/docentes')
  @ApiOperation({
    summary: 'Paso 4: docentes del programa que se pueden asignar (HU-05-03)',
  })
  @ApiOkResponse({ type: [DocenteOpcionDto] })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El programa no existe',
  })
  docentes(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idPrograma', ParseIntPipe) idPrograma: number,
  ): Promise<DocenteOpcionDto[]> {
    return this.asistente.docentes(usuario.id, idPrograma);
  }

  @Get('proyecto-existente')
  @ApiOperation({
    summary:
      'Paso 4: proyecto ya creado para la asignatura, el período vigente y el grupo',
    description:
      'RF-08, p6: permite advertir antes de crear y ofrecer abrir el existente o duplicarlo.',
  })
  @ApiOkResponse({ type: ProyectoExistenteDto })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'La asignatura no existe o está inactiva',
  })
  proyectoExistente(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarProyectoExistenteDto,
  ): Promise<ProyectoExistenteDto> {
    return this.asistente.proyectoExistente(
      usuario.id,
      consulta.idAsignatura,
      consulta.grupo,
    );
  }
}
