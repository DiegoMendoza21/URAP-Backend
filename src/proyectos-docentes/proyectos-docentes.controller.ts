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
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConsultarProyectosDocentesDto } from './dto/consultas.dto.js';
import { CrearProyectoDocenteDto } from './dto/crear-proyecto-docente.dto.js';
import {
  PaginaProyectosDocentesDto,
  ProyectoDocenteDetalleDto,
} from './dto/respuestas.dto.js';
import { ProyectosDocentesService } from './proyectos-docentes.service.js';

@ApiTags('Proyectos docentes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('proyectos-docentes')
export class ProyectosDocentesController {
  constructor(private readonly proyectos: ProyectosDocentesService) {}

  @Post()
  @Roles(ROL.departamento)
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
    description: 'No es Departamento académico del programa de la asignatura',
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
  @Roles(
    ROL.administrador,
    ROL.departamento,
    ROL.direccion,
    ROL.liderRap,
    ROL.docente,
  )
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
    description: 'El usuario no tiene un rol que consulte proyectos docentes',
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarProyectosDocentesDto,
  ): Promise<PaginaProyectosDocentesDto> {
    return this.proyectos.listar(usuario, consulta);
  }

  @Get(':id')
  @Roles(
    ROL.administrador,
    ROL.departamento,
    ROL.direccion,
    ROL.liderRap,
    ROL.docente,
  )
  @ApiOperation({
    summary: 'Ficha del proyecto docente',
    description:
      'Información institucional, RAP y docentes. Responde 404 tanto si no existe como ' +
      'si el usuario no tiene acceso a él.',
  })
  @ApiOkResponse({ type: ProyectoDocenteDetalleDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'El usuario no tiene un rol que consulte proyectos docentes',
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
