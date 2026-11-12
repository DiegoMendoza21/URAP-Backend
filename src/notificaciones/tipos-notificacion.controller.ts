import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  ActualizarTipoNotificacionDto,
  ConfiguracionNotificacionesDto,
  TipoNotificacionDto,
} from './dto/tipos.dto.js';
import { TiposNotificacionService } from './tipos-notificacion.service.js';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'El usuario no tiene el permiso de administrar la configuración (`estructura.administrar`)',
})
// La misma regla que la pantalla de parámetros (HU-03-07): es configuración del sistema.
@Permiso('estructura', 'administrar')
@Controller('notificaciones/tipos')
export class TiposNotificacionController {
  constructor(private readonly tipos: TiposNotificacionService) {}

  @Get()
  @ApiOperation({
    summary:
      'Tipos de notificación con su configuración y la periodicidad del recordatorio (HU-13-04)',
  })
  @ApiOkResponse({ type: ConfiguracionNotificacionesDto })
  consultar(): Promise<ConfiguracionNotificacionesDto> {
    return this.tipos.consultar();
  }

  @Patch(':codigo')
  @ApiOperation({
    summary:
      'Activa o desactiva un tipo de notificación y su correo (HU-13-04)',
    description:
      'Rige desde el siguiente aviso, sin redesplegar. Un tipo apagado deja de generar avisos; ' +
      'los que ya están en las bandejas se conservan.',
  })
  @ApiOkResponse({ type: TipoNotificacionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'No llegó ningún cambio, o un valor no es sí o no',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'No existe un tipo de notificación con ese código',
  })
  actualizar(
    @Param('codigo') codigo: string,
    @Body() cambios: ActualizarTipoNotificacionDto,
  ): Promise<TipoNotificacionDto> {
    return this.tipos.actualizar(codigo, cambios);
  }
}
