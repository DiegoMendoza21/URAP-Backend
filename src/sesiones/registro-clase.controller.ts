import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
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
import { AuditarConsulta } from '../auditoria/auditar-consulta.decorator.js';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { DetalleSesionDto, RegistrarSesionDto } from './dto/registro.dto.js';
import {
  RegistroClaseService,
  TABLA_AUDITORIA_INASISTENCIA,
} from './registro-clase.service.js';

const NO_VISIBLE = {
  type: RespuestaErrorDto,
  description:
    'El proyecto no existe o el usuario no tiene acceso a él, o la sesión no es de ese proyecto',
};

@ApiTags('Registro de clases')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('proyectos-docentes/:idProyecto/sesiones/:idSesion')
export class RegistroClaseController {
  constructor(private readonly registro: RegistroClaseService) {}

  @Get()
  // Trae la lista del curso con los ausentes (datos personales, Ley 1581): RF-29, NFR-020.
  @AuditarConsulta(TABLA_AUDITORIA_INASISTENCIA, 'idSesion')
  @Roles(
    ROL.administrador,
    ROL.departamento,
    ROL.direccion,
    ROL.liderRap,
    ROL.docente,
  )
  @ApiOperation({
    summary:
      'La sesión para registrarla o consultarla (RF-20, p2 y p3; RF-22, p3)',
    description:
      'Trae los temas del contenido programático del proyecto y lo ya registrado. La lista del ' +
      'curso con los ausentes y las observaciones solo llegan al docente asignado y al ' +
      'administrador: son datos personales (Ley 1581). Los demás roles ven los temas y el ' +
      'número de ausentes.',
  })
  @ApiOkResponse({ type: DetalleSesionDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'El usuario no tiene un rol que consulte proyectos docentes',
  })
  @ApiNotFoundResponse(NO_VISIBLE)
  detalle(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Param('idSesion', ParseIntPipe) idSesion: number,
  ): Promise<DetalleSesionDto> {
    return this.registro.detalle(usuario, idProyecto, idSesion);
  }

  @Put('registro')
  @Roles(ROL.docente, ROL.administrador)
  @ApiOperation({
    summary: 'Registra o corrige la clase de una sesión (HU-08-04 y HU-09-02)',
    description:
      'Guarda los temas desarrollados, los estudiantes que no asistieron y las observaciones, ' +
      'y marca la sesión como diligenciada: deja de salir como vencida (RF-23). Reemplaza el ' +
      'registro anterior. No se registra una sesión de fecha futura (RF-20, p6), y marcar a ' +
      'todo el grupo como ausente pide `confirmarTodoElGrupo` (RF-22, p6).',
  })
  @ApiOkResponse({ type: DetalleSesionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Sin temas, temas de otro proyecto o sin tema, o estudiantes que no están matriculados ' +
      'en el curso',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'El usuario no tiene un rol que registre clases, o ve el proyecto pero no es su docente ' +
      'asignado ni el administrador',
  })
  @ApiNotFoundResponse(NO_VISIBLE)
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Sesión de fecha futura, período cerrado, proyecto sin aprobar, sesión de un tipo que no ' +
      'lleva temas, o todo el grupo ausente sin confirmar',
  })
  registrar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Param('idSesion', ParseIntPipe) idSesion: number,
    @Body() datos: RegistrarSesionDto,
  ): Promise<DetalleSesionDto> {
    return this.registro.registrar(usuario, idProyecto, idSesion, datos);
  }
}
