import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { AuditarConsulta } from '../auditoria/auditar-consulta.decorator.js';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import type { ArchivoAbierto } from './almacenamiento/almacenamiento-documental.js';
import { ArchivosEvidenciaInterceptor } from './archivos-evidencia.interceptor.js';
import {
  CargarEvidenciasDto,
  FormularioCargaEvidenciasDto,
} from './dto/cargar-evidencias.dto.js';
import { ConsultarEvidenciasDto } from './dto/consultar-evidencias.dto.js';
import {
  CargaEvidenciasDto,
  OpcionesEvidenciasDto,
  PaginaEvidenciasDto,
} from './dto/respuestas.dto.js';
import { EvidenciasService } from './evidencias.service.js';

/** Roles con alguna consulta en el módulo «Documentos» de la matriz de permisos. */
const ROLES_CONSULTA = [
  ROL.administrador,
  ROL.departamento,
  ROL.direccion,
  ROL.liderRap,
  ROL.docente,
] as const;

const DESCRIPCION_ALCANCE =
  'El Docente ve las de sus proyectos; el Líder RAP, las de los RAP que lidera; el ' +
  'Departamento, la Dirección y el Administrador, las de su programa. Responde 404 si el ' +
  'usuario no ve el proyecto y 403 si lo ve pero no puede consultar ninguna de sus evidencias.';

@ApiTags('Evidencias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@ApiNotFoundResponse({
  type: RespuestaErrorDto,
  description: 'El proyecto no existe o el usuario no tiene acceso a él',
})
@Controller('proyectos-docentes/:id/evidencias')
export class EvidenciasController {
  private readonly logger = new Logger(EvidenciasController.name);

  constructor(private readonly evidencias: EvidenciasService) {}

  @Get('opciones')
  @Roles(...ROLES_CONSULTA)
  @ApiOperation({
    summary:
      'RAP, sesiones y límites para cargar y consultar evidencias (RF-24, p1 y p2)',
    description:
      `RAP del proyecto cuyas evidencias puede ver el usuario, con cuántas tiene cada uno; si ` +
      `puede cargar; las sesiones del calendario; y el tamaño y los tipos de archivo ` +
      `permitidos, de \`parametro_sistema\`. ${DESCRIPCION_ALCANCE}`,
  })
  @ApiOkResponse({ type: OpcionesEvidenciasDto })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Sin un rol que consulte evidencias, o Líder RAP sin RAP a cargo en el proyecto',
  })
  opciones(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) idProyecto: number,
  ): Promise<OpcionesEvidenciasDto> {
    return this.evidencias.opciones(usuario, idProyecto);
  }

  @Get()
  @Roles(...ROLES_CONSULTA)
  @ApiOperation({
    summary: 'Galería de evidencias del proyecto, por RAP (RF-24, p6)',
    description: `Paginada, las más recientes primero. ${DESCRIPCION_ALCANCE}`,
  })
  @ApiOkResponse({ type: PaginaEvidenciasDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Paginación o RAP inválidos',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Sin un rol que consulte evidencias, o Líder RAP sin RAP a cargo en el proyecto',
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) idProyecto: number,
    @Query() consulta: ConsultarEvidenciasDto,
  ): Promise<PaginaEvidenciasDto> {
    return this.evidencias.listar(usuario, idProyecto, consulta);
  }

  @Post()
  @Roles(ROL.docente)
  @UseInterceptors(ArchivosEvidenciaInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: FormularioCargaEvidenciasDto })
  @ApiOperation({
    summary:
      'Carga evidencias fotográficas de un RAP del proyecto (RF-24, p3 a p5)',
    description:
      'Uno o varios archivos con la misma descripción, fecha y, si corresponde, sesión. Solo ' +
      'los docentes del proyecto (`proyecto_docente_docente`). Es todo o nada: si un archivo ' +
      'no pasa la validación, no se guarda ninguno. El archivo va al almacenamiento ' +
      'documental y la base guarda solo su referencia.',
  })
  @ApiCreatedResponse({ type: CargaEvidenciasDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description:
      'Sin archivos o con más de los permitidos por carga, sin descripción, fecha inválida o ' +
      'futura, RAP que no es del proyecto o sesión de otro calendario',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'No es Docente, o no es uno de los docentes del proyecto',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description:
      'El período del proyecto está cerrado, o el proyecto no tiene RAP',
  })
  @ApiPayloadTooLargeResponse({
    type: RespuestaErrorDto,
    description:
      'Un archivo supera el tamaño máximo; el mensaje dice el límite (p4)',
  })
  @ApiUnsupportedMediaTypeResponse({
    type: RespuestaErrorDto,
    description: 'Un archivo no es de un tipo permitido (p4)',
  })
  @ApiServiceUnavailableResponse({
    type: RespuestaErrorDto,
    description:
      'Falló el almacenamiento documental; no quedó nada guardado y se puede reintentar (p5)',
  })
  cargar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) idProyecto: number,
    @Body() datos: CargarEvidenciasDto,
    @UploadedFiles() archivos: Express.Multer.File[] | undefined,
  ): Promise<CargaEvidenciasDto> {
    return this.evidencias.cargar(usuario, idProyecto, datos, archivos ?? []);
  }

  @Get(':idEvidencia/archivo')
  @Roles(...ROLES_CONSULTA)
  // Una foto de clase es un dato personal (Ley 1581): cada descarga que no falla queda en
  // auditoría con usuario e IP, también la revalidación con 304.
  @AuditarConsulta('evidencia_rap', 'idEvidencia')
  @ApiProduces('image/jpeg', 'image/png', 'application/pdf')
  @ApiOperation({
    summary: 'Descarga el archivo de una evidencia (NFR-007)',
    description:
      'Los archivos nunca son públicos: se entregan solo por aquí, con la sesión iniciada y ' +
      `el mismo alcance de la galería. Cada descarga queda en la auditoría. ${DESCRIPCION_ALCANCE}`,
  })
  @ApiOkResponse({
    description: 'El archivo, con su tipo',
    content: {
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 304,
    description: 'El navegador ya tiene esta versión (If-None-Match)',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description:
      'Sin un rol que consulte evidencias, o Líder RAP sin RAP a cargo en el proyecto',
  })
  @ApiServiceUnavailableResponse({
    type: RespuestaErrorDto,
    description: 'No se pudo leer el almacenamiento documental',
  })
  async descargar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) idProyecto: number,
    @Param('idEvidencia', ParseIntPipe) idEvidencia: number,
    @Req() peticion: Request,
    @Res() respuesta: Response,
  ): Promise<void> {
    const evidencia = await this.evidencias.evidenciaParaDescarga(
      usuario,
      idProyecto,
      idEvidencia,
    );
    // Una evidencia no cambia nunca, así que su identificador sirve de versión. «private» evita
    // que la guarde un proxy intermedio y «no-cache» obliga al navegador a preguntar cada vez:
    // si la sesión ya no es válida, no vuelve a mostrar la foto.
    respuesta.set({
      'Cache-Control': 'private, no-cache',
      ETag: `"evidencia-${evidencia.id}-${evidencia.tamanoBytes}"`,
    });
    if (peticion.fresh) {
      respuesta.status(304).end();
      return;
    }

    let archivo: ArchivoAbierto;
    try {
      archivo = await this.evidencias.abrirArchivo(usuario, evidencia);
    } catch (error) {
      // El error no puede quedar en caché con la versión de la foto: el navegador lo
      // revalidaría con un 304 y seguiría mostrándolo aunque el archivo vuelva a estar.
      respuesta.removeHeader('ETag');
      respuesta.set('Cache-Control', 'no-store');
      throw error;
    }
    respuesta.status(200).set({
      'Content-Type': evidencia.tipo,
      'Content-Length': String(archivo.tamanoBytes),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': disposicionEnLinea(evidencia.nombreOriginal),
    });
    try {
      await pipeline(archivo.contenido, respuesta);
    } catch (error) {
      // El navegador cerró la conexión a mitad de la descarga: no hay a quién responder.
      this.logger.warn(
        `Se interrumpió la descarga de la evidencia ${evidencia.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * «Content-Disposition» para ver el archivo en el navegador con su nombre original. Va el
 * nombre en ASCII para los navegadores antiguos y el completo en UTF-8 (RFC 6266).
 */
export function disposicionEnLinea(nombre: string): string {
  const ascii = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
  const codificado = encodeURIComponent(nombre).replace(
    /['()*]/g,
    (caracter) => `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}
