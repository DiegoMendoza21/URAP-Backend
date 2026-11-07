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
} from '@nestjs/swagger';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  ConsultarLogroRapDto,
  FiltrosLogroRapDto,
  ReporteLogroRapDto,
} from './dto/logro-rap.dto.js';
import { ReportesService } from './reportes.service.js';

const TIPO_EXCEL =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Reportes académicos. Por ahora, el de logro de los RAP del programa (RF-32). El rol abre la
 * puerta y el servicio aplica el alcance: el programa del rol o los RAP que lidera el líder.
 */
@ApiTags('Reportes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'No es Administrador, Departamento académico, Dirección del programa ni Líder RAP',
})
@Controller('reportes/logro-rap')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('filtros')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion, ROL.liderRap)
  @ApiOperation({
    summary: 'Programas, RAP y períodos del reporte de logro (RF-32, p1)',
  })
  @ApiOkResponse({ type: FiltrosLogroRapDto })
  filtros(
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<FiltrosLogroRapDto> {
    return this.reportes.filtros(usuario);
  }

  @Get()
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion, ROL.liderRap)
  @ApiOperation({
    summary: 'Reporte de logro de los RAP del programa (RF-32, HU-11-08)',
    description:
      'Por cada RAP: las asignaturas que lo evaluaron con medición cerrada en el período, su ' +
      'porcentaje en los niveles de cumplimiento frente al esperado y la comparación con ' +
      'períodos anteriores. Un RAP sin mediciones cerradas aparece como no evaluado.',
  })
  @ApiOkResponse({ type: ReporteLogroRapDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtros inválidos',
  })
  @ApiNotFoundResponse({
    type: RespuestaErrorDto,
    description:
      'El programa, el período o el RAP no existen o el usuario no tiene alcance sobre ellos',
  })
  logroRap(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarLogroRapDto,
  ): Promise<ReporteLogroRapDto> {
    return this.reportes.logroRap(usuario, consulta);
  }

  @Get('excel')
  @Roles(ROL.administrador, ROL.departamento, ROL.direccion, ROL.liderRap)
  @ApiOperation({
    summary: 'Exporta el reporte de logro a Excel (RF-32, p5)',
    description:
      'Libro con tres hojas: logro por RAP y asignatura, indicadores y comparación con ' +
      'períodos anteriores. La exportación a PDF la hace el navegador desde la pantalla.',
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
    description:
      'El programa, el período o el RAP no existen o el usuario no tiene alcance sobre ellos',
  })
  async excel(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query() consulta: ConsultarLogroRapDto,
  ): Promise<StreamableFile> {
    const { nombreArchivo, contenido } = await this.reportes.excel(
      usuario,
      consulta,
    );
    return new StreamableFile(contenido, {
      type: TIPO_EXCEL,
      disposition: `attachment; filename="${nombreArchivo}"`,
      length: contenido.length,
    });
  }
}
