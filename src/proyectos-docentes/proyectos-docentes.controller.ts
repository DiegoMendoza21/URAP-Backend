import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConsultarProyectosDocentesDto } from './dto/consultas.dto.js';
import { CrearProyectoDocenteDto } from './dto/crear-proyecto-docente.dto.js';
import {
  DuplicarProyectoDocenteDto,
  PreparacionDuplicadoDto,
} from './dto/duplicacion.dto.js';
import {
  PaginaProyectosDocentesDto,
  ProyectoDocenteDetalleDto,
} from './dto/respuestas.dto.js';
import { DuplicacionService } from './duplicacion.service.js';
import { ProyectosDocentesService } from './proyectos-docentes.service.js';

@ApiTags('Proyectos docentes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('proyectos-docentes')
export class ProyectosDocentesController {
  constructor(
    private readonly proyectos: ProyectosDocentesService,
    private readonly duplicacion: DuplicacionService,
  ) {}

  @Post()
  @Permiso('proyectos', 'crear')
  @ApiOperation({
    summary: 'Crea el proyecto docente con el asistente (RF-08)',
    description:
      'Crea el proyecto en estado «En diligenciamiento» para el período vigente, con los RAP ' +
      'seleccionados y de 1 a 3 docentes, uno de ellos responsable (HU-05-01, HU-05-03). ' +
      'Si la asignatura no tiene créditos u horas, lo crea igual y lo marca con ' +
      'información incompleta (p7).',
  })
  @ApiCreatedResponse({ type: ProyectoDocenteDetalleDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Sin RAP (p4), RAP de otro programa, docentes repetidos, sin responsable o con más de uno, ' +
      'más de tres docentes o docentes que no lo son en el programa',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Sin el permiso de crear proyectos docentes, o no es Departamento académico del programa de la asignatura',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'La asignatura o su programa no existen o están inactivos',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Ya existe un proyecto para la asignatura, el período y el grupo (p6), o no hay un ' +
      'período académico activo',
  })
  crear(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body() datos: CrearProyectoDocenteDto,
  ): Promise<ProyectoDocenteDetalleDto> {
    return this.proyectos.crear(usuario, datos);
  }

  @Get()
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Bandeja de proyectos docentes visibles para el usuario',
    description:
      'El Docente ve solo aquellos en los que está asignado (HU-05-03); Departamento, ' +
      'Dirección y Líder RAP, los de su programa; el Administrador, todos.',
  })
  @ApiOkResponse({ type: PaginaProyectosDocentesDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Paginación inválida',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'El usuario no tiene el permiso de consultar proyectos docentes',
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarProyectosDocentesDto,
  ): Promise<PaginaProyectosDocentesDto> {
    return this.proyectos.listar(usuario, consulta);
  }

  @Get(':id/duplicacion')
  @Permiso('proyectos', 'crear')
  @ApiOperation({
    summary:
      'Prepara la duplicación del proyecto docente (RF-09, p3; HU-05-04)',
    description:
      'Qué se va a copiar, los períodos abiertos, los docentes del programa y los RAP, con lo ' +
      'que sugiere el origen. Advierte si la asignatura cambió de RAP (excepción de p4).',
  })
  @ApiOkResponse({ type: PreparacionDuplicadoDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Sin el permiso de crear proyectos docentes, o no es Departamento académico del programa',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto no existe o el usuario no tiene acceso a él',
  })
  prepararDuplicado(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PreparacionDuplicadoDto> {
    return this.duplicacion.preparar(usuario, id);
  }

  @Post(':id/duplicacion')
  @Permiso('proyectos', 'crear')
  @ApiOperation({
    summary: 'Duplica el proyecto docente (RF-09; HU-05-04)',
    description:
      'Crea un proyecto en «En diligenciamiento» con la descripción, los RAC con su relación ' +
      'con los RAP y su evaluación, las estrategias, los contenidos por semana y la ' +
      'bibliografía del origen, y guarda la referencia a él. No copia revisiones, ' +
      'observaciones, horario, clases, evidencias, matriculados ni mediciones. Las semanas ' +
      'que no caben en el período elegido no se copian.',
  })
  @ApiCreatedResponse({ type: ProyectoDocenteDetalleDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Período cerrado o inactivo, RAP de otro programa o inactivos, docentes repetidos, sin ' +
      'responsable o que no lo son en el programa',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Sin el permiso de crear proyectos docentes, o no es Departamento académico del programa',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'El proyecto de origen no existe o el usuario no tiene acceso a él',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Ya existe un proyecto para la asignatura, el período y el grupo (excepción de p5), ' +
      'o no hay un período académico abierto',
  })
  duplicar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: DuplicarProyectoDocenteDto,
  ): Promise<ProyectoDocenteDetalleDto> {
    return this.duplicacion.duplicar(usuario, id, datos);
  }

  @Get(':id')
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Ficha del proyecto docente',
    description:
      'Información institucional, RAP y docentes. Responde 404 tanto si no existe como ' +
      'si el usuario no tiene acceso a él.',
  })
  @ApiOkResponse({ type: ProyectoDocenteDetalleDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'El usuario no tiene el permiso de consultar proyectos docentes',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto no existe o el usuario no tiene acceso a él',
  })
  obtener(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProyectoDocenteDetalleDto> {
    return this.proyectos.obtener(usuario, id);
  }
}
