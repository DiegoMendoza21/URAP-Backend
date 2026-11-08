import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConsultarProyectosDocentesDto } from '../proyectos-docentes/dto/consultas.dto.js';
import { PendientesDocenteDto } from './dto/respuestas.dto.js';
import { SesionesService } from './sesiones.service.js';

@ApiTags('Calendario de sesiones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('sesiones')
export class PendientesController {
  constructor(private readonly sesiones: SesionesService) {}

  @Get('pendientes')
  @Permiso('clases', 'actualizar')
  @ApiOperation({
    summary:
      'Sesiones vencidas y por vencer del docente, para su panel (RF-23, p5)',
    description:
      'Cuenta las sesiones vencidas sin diligenciar y las por vencer de los proyectos en los ' +
      'que el docente que consulta está asignado, con el período abierto. Lista los proyectos ' +
      'con pendientes, los más atrasados primero. Las de tipo festivo no cuentan.',
  })
  @ApiOkResponse({ type: PendientesDocenteDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Paginación inválida',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Ninguno de los roles del usuario registra clases (permiso `clases.actualizar`)',
  })
  pendientes(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarProyectosDocentesDto,
  ): Promise<PendientesDocenteDto> {
    return this.sesiones.pendientesDelDocente(usuario, consulta);
  }
}
