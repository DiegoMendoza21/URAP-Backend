import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditarConsulta } from '../auditoria/auditar-consulta.decorator.js';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ConsultarProyectosDocentesDto } from '../proyectos-docentes/dto/consultas.dto.js';
import {
  PaginaEvidenciasRapACargoDto,
  RapsACargoDto,
} from './dto/raps-a-cargo.dto.js';
import { EvidenciasLiderRapService } from './evidencias-lider-rap.service.js';

/**
 * HU-10-04: evidencias de los RAP a cargo del Líder RAP. La matriz le da «Documentos: C
 * autorizados»; qué RAP son los suyos lo decide `lider_rap` en el servicio. Los archivos se
 * siguen descargando por `GET /proyectos-docentes/{id}/evidencias/{idEvidencia}/archivo`.
 */
@ApiTags('Evidencias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'Ninguno de los roles del usuario consulta documentos, o el RAP no está a su cargo',
})
@Controller('raps-a-cargo')
export class EvidenciasLiderRapController {
  constructor(private readonly evidencias: EvidenciasLiderRapService) {}

  @Get()
  @Permiso('documentos', 'leer')
  @ApiOperation({
    summary: 'RAP a cargo del Líder RAP, con sus evidencias (HU-10-04)',
    description:
      'Los RAP que lidera el usuario (`lider_rap` vigente), con los períodos, cuántas ' +
      'evidencias tiene cada uno y cuántos de los proyectos docentes que tributan a él las ' +
      'tienen. Vacía si el usuario no es Líder RAP o no lidera ninguno.',
  })
  @ApiOkResponse({ type: RapsACargoDto })
  rapsACargo(@UsuarioActual() usuario: UsuarioSesion): Promise<RapsACargoDto> {
    return this.evidencias.rapsACargo(usuario);
  }

  @Get(':idRap/evidencias')
  @Permiso('documentos', 'leer')
  // Fotos de clase: datos personales (Ley 1581). Queda como consulta de `rap` con el id del RAP,
  // y no de `evidencia_rap`: ahí el id es el de la evidencia que se descarga, y un mismo número
  // diría dos cosas distintas en la auditoría.
  @AuditarConsulta('rap', 'idRap')
  @ApiOperation({
    summary:
      'Evidencias de un RAP a cargo, en todas las asignaturas (HU-10-04)',
    description:
      'Paginadas, las más recientes primero, con la asignatura, el grupo, el período y el ' +
      'docente responsable de cada una. Solo de los proyectos docentes de los períodos en ' +
      'que el usuario lidera el RAP. La consulta queda en la auditoría como consulta ' +
      'sensible de `rap`, con el id del RAP.',
  })
  @ApiOkResponse({ type: PaginaEvidenciasRapACargoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Paginación inválida',
  })
  evidenciasDeRap(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idRap', ParseIntPipe) idRap: number,
    @Query() consulta: ConsultarProyectosDocentesDto,
  ): Promise<PaginaEvidenciasRapACargoDto> {
    return this.evidencias.evidenciasDeRap(usuario, idRap, consulta);
  }
}
