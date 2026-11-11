import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiCreatedResponse,
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
import {
  CambiarEstadoUsuarioDto,
  ConsultarUsuariosDto,
  ContrasenaTemporalDto,
  CrearUsuarioDto,
  DetalleUsuarioDto,
  EditarUsuarioDto,
  HistorialRolesDto,
  OpcionesUsuariosDto,
  PaginaUsuariosDto,
  RolParaAsignarDto,
  UsuarioCreadoDto,
} from './dto/usuarios.dto.js';
import { UsuariosService } from './usuarios.service.js';

/**
 * RF-02: gestión de usuarios. La matriz inicial (Tabla 11) da `usuarios.administrar` al
 * Administrador y `usuarios.leer` al Departamento y a la Dirección: ellos consultan a los
 * usuarios de su programa y no cambian nada. El Docente, el Líder RAP y el Estudiante no
 * tienen acceso.
 *
 * No hay ruta para eliminar: un usuario se inactiva (RF-02, excepción p6; NFR-017).
 */
@ApiTags('Usuarios')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description: 'El usuario no tiene el permiso que exige la operación',
})
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @Permiso('usuarios', 'leer')
  @ApiOperation({
    summary:
      'Usuarios con filtros por programa, rol y estado, paginados (HU-02-04)',
    description:
      'No trae el documento de identidad. Quien consulta con un rol limitado a un programa ' +
      've solo a los usuarios de ese programa.',
  })
  @ApiOkResponse({ type: PaginaUsuariosDto })
  @ApiBadRequestResponse({ type: RespuestaErrorDto })
  listar(
    @Query() consulta: ConsultarUsuariosDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<PaginaUsuariosDto> {
    return this.usuarios.listar(consulta, usuario);
  }

  @Get('opciones')
  @Permiso('usuarios', 'leer')
  @ApiOperation({
    summary: 'Programas y roles para los filtros y el formulario de usuarios',
  })
  @ApiOkResponse({ type: OpcionesUsuariosDto })
  opciones(
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<OpcionesUsuariosDto> {
    return this.usuarios.opciones(usuario);
  }

  @Get(':id')
  @Permiso('usuarios', 'leer')
  @ApiOperation({
    summary: 'Un usuario con sus roles vigentes',
    description:
      'El documento de identidad solo llega a quien tiene `usuarios.administrar`.',
  })
  @ApiOkResponse({ type: DetalleUsuarioDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    return this.usuarios.obtener(id, usuario);
  }

  @Post()
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary: 'Crea un usuario activo con uno o varios roles (HU-02-01)',
    description:
      'Devuelve una contraseña temporal una sola vez: el sistema guarda su hash y no la ' +
      'puede volver a mostrar.',
  })
  @ApiCreatedResponse({ type: UsuarioCreadoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Datos no válidos, o programa o rol inexistente',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'Ya existe un usuario con ese correo o ese documento',
  })
  crear(
    @Body() datos: CrearUsuarioDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<UsuarioCreadoDto> {
    return this.usuarios.crear(datos, usuario);
  }

  @Patch(':id')
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary: 'Edita los datos de un usuario (HU-02-02)',
    description: 'Solo llegan los campos que cambian.',
  })
  @ApiOkResponse({ type: DetalleUsuarioDto })
  @ApiBadRequestResponse({ type: RespuestaErrorDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'Ya existe otro usuario con ese correo o ese documento',
  })
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: EditarUsuarioDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    return this.usuarios.editar(id, datos, usuario);
  }

  @Patch(':id/estado')
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary: 'Inactiva o reactiva un usuario (HU-02-03)',
    description:
      'Un usuario inactivo no puede iniciar sesión y sus sesiones abiertas dejan de servir. ' +
      'Nadie se inactiva a sí mismo.',
  })
  @ApiOkResponse({ type: DetalleUsuarioDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Es su propio usuario, o no quedaría nadie administrando usuarios y roles',
  })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: CambiarEstadoUsuarioDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    return this.usuarios.cambiarEstado(id, datos.activo, usuario);
  }

  @Post(':id/contrasena-temporal')
  @HttpCode(200)
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary: 'Genera una contraseña temporal nueva para el usuario',
    description:
      'Se devuelve una sola vez. Cierra las demás sesiones del usuario y levanta el ' +
      'bloqueo por intentos fallidos.',
  })
  @ApiOkResponse({ type: ContrasenaTemporalDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  generarContrasena(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<ContrasenaTemporalDto> {
    return this.usuarios.generarContrasena(id, usuario);
  }

  @Post(':id/roles')
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary: 'Asigna un rol al usuario sobre un programa (HU-02-07)',
    description:
      'Queda registrado quién lo asignó y cuándo. Un usuario puede tener varios roles ' +
      'vigentes. Si ya tuvo ese rol y se le revocó, vuelve a quedar vigente.',
  })
  @ApiCreatedResponse({ type: DetalleUsuarioDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Rol o programa inexistente',
  })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'El usuario ya tiene ese rol vigente sobre ese programa',
  })
  asignarRol(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: RolParaAsignarDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    return this.usuarios.asignarRol(id, datos, usuario);
  }

  @Delete(':id/roles/:idAsignacion')
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary: 'Revoca un rol del usuario (HU-02-07)',
    description:
      'La revocación es lógica: la asignación queda inactiva, con su fecha. Nadie se quita ' +
      'a sí mismo el rol con el que administra usuarios.',
  })
  @ApiOkResponse({ type: DetalleUsuarioDto })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El usuario no existe o no tiene ese rol vigente',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Es su propio rol de administración, o no quedaría nadie administrando usuarios y roles',
  })
  revocarRol(
    @Param('id', ParseIntPipe) id: number,
    @Param('idAsignacion', ParseIntPipe) idAsignacion: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<DetalleUsuarioDto> {
    return this.usuarios.revocarRol(id, idAsignacion, usuario);
  }

  @Get(':id/roles/historial')
  @Permiso('usuarios', 'administrar')
  @ApiOperation({
    summary:
      'Historial de roles del usuario: quién tuvo qué rol y cuándo (HU-02-07)',
    description:
      'Sale de la auditoría. Solo para quien administra usuarios: dice quién hizo cada cambio.',
  })
  @ApiOkResponse({ type: HistorialRolesDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  historialRoles(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<HistorialRolesDto> {
    return this.usuarios.historialRoles(id, usuario);
  }
}
