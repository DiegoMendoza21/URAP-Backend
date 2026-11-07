import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
import { AuditarConsulta } from '../auditoria/auditar-consulta.decorator.js';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  IniciarMedicionDto,
  RegistrarInstrumentosDto,
  RegistrarValoracionesDto,
} from './dto/entradas.dto.js';
import {
  MedicionDetalleDto,
  MedicionesDelProyectoDto,
  ResultadoValoracionesDto,
} from './dto/respuestas.dto.js';
import { MedicionesService } from './mediciones.service.js';

/**
 * Medición de RAP (RF-30, HU-11-01 a HU-11-03). El rol abre la puerta y el servicio comprueba
 * el alcance: el docente sobre los cursos que tiene asignados, el líder RAP sobre los RAP que
 * lidera y el departamento sobre los cursos de su programa.
 */
@ApiTags('Medición de RAP')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller()
export class MedicionesController {
  constructor(private readonly mediciones: MedicionesService) {}

  @Get('proyectos-docentes/:idProyecto/mediciones')
  @Roles(ROL.docente, ROL.liderRap, ROL.departamento)
  @ApiOperation({
    summary:
      'Mediciones de RAP del curso y sus precondiciones (RF-30, p1 y p2)',
    description:
      'Dice si el proyecto está aprobado, si el curso tiene lista de estudiantes y qué RAP ' +
      'tienen rúbrica vigente, y lista las mediciones registradas. El líder RAP solo ve los ' +
      'RAP que lidera.',
  })
  @ApiOkResponse({ type: MedicionesDelProyectoDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'No es Docente responsable, Líder RAP ni Departamento académico',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto no existe o el usuario no tiene alcance sobre él',
  })
  delProyecto(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
  ): Promise<MedicionesDelProyectoDto> {
    return this.mediciones.delProyecto(usuario, idProyecto);
  }

  @Post('proyectos-docentes/:idProyecto/mediciones')
  @Roles(ROL.docente)
  @ApiOperation({
    summary: 'Inicia la medición de un RAP en el curso (RF-30, HU-11-01)',
    description:
      'Solo el docente asignado al curso. Exige el proyecto aprobado, la lista de ' +
      'estudiantes y una rúbrica vigente del RAP; la medición queda asociada a esa versión ' +
      'de la rúbrica, en borrador.',
  })
  @ApiCreatedResponse({ type: MedicionDetalleDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Datos inválidos o un RAP que no es del curso',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'No es docente asignado al curso',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto no existe o el usuario no tiene alcance sobre él',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'Proyecto sin aprobar, curso sin lista de estudiantes, RAP sin rúbrica vigente, ' +
      'programa sin escala o medición ya existente para el RAP, el tipo y el año',
  })
  iniciar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Body() datos: IniciarMedicionDto,
  ): Promise<MedicionDetalleDto> {
    return this.mediciones.iniciar(usuario, idProyecto, datos);
  }

  @Get('mediciones/:id')
  @Roles(ROL.docente, ROL.liderRap, ROL.departamento)
  // Valoraciones individuales (Ley 1581): cada consulta queda en auditoría con usuario e IP.
  @AuditarConsulta('medicion_rap')
  @ApiOperation({
    summary: 'Hoja de valoración de la medición (RF-30, p3 a p6)',
    description:
      'Rúbrica con sus indicadores e instrumentos, escala del programa y nivel de cada ' +
      'estudiante en cada indicador. Datos personales (Ley 1581 de 2012): solo el docente ' +
      'asignado, el líder del RAP y el departamento del programa.',
  })
  @ApiOkResponse({ type: MedicionDetalleDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'No es Docente responsable, Líder RAP ni Departamento académico',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'La medición no existe o el usuario no tiene alcance sobre ella',
  })
  obtener(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MedicionDetalleDto> {
    return this.mediciones.obtener(usuario, id);
  }

  @Put('mediciones/:id/instrumentos')
  @Roles(ROL.docente)
  @ApiOperation({
    summary: 'Registra el instrumento de cada indicador (RF-30, p4; HU-11-02)',
    description: 'Solo cambia los indicadores enviados. Medición en borrador.',
  })
  @ApiOkResponse({ type: MedicionDetalleDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Datos inválidos o un indicador que no es de la rúbrica de la medición',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'No es docente asignado al curso',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'La medición no existe o el usuario no tiene alcance sobre ella',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'La medición está cerrada',
  })
  registrarInstrumentos(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: RegistrarInstrumentosDto,
  ): Promise<MedicionDetalleDto> {
    return this.mediciones.registrarInstrumentos(usuario, id, datos);
  }

  @Put('mediciones/:id/valoraciones')
  @Roles(ROL.docente)
  @ApiOperation({
    summary:
      'Registra el nivel de los estudiantes por indicador (RF-30, p6; HU-11-03)',
    description:
      'Guarda las celdas enviadas, todo o nada. Un valor nulo deja al estudiante sin ' +
      'valorar en ese indicador: queda fuera de la muestra. Medición en borrador.',
  })
  @ApiOkResponse({ type: ResultadoValoracionesDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Datos inválidos, una celda repetida, un indicador ajeno a la medición, un ' +
      'estudiante que no es del curso o un nivel que no está en la escala',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'No es docente asignado al curso',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'La medición no existe o el usuario no tiene alcance sobre ella',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'La medición está cerrada',
  })
  registrarValoraciones(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: RegistrarValoracionesDto,
  ): Promise<ResultadoValoracionesDto> {
    return this.mediciones.registrarValoraciones(usuario, id, datos);
  }
}
