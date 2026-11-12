import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CualquierUsuarioAutenticado } from '../auth/decoradores/acceso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  ConsultarNotificacionesDto,
  ContadorNotificacionesDto,
  NotificacionDto,
  NotificacionesMarcadasDto,
  PaginaNotificacionesDto,
} from './dto/notificaciones.dto.js';
import { NotificacionesService } from './notificaciones.service.js';

/**
 * Bandeja de notificaciones dentro de la aplicación (RF-26; HU-13-01 y HU-13-03). Cualquier
 * usuario con sesión tiene la suya, sin importar sus roles: por eso no exige un permiso de la
 * matriz. El alcance es el propio usuario y lo pone el servicio: nadie lee ni marca las
 * notificaciones de otra persona.
 */
@ApiTags('Notificaciones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@CualquierUsuarioAutenticado()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Notificaciones del usuario, de la más reciente a la más antigua (HU-13-01, HU-13-03)',
  })
  @ApiOkResponse({ type: PaginaNotificacionesDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Página, tamaño o filtro no válidos',
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarNotificacionesDto,
  ): Promise<PaginaNotificacionesDto> {
    return this.notificaciones.listar(usuario.id, consulta);
  }

  @Get('no-leidas')
  @ApiOperation({
    summary: 'Cuántas notificaciones tiene el usuario sin leer',
  })
  @ApiOkResponse({ type: ContadorNotificacionesDto })
  contarNoLeidas(
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<ContadorNotificacionesDto> {
    return this.notificaciones.contarNoLeidas(usuario.id);
  }

  @Patch('leidas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca como leídas todas las notificaciones del usuario',
  })
  @ApiOkResponse({ type: NotificacionesMarcadasDto })
  marcarTodasLeidas(
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<NotificacionesMarcadasDto> {
    return this.notificaciones.marcarTodasLeidas(usuario.id);
  }

  @Patch(':id/leida')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca como leída una notificación del usuario',
    description:
      'Una notificación de otra persona responde igual que una que no existe (404).',
  })
  @ApiOkResponse({ type: NotificacionDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  marcarLeida(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NotificacionDto> {
    return this.notificaciones.marcarLeida(usuario.id, id);
  }
}
