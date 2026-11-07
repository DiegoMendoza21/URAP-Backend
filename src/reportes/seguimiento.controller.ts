import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  ConsultarSeguimientoDto,
  FiltrarSeguimientoDto,
  FiltrosSeguimientoDto,
  PaginaSeguimientoDto,
} from './dto/seguimiento.dto.js';
import { aDescarga, TIPO_EXCEL } from './excel.js';
import { SeguimientoService } from './seguimiento.service.js';

/**
 * Tablero de seguimiento del diligenciamiento (RF-25). El rol abre la puerta y el servicio
 * aplica el alcance: los programas del rol del usuario.
 */
@ApiTags('Seguimiento del diligenciamiento')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'No es Administrador, Departamento académico ni Dirección del programa',
})
@Controller('seguimiento')
export class SeguimientoController {
  constructor(private readonly seguimiento: SeguimientoService) {}

  @Get('filtros')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({
    summary: 'Opciones de los filtros del tablero (RF-25, p2)',
    description:
      'Programas, períodos, asignaturas y docentes dentro del alcance del usuario.',
  })
  @ApiOkResponse({ type: FiltrosSeguimientoDto })
  filtros(
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<FiltrosSeguimientoDto> {
    return this.seguimiento.filtros(usuario);
  }

  @Get('tablero')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({
    summary:
      'Tablero del estado de diligenciamiento del período (RF-25, HU-12-01)',
    description:
      'Por proyecto: secciones completas, sesiones registradas frente a programadas, ' +
      'vencidas, evidencias por RAP, estado y un color. Sin período, el activo más reciente.',
  })
  @ApiOkResponse({ type: PaginaSeguimientoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtros inválidos',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El período no existe',
  })
  tablero(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarSeguimientoDto,
  ): Promise<PaginaSeguimientoDto> {
    return this.seguimiento.tablero(usuario, consulta);
  }

  @Get('tablero/excel')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({ summary: 'Exporta el tablero a Excel (RF-25, p5)' })
  @ApiProduces(TIPO_EXCEL)
  @ApiOkResponse({
    description: 'Libro de Excel (.xlsx)',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtros inválidos',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El período no existe',
  })
  @ApiUnprocessableEntityResponse({
    type: RespuestaErrorDto,
    description:
      'Supera el máximo de filas exportables: hay que restringir los filtros',
  })
  async tableroExcel(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() filtros: FiltrarSeguimientoDto,
  ): Promise<StreamableFile> {
    return aDescarga(await this.seguimiento.excel(usuario, filtros, false));
  }

  @Get('pendientes')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({
    summary: 'Proyectos con pendientes, por gravedad (RF-25, HU-12-02)',
    description:
      'Los proyectos con secciones incompletas o sesiones vencidas, del más grave al menos ' +
      'grave: primero los de color rojo, luego por sesiones atrasadas y secciones incompletas.',
  })
  @ApiOkResponse({ type: PaginaSeguimientoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtros inválidos',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El período no existe',
  })
  pendientes(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarSeguimientoDto,
  ): Promise<PaginaSeguimientoDto> {
    return this.seguimiento.pendientes(usuario, consulta);
  }

  @Get('pendientes/excel')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({
    summary: 'Exporta la lista de pendientes a Excel (HU-12-02)',
  })
  @ApiProduces(TIPO_EXCEL)
  @ApiOkResponse({
    description: 'Libro de Excel (.xlsx)',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtros inválidos',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El período no existe',
  })
  @ApiUnprocessableEntityResponse({
    type: RespuestaErrorDto,
    description:
      'Supera el máximo de filas exportables: hay que restringir los filtros',
  })
  async pendientesExcel(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() filtros: FiltrarSeguimientoDto,
  ): Promise<StreamableFile> {
    return aDescarga(await this.seguimiento.excel(usuario, filtros, true));
  }
}
