import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decoradores/roles.decorator.js';
import { UsuarioActual } from '../auth/decoradores/usuario-actual.decorator.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  ArchivoListaInterceptor,
  CAMPO_ARCHIVO,
} from './archivo-lista.interceptor.js';
import { ConsultarMatriculadosDto } from './dto/consultar-matriculados.dto.js';
import {
  PaginaMatriculadosDto,
  ResultadoCargaMatriculadosDto,
} from './dto/respuestas.dto.js';
import { MatriculasService } from './matriculas.service.js';

@ApiTags('Estudiantes matriculados')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin token, o token vencido, revocado o inválido',
})
@ApiNotFoundResponse({
  type: RespuestaErrorDto,
  description: 'El proyecto no existe o el usuario no tiene acceso a él',
})
@Controller('proyectos-docentes/:idProyecto/matriculados')
export class MatriculasController {
  constructor(private readonly matriculas: MatriculasService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(ROL.administrador)
  @UseInterceptors(ArchivoListaInterceptor)
  @ApiOperation({
    summary:
      'Carga la lista de estudiantes matriculados del curso (RF-22, HU-09-01)',
    description:
      'Recibe un Excel (.xlsx) con las columnas Documento, Nombres, Apellidos y, si se ' +
      'quiere, Correo, y reemplaza la lista del curso. Los que no aparecen quedan retirados, ' +
      'sin borrarse. Si una fila tiene un error no se guarda ninguna, y `detalles` dice qué ' +
      'fila falló y por qué. Solo el Administrador.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [CAMPO_ARCHIVO],
      properties: {
        [CAMPO_ARCHIVO]: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: ResultadoCargaMatriculadosDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Sin archivo, más de un archivo o un archivo que no es .xlsx',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'No es Administrador',
  })
  @ApiPayloadTooLargeResponse({
    type: RespuestaErrorDto,
    description:
      'Supera el tamaño máximo de archivo del parámetro archivo_tamano_maximo_mb',
  })
  @ApiUnprocessableEntityResponse({
    type: RespuestaErrorDto,
    description:
      'El archivo no se puede leer, le faltan columnas, no tiene estudiantes o tiene filas ' +
      'con errores (documento repetido o inválido, nombres o apellidos vacíos, correo inválido)',
  })
  cargar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Req() peticion: Request,
  ): Promise<ResultadoCargaMatriculadosDto> {
    return this.matriculas.cargar(usuario, idProyecto, peticion.file);
  }

  @Get()
  @Roles(ROL.administrador, ROL.docente)
  @ApiOperation({
    summary: 'Lista de estudiantes del curso (RF-22)',
    description:
      'Datos personales (Ley 1581 de 2012): solo el Administrador y los docentes asignados ' +
      'al proyecto. `ultimaCarga` es nulo si el curso todavía no tiene lista.',
  })
  @ApiOkResponse({ type: PaginaMatriculadosDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Paginación o estado inválidos',
  })
  @ApiForbiddenResponse({
    type: RespuestaErrorDto,
    description: 'No es Administrador ni Docente responsable',
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @Query() consulta: ConsultarMatriculadosDto,
  ): Promise<PaginaMatriculadosDto> {
    return this.matriculas.listar(usuario, idProyecto, consulta);
  }
}
