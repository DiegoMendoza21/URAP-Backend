import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Headers,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { AuthService } from './auth.service.js';
import { CualquierUsuarioAutenticado } from './decoradores/acceso.decorator.js';
import { Publico } from './decoradores/publico.decorator.js';
import { UsuarioActual } from './decoradores/usuario-actual.decorator.js';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto.js';
import { SesionIniciadaDto } from './dto/sesion-iniciada.dto.js';
import { UsuarioAutenticadoDto } from './dto/usuario-autenticado.dto.js';
import type { UsuarioSesion } from './tipos.js';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('iniciar-sesion')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inicia sesión con correo institucional y contraseña',
    description:
      'Público. Devuelve un JWT con vigencia definida por NFR-003 y los datos del usuario ' +
      'con sus roles activos (RF-01, HU-01-01).',
  })
  @ApiOkResponse({ type: SesionIniciadaDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Faltan datos o el correo no tiene un formato válido',
  })
  @ApiUnauthorizedResponse({
    type: RespuestaErrorDto,
    description:
      'Correo o contraseña incorrectos. El mensaje no indica cuál de los dos falló.',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'El usuario está inactivo o no tiene roles asignados: debe comunicarse con el administrador',
  })
  iniciarSesion(
    @Body() datos: IniciarSesionDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SesionIniciadaDto> {
    return this.authService.iniciarSesion(datos, { ip, userAgent });
  }

  @Get('sesion')
  @CualquierUsuarioAutenticado()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Devuelve el usuario de la sesión actual',
    description:
      'Requiere un token vigente. Permite al cliente recuperar la sesión al recargar.',
  })
  @ApiOkResponse({ type: UsuarioAutenticadoDto })
  @ApiUnauthorizedResponse({
    type: RespuestaErrorDto,
    description: 'Sin token, o token vencido, revocado o inválido',
  })
  obtenerSesion(
    @UsuarioActual() usuario: UsuarioSesion,
  ): UsuarioAutenticadoDto {
    return this.authService.obtenerUsuario(usuario);
  }

  @Post('cerrar-sesion')
  @CualquierUsuarioAutenticado()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cierra la sesión actual',
    description:
      'Revoca en el servidor la sesión del token enviado (RF-01, HU-01-02). Desde ese ' +
      'momento el token deja de servir aunque no haya vencido. El cliente debe borrarlo y ' +
      'volver a la pantalla de inicio de sesión.',
  })
  @ApiNoContentResponse({ description: 'Sesión cerrada' })
  @ApiUnauthorizedResponse({
    type: RespuestaErrorDto,
    description: 'Sin token, o token vencido, revocado o inválido',
  })
  cerrarSesion(@UsuarioActual() usuario: UsuarioSesion): Promise<void> {
    return this.authService.cerrarSesion(usuario);
  }
}
