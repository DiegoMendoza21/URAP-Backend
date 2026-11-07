import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
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
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConsultarCalendarioDto } from './dto/consultas.dto.js';
import { GuardarHorarioDto } from './dto/horario.dto.js';
import {
  CalendarioSesionesDto,
  HorarioCursoDto,
  ResultadoGeneracionDto,
} from './dto/respuestas.dto.js';
import { SesionesService } from './sesiones.service.js';

const NO_VISIBLE = {
  type: RespuestaErrorDto,
  description: 'El proyecto no existe o el usuario no tiene acceso a él',
};
const SOLO_EDICION = {
  type: RespuestaErrorDto,
  description:
    'El usuario no tiene un rol que modifique el registro de clases, o ve el proyecto pero ' +
    'no es su docente asignado ni el administrador',
};

@ApiTags('Calendario de sesiones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('proyectos-docentes/:idProyecto')
export class SesionesController {
  constructor(private readonly sesiones: SesionesService) {}

  @Get('horario')
  @Roles(
    ROL.administrador,
    ROL.departamento,
    ROL.direccion,
    ROL.liderRap,
    ROL.docente,
  )
  @ApiOperation({
    summary: 'Días y horas de clase del curso (HU-08-02)',
    description: 'Lo consultan quienes ven el proyecto docente.',
  })
  @ApiOkResponse({ type: HorarioCursoDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'El usuario no tiene un rol que consulte proyectos docentes',
  })
  @ApiNotFoundResponse(NO_VISIBLE)
  obtenerHorario(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
  ): Promise<HorarioCursoDto> {
    return this.sesiones.obtenerHorario(usuario, idProyecto);
  }

  @Put('horario')
  @Roles(ROL.docente, ROL.administrador)
  @ApiOperation({
    summary: 'Define los días y horas de clase del curso (HU-08-02)',
    description:
      'Reemplaza el horario completo. Solo el docente asignado al proyecto o el ' +
      'administrador. El calendario no cambia hasta generarlo de nuevo.',
  })
  @ApiOkResponse({ type: HorarioCursoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Sin días, día fuera de lunes a sábado, día repetido u hora de fin no posterior a la de inicio',
  })
  @ApiForbiddenResponse(SOLO_EDICION)
  @ApiNotFoundResponse(NO_VISIBLE)
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'El período académico del proyecto está cerrado',
  })
  guardarHorario(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Body() datos: GuardarHorarioDto,
  ): Promise<HorarioCursoDto> {
    return this.sesiones.guardarHorario(usuario, idProyecto, datos);
  }

  @Get('calendario')
  @Roles(
    ROL.administrador,
    ROL.departamento,
    ROL.direccion,
    ROL.liderRap,
    ROL.docente,
  )
  @ApiOperation({
    summary: 'Calendario de sesiones del curso (RF-19, p5)',
    description:
      'Sesiones en orden de fecha, con su semana, tipo y festivo. Lo consultan quienes ven ' +
      'el proyecto docente.',
  })
  @ApiOkResponse({ type: CalendarioSesionesDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Paginación inválida',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'El usuario no tiene un rol que consulte proyectos docentes',
  })
  @ApiNotFoundResponse(NO_VISIBLE)
  consultarCalendario(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Query() consulta: ConsultarCalendarioDto,
  ): Promise<CalendarioSesionesDto> {
    return this.sesiones.consultarCalendario(usuario, idProyecto, consulta);
  }

  @Post('calendario')
  @HttpCode(HttpStatus.OK)
  @Roles(ROL.docente, ROL.administrador)
  @ApiOperation({
    summary: 'Genera o recalcula el calendario de sesiones (HU-08-03)',
    description:
      'Una sesión por día de clase del período, numerada por semana, marcando como festivo ' +
      'las que coinciden con la tabla de festivos. Si ya existe, recalcula las sesiones sin ' +
      'diligenciar y deja intactas las diligenciadas. Si un año no tiene festivos, genera sin ' +
      'marcas, lo advierte y avisa al administrador (excepción p3).',
  })
  @ApiOkResponse({ type: ResultadoGeneracionDto })
  @ApiForbiddenResponse(SOLO_EDICION)
  @ApiNotFoundResponse(NO_VISIBLE)
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'El curso no tiene horario, el período no tiene fechas o el período está cerrado',
  })
  generarCalendario(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
  ): Promise<ResultadoGeneracionDto> {
    return this.sesiones.generarCalendario(usuario, idProyecto);
  }
}
