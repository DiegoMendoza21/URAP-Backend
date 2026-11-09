import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { NO_EXISTE } from './diligenciamiento.controller.js';
import {
  AprobarProyectoDto,
  ConsultarPendientesRevisionDto,
  DevolverProyectoDto,
  EventoRevisionDto,
  MarcarObservacionDto,
  ObservacionDto,
  ObservacionesProyectoDto,
  PaginaPendientesRevisionDto,
  TransicionProyectoDto,
  VerificacionEnvioDto,
  VerificacionRevisionDto,
} from './dto/revision.dto.js';
import { RevisionService } from './revision.service.js';

const SIN_PERMISO_LEER = {
  type: RespuestaErrorDto,
  description:
    'Ninguno de los roles del usuario tiene el permiso de consultar proyectos docentes',
};
const SIN_PERMISO_REVISAR = {
  type: RespuestaErrorDto,
  description:
    'Ninguno de los roles del usuario aprueba proyectos docentes, no los aprueba en el ' +
    'programa del proyecto, o es docente del proyecto y el parámetro ' +
    '`revision_bloquear_autoaprobacion` está encendido (separación de funciones)',
};
const NO_ENVIADO = {
  type: RespuestaErrorDto,
  description: 'El proyecto no está «Enviado a revisión» (RF-18, precondición)',
};

/**
 * Revisión y aprobación del proyecto docente (EP-07, RF-17 y RF-18). El docente responsable
 * lo envía; quien tiene `proyectos.aprobar` en el programa lo aprueba o lo devuelve con
 * observaciones por sección. El alcance (responsable, programa, visibilidad) lo comprueba
 * `RevisionService`.
 */
@ApiTags('Revisión del proyecto docente')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller()
export class RevisionController {
  constructor(private readonly revision: RevisionService) {}

  @Get('proyectos-docentes/:id/envio')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary:
      'Verificación antes de enviar a revisión (RF-17, p2 y p3; HU-07-01)',
    description:
      'Si el usuario puede enviar el proyecto, las secciones obligatorias con pendientes y ' +
      'las observaciones de la última devolución sin resolver (HU-07-05).',
  })
  @ApiOkResponse({ type: VerificacionEnvioDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'Ninguno de los roles del usuario edita proyectos docentes',
  })
  @ApiNotFoundResponse(NO_EXISTE)
  verificarEnvio(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VerificacionEnvioDto> {
    return this.revision.verificarEnvio(usuario, id);
  }

  @Post('proyectos-docentes/:id/envio')
  @HttpCode(HttpStatus.OK)
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary: 'Envía el proyecto a revisión (RF-17, p4 y p5; HU-07-01)',
    description:
      'Cambia el estado a «Enviado a revisión», registra la fecha y el usuario, bloquea la ' +
      'edición y notifica a quienes revisan en el programa.',
  })
  @ApiOkResponse({ type: TransicionProyectoDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Ninguno de los roles del usuario edita proyectos docentes, o no es el docente ' +
      'responsable del proyecto (RF-17, precondición)',
  })
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Secciones incompletas, con los pendientes en `detalles` (excepción de p2); período ' +
      'cerrado (excepción de p4), o estado que no se envía',
  })
  enviar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TransicionProyectoDto> {
    return this.revision.enviar(usuario, id);
  }

  @Get('revisiones/pendientes')
  @Permiso('proyectos', 'aprobar')
  @ApiOperation({
    summary:
      'Bandeja de proyectos pendientes de revisión (RF-18, p1; HU-07-02)',
    description:
      'Proyectos «Enviado a revisión» de los programas donde el usuario aprueba, los que ' +
      'llevan más tiempo esperando primero. Incluye aquellos en los que es docente, con ' +
      '`puedeRevisar` en falso y el `motivo`, cuando la separación de funciones está encendida.',
  })
  @ApiOkResponse({ type: PaginaPendientesRevisionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtros o paginación inválidos',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'Ninguno de los roles del usuario aprueba proyectos docentes',
  })
  pendientes(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarPendientesRevisionDto,
  ): Promise<PaginaPendientesRevisionDto> {
    return this.revision.pendientes(usuario, consulta);
  }

  @Get('proyectos-docentes/:id/revision')
  @Permiso('proyectos', 'aprobar')
  @ApiOperation({
    summary:
      'Verificación antes de aprobar o devolver (RF-18; HU-07-03 y HU-07-04)',
    description:
      'Si el usuario puede aprobar o devolver el proyecto ahora y, si no, por qué: no lo ' +
      'aprueba en el programa, es docente del proyecto con la separación de funciones ' +
      'encendida (`revision_bloquear_autoaprobacion`) o el proyecto no está enviado a revisión.',
  })
  @ApiOkResponse({ type: VerificacionRevisionDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'Ninguno de los roles del usuario aprueba proyectos docentes',
  })
  @ApiNotFoundResponse(NO_EXISTE)
  verificarRevision(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VerificacionRevisionDto> {
    return this.revision.verificarRevision(usuario, id);
  }

  @Post('proyectos-docentes/:id/aprobacion')
  @HttpCode(HttpStatus.OK)
  @Permiso('proyectos', 'aprobar')
  @ApiOperation({
    summary: 'Aprueba el proyecto docente (RF-18, p4 y p5; HU-07-03)',
    description:
      'Cambia el estado a «Aprobado», registra el usuario y la fecha y notifica a los ' +
      'docentes. Desde ahí se registran las clases (RF-20).',
  })
  @ApiOkResponse({ type: TransicionProyectoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Observación general demasiado larga',
  })
  @ApiForbiddenResponse(SIN_PERMISO_REVISAR)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse(NO_ENVIADO)
  aprobar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: AprobarProyectoDto,
  ): Promise<TransicionProyectoDto> {
    return this.revision.aprobar(usuario, id, datos);
  }

  @Post('proyectos-docentes/:id/devolucion')
  @HttpCode(HttpStatus.OK)
  @Permiso('proyectos', 'aprobar')
  @ApiOperation({
    summary:
      'Devuelve el proyecto con observaciones por sección (RF-18; HU-07-04)',
    description:
      'Cambia el estado a «Devuelto con observaciones», que reabre la edición, y notifica a ' +
      'los docentes. Si el responsable está inactivo, avisa también a quienes revisan.',
  })
  @ApiOkResponse({ type: TransicionProyectoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Sin observaciones (excepción de p4), sección desconocida o texto vacío o demasiado largo',
  })
  @ApiForbiddenResponse(SIN_PERMISO_REVISAR)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse(NO_ENVIADO)
  devolver(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: DevolverProyectoDto,
  ): Promise<TransicionProyectoDto> {
    return this.revision.devolver(usuario, id, datos);
  }

  @Get('proyectos-docentes/:id/observaciones')
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Observaciones de la última devolución (HU-07-05)',
    description:
      'Agrupables por sección, en el orden del formato. `vigentes` indica si el proyecto ' +
      'sigue devuelto.',
  })
  @ApiOkResponse({ type: ObservacionesProyectoDto })
  @ApiForbiddenResponse(SIN_PERMISO_LEER)
  @ApiNotFoundResponse(NO_EXISTE)
  observaciones(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ObservacionesProyectoDto> {
    return this.revision.observaciones(usuario, id);
  }

  @Patch('proyectos-docentes/:id/observaciones/:idObservacion')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary: 'Marca una observación como resuelta o pendiente (HU-07-05)',
    description:
      'Solo un docente asignado, mientras el proyecto está devuelto con observaciones.',
  })
  @ApiOkResponse({ type: ObservacionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Falta indicar si quedó resuelta',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Ninguno de los roles del usuario edita proyectos docentes, o no es docente asignado',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'El proyecto no existe o no es visible, o la observación no es de su última devolución',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto no está devuelto con observaciones',
  })
  marcarObservacion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Param('idObservacion', ParseIntPipe) idObservacion: number,
    @Body() datos: MarcarObservacionDto,
  ): Promise<ObservacionDto> {
    return this.revision.marcarObservacion(usuario, id, idObservacion, datos);
  }

  @Get('proyectos-docentes/:id/historial')
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Historial de revisiones del proyecto (HU-07-06)',
    description:
      'Envíos, devoluciones y aprobaciones con usuario, fecha y estados. Sustituye las ' +
      'firmas «elaboró», «revisó» y «aprobó» del formato; es de solo lectura.',
  })
  @ApiOkResponse({ type: [EventoRevisionDto] })
  @ApiForbiddenResponse(SIN_PERMISO_LEER)
  @ApiNotFoundResponse(NO_EXISTE)
  historial(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EventoRevisionDto[]> {
    return this.revision.historial(usuario, id);
  }
}
