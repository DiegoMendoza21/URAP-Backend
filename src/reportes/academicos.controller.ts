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
import { ReportesAcademicosService } from './academicos.service.js';
import {
  ConsultarContribucionDto,
  ConsultarCumplimientoDto,
  ReporteContribucionDto,
  ReporteCumplimientoDto,
} from './dto/academicos.dto.js';
import { aDescarga, TIPO_EXCEL } from './excel.js';

const ARCHIVO_EXCEL = {
  description: 'Libro de Excel (.xlsx)',
  schema: { type: 'string', format: 'binary' },
} as const;

/**
 * Reportes académicos de RF-28. El rol abre la puerta y el servicio aplica el alcance: el
 * programa del rol o, para el Líder RAP, los RAP que lidera.
 *
 * Va con `@Roles` y no con `@Permiso` porque la matriz no expresa la regla: `reportes.leer`
 * incluye al Docente («C propios»), y estos reportes son del programa: RF-28 no fija roles, y
 * se dejaron al Administrador, el Departamento, la Dirección y, el de contribución, al Líder
 * RAP (backend #20). Pendiente de decidir con el programa si la matriz debe expresarlo
 * (URAP-34).
 */
@ApiTags('Reportes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@ApiBadRequestResponse({
  type: RespuestaErrorDto,
  description: 'Filtros inválidos',
})
@Controller('reportes')
export class ReportesAcademicosController {
  constructor(private readonly reportes: ReportesAcademicosService) {}

  @Get('cumplimiento')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({
    summary: 'Reporte de cumplimiento por período (RF-28, HU-12-03)',
    description:
      'Proyectos docentes, su estado y su diligenciamiento (secciones y sesiones), con ' +
      'filtros por período, programa, asignatura, docente y estado. Queda registrado en ' +
      'reporte_academico con el usuario y la fecha.',
  })
  @ApiOkResponse({ type: ReporteCumplimientoDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'No es Administrador, Departamento académico ni Dirección del programa',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description: 'El período no existe',
  })
  cumplimiento(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarCumplimientoDto,
  ): Promise<ReporteCumplimientoDto> {
    return this.reportes.cumplimiento(usuario, consulta);
  }

  @Get('cumplimiento/excel')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion)
  @ApiOperation({
    summary: 'Exporta el reporte de cumplimiento a Excel (RF-28, p5)',
  })
  @ApiProduces(TIPO_EXCEL)
  @ApiOkResponse(ARCHIVO_EXCEL)
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'No es Administrador, Departamento académico ni Dirección del programa',
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
  async cumplimientoExcel(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarCumplimientoDto,
  ): Promise<StreamableFile> {
    return aDescarga(await this.reportes.cumplimientoExcel(usuario, consulta));
  }

  @Get('contribucion-rac-rap')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion, ROL.liderRap)
  @ApiOperation({
    summary: 'Reporte de contribución de los RAC a los RAP (RF-28, HU-12-05)',
    description:
      'Por RAP: las asignaturas del período que contribuyen, sus docentes, los RAC ' +
      'asociados y las evidencias cargadas. El Líder RAP solo ve los RAP que lidera.',
  })
  @ApiOkResponse({ type: ReporteContribucionDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'No es Administrador, Departamento académico, Dirección del programa ni Líder RAP',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'El período no existe, o el RAP no existe o no tiene acceso a él',
  })
  contribucion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarContribucionDto,
  ): Promise<ReporteContribucionDto> {
    return this.reportes.contribucion(usuario, consulta);
  }

  @Get('contribucion-rac-rap/excel')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion, ROL.liderRap)
  @ApiOperation({
    summary: 'Exporta el reporte de contribución RAC-RAP a Excel (RF-28, p5)',
  })
  @ApiProduces(TIPO_EXCEL)
  @ApiOkResponse(ARCHIVO_EXCEL)
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'No es Administrador, Departamento académico, Dirección del programa ni Líder RAP',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'El período no existe, o el RAP no existe o no tiene acceso a él',
  })
  async contribucionExcel(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarContribucionDto,
  ): Promise<StreamableFile> {
    return aDescarga(await this.reportes.contribucionExcel(usuario, consulta));
  }
}
