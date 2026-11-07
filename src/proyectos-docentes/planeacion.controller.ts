import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
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
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { BibliografiaService } from './bibliografia.service.js';
import { ContenidosService } from './contenidos.service.js';
import {
  NO_EDITABLE,
  NO_EXISTE,
  SIN_ROL_CONSULTA,
  SOLO_ASIGNADOS,
} from './diligenciamiento.controller.js';
import {
  GuardarBibliografiaDto,
  GuardarContenidosDto,
  GuardarEstrategiasDto,
  GuardarEvaluacionRacDto,
  ProyectoConBibliografiaDto,
  SeccionBibliografiaDto,
  SeccionContenidosDto,
  SeccionEstrategiasDto,
  SeccionEvaluacionDto,
} from './dto/planeacion.dto.js';
import { EstrategiasService } from './estrategias.service.js';
import { EvaluacionService } from './evaluacion.service.js';

/**
 * Planeación del curso en el proyecto docente (EP-06): puntos 4 a 7 del formato
 * FO-DO/PC-001. Igual que los puntos 2 y 3 (`DiligenciamientoController`): consulta quien
 * tiene `proyectos.leer` y ve el proyecto, y guarda quien tiene `proyectos.actualizar` y es
 * Docente asignado al proyecto («E propios»), mientras el estado lo permita. Cada sección se
 * guarda por separado (HU-06-08).
 */
@ApiTags('Diligenciamiento del proyecto docente')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@Controller('proyectos-docentes/:id')
export class PlaneacionController {
  constructor(
    private readonly estrategias: EstrategiasService,
    private readonly evaluacion: EvaluacionService,
    private readonly contenidos: ContenidosService,
    private readonly bibliografia: BibliografiaService,
  ) {}

  // ------------------------------------------------ Punto 4 · RF-13 · HU-06-04

  @Get('estrategias')
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Punto 4 «Estrategias metodológicas» (RF-13)',
    description:
      'El listado en orden y el catálogo sugerido, sin las estrategias que ya están.',
  })
  @ApiOkResponse({ type: SeccionEstrategiasDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  seccionEstrategias(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SeccionEstrategiasDto> {
    return this.estrategias.seccion(usuario, id);
  }

  @Put('estrategias')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary: 'Guarda el listado de estrategias metodológicas (HU-06-04)',
    description:
      'Reemplaza el listado completo: así se agregan, reordenan y eliminan. Devuelve la ' +
      'sección actualizada.',
  })
  @ApiOkResponse({ type: SeccionEstrategiasDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Una estrategia vacía, repetida o demasiado larga',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse(NO_EDITABLE)
  guardarEstrategias(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: GuardarEstrategiasDto,
  ): Promise<SeccionEstrategiasDto> {
    return this.estrategias.guardar(usuario, id, datos);
  }

  // ------------------------------------------------ Punto 5 · RF-14 · HU-06-05

  @Get('evaluacion')
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Punto 5 «Evaluación de los resultados de aprendizaje» (RF-14)',
    description:
      'Los RAC del proyecto con sus actividades e instrumentos de evaluación, y los que ' +
      'todavía no tienen (p4).',
  })
  @ApiOkResponse({ type: SeccionEvaluacionDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  seccionEvaluacion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SeccionEvaluacionDto> {
    return this.evaluacion.seccion(usuario, id);
  }

  @Put('evaluacion/:idRac')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary: 'Guarda la evaluación de un RAC (HU-06-05)',
    description:
      'Reemplaza las actividades de evaluación del RAC. Devuelve la sección completa.',
  })
  @ApiOkResponse({ type: SeccionEvaluacionDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Actividad o instrumento vacíos, peso fuera de 0,01 a 100 o demasiadas actividades',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El proyecto o el RAC no existen, o no tiene acceso',
  })
  @ApiConflictResponse(NO_EDITABLE)
  guardarEvaluacion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Param('idRac', ParseIntPipe) idRac: number,
    @Body() datos: GuardarEvaluacionRacDto,
  ): Promise<SeccionEvaluacionDto> {
    return this.evaluacion.guardar(usuario, id, idRac, datos);
  }

  // ------------------------------------------------ Punto 6 · RF-15 · HU-06-06

  @Get('contenidos')
  @Permiso('proyectos', 'leer')
  @ApiOperation({
    summary: 'Punto 6 «Contenidos del curso» (RF-15)',
    description:
      'Una fila por semana del período, las semanas sin tema y el total de horas frente al ' +
      'de la asignatura. Si la asignatura no tiene horas, lo indica en vez de suponerlas.',
  })
  @ApiOkResponse({ type: SeccionContenidosDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  seccionContenidos(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SeccionContenidosDto> {
    return this.contenidos.seccion(usuario, id);
  }

  @Put('contenidos')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary: 'Guarda los contenidos por semana (HU-06-06)',
    description:
      'Guarda la tabla completa. Si el total de horas no coincide con el de la asignatura, ' +
      'guarda igual, lo advierte en la respuesta y deja constancia en la auditoría (p4).',
  })
  @ApiOkResponse({ type: SeccionContenidosDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Semana repetida o fuera del período, tema demasiado largo u horas no válidas',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse({
    ...NO_EDITABLE,
    description: `${NO_EDITABLE.description} También si el período no tiene número de semanas.`,
  })
  guardarContenidos(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: GuardarContenidosDto,
  ): Promise<SeccionContenidosDto> {
    return this.contenidos.guardar(usuario, id, datos);
  }

  // ------------------------------------------------ Punto 7 · RF-16 · HU-06-07

  @Get('bibliografia')
  @Permiso('proyectos', 'leer')
  @ApiOperation({ summary: 'Punto 7 «Bibliografía» (RF-16)' })
  @ApiOkResponse({ type: SeccionBibliografiaDto })
  @ApiForbiddenResponse(SIN_ROL_CONSULTA)
  @ApiNotFoundResponse(NO_EXISTE)
  seccionBibliografia(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SeccionBibliografiaDto> {
    return this.bibliografia.seccion(usuario, id);
  }

  @Put('bibliografia')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary: 'Guarda la bibliografía (HU-06-07)',
    description:
      'Reemplaza el listado numerado completo: así se agregan, editan, reordenan y ' +
      'eliminan referencias. Devuelve la sección actualizada.',
  })
  @ApiOkResponse({ type: SeccionBibliografiaDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Una referencia vacía, repetida o demasiado larga',
  })
  @ApiForbiddenResponse(SOLO_ASIGNADOS)
  @ApiNotFoundResponse(NO_EXISTE)
  @ApiConflictResponse(NO_EDITABLE)
  guardarBibliografia(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: GuardarBibliografiaDto,
  ): Promise<SeccionBibliografiaDto> {
    return this.bibliografia.guardar(usuario, id, datos);
  }

  @Get('bibliografia/proyectos-para-importar')
  @Permiso('proyectos', 'actualizar')
  @ApiOperation({
    summary:
      'Proyectos de los que se puede importar la bibliografía (RF-16, p2)',
    description:
      'Otros proyectos docentes con bibliografía que el usuario puede consultar, primero ' +
      'los de la misma asignatura. Sus referencias se leen con `GET …/bibliografia`.',
  })
  @ApiOkResponse({ type: [ProyectoConBibliografiaDto] })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Ninguno de los roles del usuario tiene el permiso de editar proyectos docentes',
  })
  @ApiNotFoundResponse(NO_EXISTE)
  proyectosParaImportar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProyectoConBibliografiaDto[]> {
    return this.bibliografia.proyectosParaImportar(usuario, id);
  }
}
