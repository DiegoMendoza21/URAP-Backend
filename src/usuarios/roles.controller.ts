import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
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
import { ROL } from '../auth/roles.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  ConsultarRolesDto,
  CrearRolDto,
  EditarRolDto,
  MatrizPermisosDto,
  PaginaRolesDto,
  ReemplazarPermisosDto,
  RolDto,
} from './dto/roles.dto.js';
import { RolesService } from './roles.service.js';

/** RF-03: roles del sistema y matriz de permisos. Precondición: rol Administrador. */
@ApiTags('Roles y permisos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description: 'El usuario no tiene el rol Administrador',
})
@Roles(ROL.administrador)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista los roles, activos e inactivos, con sus permisos (HU-02-05)',
  })
  @ApiOkResponse({ type: PaginaRolesDto })
  listar(@Query() consulta: ConsultarRolesDto): Promise<PaginaRolesDto> {
    return this.roles.listar(consulta);
  }

  @Get('matriz')
  @ApiOperation({
    summary: 'Matriz de permisos: módulos × permisos × roles (HU-02-06)',
  })
  @ApiOkResponse({ type: MatrizPermisosDto })
  matriz(): Promise<MatrizPermisosDto> {
    return this.roles.matriz();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un rol con sus permisos' })
  @ApiOkResponse({ type: RolDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  obtener(@Param('id', ParseIntPipe) id: number): Promise<RolDto> {
    return this.roles.obtener(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un rol con sus permisos (HU-02-05)',
    description: 'Exige al menos un permiso de lectura (RF-03, p4).',
  })
  @ApiCreatedResponse({ type: RolDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Sin permiso de lectura, o módulo o permiso inexistente',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'Ya existe un rol con ese nombre',
  })
  crear(@Body() datos: CrearRolDto): Promise<RolDto> {
    return this.roles.crear(datos);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita el nombre o la descripción de un rol (HU-02-05)',
    description:
      'Los seis roles del sistema solo admiten cambiar su descripción.',
  })
  @ApiOkResponse({ type: RolDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'Nombre repetido, o intento de renombrar un rol del sistema',
  })
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: EditarRolDto,
  ): Promise<RolDto> {
    return this.roles.editar(id, datos);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Inactiva un rol (HU-02-05)',
    description:
      'Borrado lógico (NFR-017): el rol queda inactivo y conserva su historial. No se permite ' +
      'con usuarios activos asociados (RF-03, p3) ni para los roles del sistema.',
  })
  @ApiOkResponse({ type: RolDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'El rol tiene usuarios activos o es un rol del sistema',
  })
  inactivar(@Param('id', ParseIntPipe) id: number): Promise<RolDto> {
    return this.roles.inactivar(id);
  }

  @Put(':id/permisos')
  @ApiOperation({
    summary: 'Reemplaza los permisos de un rol (HU-02-06)',
    description:
      'Rige desde la siguiente petición de los usuarios afectados (RF-03, q1). Exige un permiso ' +
      'de lectura y que algún usuario activo conserve la administración de usuarios y roles.',
  })
  @ApiOkResponse({ type: RolDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Sin permiso de lectura, o módulo o permiso inexistente',
  })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Se retiraría la administración de usuarios y roles al último usuario que la tiene',
  })
  reemplazarPermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: ReemplazarPermisosDto,
  ): Promise<RolDto> {
    return this.roles.reemplazarPermisos(id, datos);
  }
}
