import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
import { DiligenciamientoService } from './diligenciamiento.service.js';
import {
  DescripcionDto,
  DiligenciamientoDto,
  GuardarDescripcionDto,
  GuardarRacDto,
  SeccionRacDto,
} from './dto/diligenciamiento.dto.js';
import { RacService } from './rac.service.js';

/** Quienes consultan proyectos docentes (los mismos de la bandeja de RF-08). */
const ROLES_CONSULTA = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
  ROL.liderRap,
  ROL.docente,
] as const;

const NO_EXISTE = {
  type: RespuestaErrorDto,
  description: 'El proyecto no existe o el usuario no tiene acceso a él',
};
const SIN_ROL_CONSULTA = {
  type: RespuestaErrorDto,
  description: 'El usuario no tiene un rol que consulte proyectos docentes',
};
const SOLO_ASIGNADOS = {
  type: RespuestaErrorDto,
  description:
    'No es Docente responsable o no está asignado a este proyecto (alcance «propios»)',
};
const NO_EDITABLE = {
  type: RespuestaErrorDto,
  description:
    'El estado del proyecto no admite cambios: enviado a revisión, aprobado, en ejecución o ' +
    'cerrado (RF-11, p4). En los tres últimos sugiere solicitar la reapertura.',
};

/**
 * Diligenciamiento del proyecto docente por secciones (EP-06). Cada sección tiene su propia
 * ruta y se guarda por separado (HU-06-08). Los puntos 4 a 7 se agregan aquí con el mismo
 * patrón: `GET` para leer y `PUT`/`POST` para guardar, con `EdicionProyectoService.editar()`.
 */
@ApiTags('Diligenciamiento del proyecto docente')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('proyectos-docentes/:id')
export class DiligenciamientoController {
  constructor(
    private readonly diligenciamiento: DiligenciamientoService,
    private readonly racs: RacService,
  ) {}

  @Get('diligenciamiento')
  @Roles(...ROLES_CONSULTA)
  @ApiOperation({
    summary: 'Estado de las secciones del proyecto docente (HU-06-08)',
    description:
      'Indica qué secciones están completas, qué les falta y si el usuario puede editar.',
  })
  @ApiOkResponse({ type: DiligenciamientoDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  resumen(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DiligenciamientoDto> {
    return this.diligenciamiento.resumen(usuario, id);
  }

  @Get('descripcion')
  @Roles(...ROLES_CONSULTA)
  @ApiOperation({ summary: 'Punto 2 «Descripción» (RF-11)' })
  @ApiOkResponse({ type: DescripcionDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  descripcion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DescripcionDto> {
    return this.diligenciamiento.descripcion(usuario, id);
  }

  @Put('descripcion')
  @Roles(ROL.docente)
  @ApiOperation({
    summary: 'Guarda el punto 2 «Descripción» (RF-11, HU-06-01)',
    description:
      'Guarda el texto y la fecha de última modificación. Admite un texto vacío para ' +
      'dejar la sección pendiente (HU-06-08).',
  })
  @ApiOkResponse({ type: DescripcionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'El texto supera la longitud máxima (RF-11, p3)',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse(NO_EDITABLE)
  guardarDescripcion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: GuardarDescripcionDto,
  ): Promise<DescripcionDto> {
    return this.diligenciamiento.guardarDescripcion(usuario, id, datos);
  }

  @Get('rac')
  @Roles(...ROLES_CONSULTA)
  @ApiOperation({
    summary: 'Punto 3: RAC del curso agrupados por RAP (RF-12)',
    description:
      'Un grupo por cada RAP del proyecto, con su enunciado completo, y la lista de RAP ' +
      'que todavía no tienen RAC (p5).',
  })
  @ApiOkResponse({ type: SeccionRacDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  seccionRac(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SeccionRacDto> {
    return this.racs.seccion(usuario, id);
  }

  @Post('rac')
  @Roles(ROL.docente)
  @ApiOperation({
    summary: 'Registra un RAC asociado a uno o varios RAP (HU-06-02, HU-06-03)',
    description: 'Devuelve la sección completa ya actualizada.',
  })
  @ApiCreatedResponse({ type: SeccionRacDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Sin RAP (RF-12, p3), RAP repetido, RAP que no es del proyecto, o código o enunciado ' +
      'vacíos',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse({
    ...NO_EDITABLE,
    description: `${NO_EDITABLE.description} También si el código ya existe en el proyecto.`,
  })
  crearRac(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: GuardarRacDto,
  ): Promise<SeccionRacDto> {
    return this.racs.crear(usuario, id, datos);
  }

  @Put('rac/:idRac')
  @Roles(ROL.docente)
  @ApiOperation({
    summary: 'Actualiza un RAC y reemplaza sus RAP asociados',
    description: 'Devuelve la sección completa ya actualizada.',
  })
  @ApiOkResponse({ type: SeccionRacDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Sin RAP (RF-12, p3), RAP repetido o que no es del proyecto',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto o el RAC no existen, o no tiene acceso',
  })
  @ApiConflictResponse({
    ...NO_EDITABLE,
    description: `${NO_EDITABLE.description} También si el código ya existe en el proyecto.`,
  })
  actualizarRac(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Param('idRac', ParseIntPipe) idRac: number,
    @Body() datos: GuardarRacDto,
  ): Promise<SeccionRacDto> {
    return this.racs.actualizar(usuario, id, idRac, datos);
  }

  @Delete('rac/:idRac')
  @Roles(ROL.docente)
  @ApiOperation({
    summary: 'Elimina un RAC del proyecto en diligenciamiento',
    description: 'Devuelve la sección completa ya actualizada.',
  })
  @ApiOkResponse({ type: SeccionRacDto })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto o el RAC no existen, o no tiene acceso',
  })
  @ApiConflictResponse({
    ...NO_EDITABLE,
    description: `${NO_EDITABLE.description} También si el RAC ya tiene evaluaciones.`,
  })
  eliminarRac(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Param('idRac', ParseIntPipe) idRac: number,
  ): Promise<SeccionRacDto> {
    return this.racs.eliminar(usuario, id, idRac);
  }
}
