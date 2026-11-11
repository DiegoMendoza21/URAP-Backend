import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConsultaAuditoriaService } from './consulta-auditoria.service.js';
import { ConsultarAuditoriaDto } from './dto/consultar-auditoria.dto.js';
import {
  DetalleAuditoriaDto,
  PaginaAuditoriaDto,
} from './dto/respuestas.dto.js';

/**
 * RF-29, p4: consulta de la auditoría. Solo tiene lecturas: los registros no se modifican ni
 * se eliminan (excepción p4).
 *
 * Es la consulta completa, la del Administrador: exige `auditoria.administrar`, que en la
 * matriz inicial (Tabla 11) solo tiene él. El Departamento y la Dirección tienen en la tabla
 * una consulta «restringida» (`auditoria.leer`) cuyo alcance el programa no ha definido: no
 * se construye todavía, y por eso `leer` no abre nada aquí.
 */
@ApiTags('Auditoría')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description: 'El usuario no tiene el permiso de administrar la auditoría',
})
@Permiso('auditoria', 'administrar')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly consulta: ConsultaAuditoriaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Registros de auditoría, del más reciente al más antiguo, con filtros (HU-14-02)',
    description:
      'Filtra por rango de fechas, usuario, acción y entidad. La acción se pide con ' +
      '`evento`, en palabras del dominio (inicio_sesion, devolucion…), que es como llega ' +
      'en cada registro, o con `accion`, en las del modelo de datos. Con la entidad y el ' +
      'identificador del registro devuelve el historial completo de ese registro (HU-14-03). ' +
      'La consulta deja su propia constancia en auditoría, como mucho una por persona y por hora.',
  })
  @ApiOkResponse({ type: PaginaAuditoriaDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Filtro no válido',
  })
  listar(
    @Query() consulta: ConsultarAuditoriaDto,
  ): Promise<PaginaAuditoriaDto> {
    return this.consulta.listar(consulta);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Un registro de auditoría con su valor anterior y su valor nuevo (HU-14-03)',
  })
  @ApiOkResponse({ type: DetalleAuditoriaDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto })
  obtener(@Param('id', ParseIntPipe) id: number): Promise<DetalleAuditoriaDto> {
    return this.consulta.obtener(id);
  }
}
