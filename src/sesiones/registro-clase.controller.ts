import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  CambiarTipoSesionDto,
  DetalleSesionDto,
  RegistrarSesionDto,
} from './dto/registro.dto.js';
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
  @Permiso('clases', 'leer')
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
    description:
      'Ninguno de los roles del usuario consulta el registro de clases',
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
  @Permiso('clases', 'actualizar')
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
      'Sin temas, temas de otro proyecto o sin tema, estudiantes que no están matriculados ' +
      'en el curso, o un parcial o una actividad con temas o sin descripción',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Ninguno de los roles del usuario registra clases, o ve el proyecto pero no es su ' +
      'docente asignado ni el administrador',
  })
  @ApiNotFoundResponse(NO_VISIBLE)
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Sesión de fecha futura, período cerrado, proyecto sin aprobar, sesión de un tipo en que ' +
      'no hay clase (festivo), o todo el grupo ausente sin confirmar',
  })
  registrar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Param('idSesion', ParseIntPipe) idSesion: number,
    @Body() datos: RegistrarSesionDto,
  ): Promise<DetalleSesionDto> {
    return this.registro.registrar(usuario, idProyecto, idSesion, datos);
  }

  @Patch('tipo')
  @Permiso('clases', 'actualizar')
  @ApiOperation({
    summary:
      'Cambia el tipo de la sesión: clase, parcial, festivo o actividad complementaria (RF-21, HU-08-06)',
    description:
      'Los tipos salen del catálogo `tipo_sesion`. Uno que no lleva temas exige una ' +
      'descripción. El parcial y la actividad se registran después con su asistencia y sin ' +
      'temas; en el festivo no hay clase. Una sesión que el calendario marcó festivo se puede ' +
      'pasar a clase si sí se dictó (excepción de p2), y la recalculación no la vuelve a marcar. ' +
      'Si el tipo nuevo no admite lo ya registrado (temas o ausentes), pide ' +
      '`confirmarQuitarRegistro` y responde 409 diciendo qué se quitaría. Se puede cambiar en ' +
      'una sesión futura, para marcar un parcial con anticipación.',
  })
  @ApiOkResponse({ type: DetalleSesionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Tipo que no existe o está inactivo, o un tipo sin temas sin descripción',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Ninguno de los roles del usuario registra clases, o ve el proyecto pero no es su ' +
      'docente asignado ni el administrador',
  })
  @ApiNotFoundResponse(NO_VISIBLE)
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Período cerrado, proyecto sin aprobar, evidencias en una sesión que pasaría a no tener ' +
      'clase, o temas o ausentes que se quitarían sin confirmar',
  })
  cambiarTipo(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Param('idSesion', ParseIntPipe) idSesion: number,
    @Body() datos: CambiarTipoSesionDto,
  ): Promise<DetalleSesionDto> {
    return this.registro.cambiarTipo(usuario, idProyecto, idSesion, datos);
  }
}
