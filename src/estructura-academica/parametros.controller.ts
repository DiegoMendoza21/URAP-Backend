import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConfiguracionParametrosService } from './configuracion-parametros.service.js';
import {
  CambiarParametroDto,
  ListaParametrosDto,
  ParametroDto,
} from './dto/parametros.dto.js';

/**
 * HU-03-07: parámetros del sistema. RF-04 pone la parametrización en «Estructura académica»,
 * que en la matriz de permisos (Tabla 11) solo administra el Administrador.
 */
@ApiTags('Parámetros del sistema')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'El usuario no tiene el permiso de administrar la estructura académica',
})
@Permiso('estructura', 'administrar')
@Controller('parametros')
export class ParametrosController {
  constructor(private readonly parametros: ConfiguracionParametrosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los parámetros del sistema con su valor (HU-03-07)',
    description:
      'Son los parámetros de negocio que el sistema lee. El secreto y la vigencia del token no ' +
      'aparecen: son variables de entorno del despliegue (NFR-003).',
  })
  @ApiOkResponse({ type: ListaParametrosDto })
  listar(): Promise<ListaParametrosDto> {
    return this.parametros.listar();
  }

  @Patch(':clave')
  @ApiOperation({
    summary: 'Cambia el valor de un parámetro (HU-03-07)',
    description:
      'Rige desde la siguiente petición, sin redesplegar. No crea parámetros nuevos ni los ' +
      'borra. El cambio queda en la auditoría con el valor anterior y el nuevo.',
  })
  @ApiParam({ name: 'clave', example: 'alerta_dias_anticipacion' })
  @ApiOkResponse({ type: ParametroDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'El valor no cumple las reglas del parámetro: tipo, rango, elementos vacíos o repetidos, ' +
      'tipo de archivo que no se sabe verificar, o no cabe en el valor',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'La clave no es un parámetro del sistema',
  })
  cambiar(
    @Param('clave') clave: string,
    @Body() datos: CambiarParametroDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<ParametroDto> {
    return this.parametros.cambiar(clave, datos, usuario);
  }
}
