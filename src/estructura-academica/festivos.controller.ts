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
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import {
  CargarFestivosLeyDto,
  ConsultarFestivosDto,
  CrearFestivoDto,
  EditarFestivoDto,
  EliminarFestivoDto,
  ListaFestivosDto,
  ResultadoCargaLeyDto,
  ResultadoFestivoDto,
} from './dto/festivos.dto.js';
import { FestivosService } from './festivos.service.js';

const RECALCULO =
  'Recalcula los calendarios ya generados de los períodos abiertos que tocan la fecha, sin ' +
  'tocar las sesiones diligenciadas (RF-19, excepción p5).';

/**
 * HU-08-01 (RF-19): días festivos y días no hábiles de la Universidad, por año. Es parte de la
 * parametrización de la estructura académica (RF-04), que en la matriz de permisos (Tabla 11)
 * solo administra el Administrador.
 */
@ApiTags('Días festivos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'El usuario no tiene el permiso de administrar la estructura académica',
})
@Permiso('estructura', 'administrar')
@Controller('festivos')
export class FestivosController {
  constructor(private readonly festivos: FestivosService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los días sin clase de un año (HU-08-01)',
    description:
      'Festivos de ley, días institucionales y ajustes, con cuántas sesiones marca cada uno. ' +
      'Dice además cuántos festivos de ley del año faltan por cargar.',
  })
  @ApiOkResponse({ type: ListaFestivosDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Año no válido',
  })
  listar(@Query() consulta: ConsultarFestivosDto): Promise<ListaFestivosDto> {
    return this.festivos.listar(consulta.anio);
  }

  @Post('ley')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Carga los festivos de ley de un año (Ley 51 de 1983)',
    description:
      'Calcula los festivos del año, con los traslados al lunes y los que dependen de la ' +
      'Pascua, y agrega los que falten. Las fechas que ya están se conservan como están. ' +
      RECALCULO,
  })
  @ApiOkResponse({ type: ResultadoCargaLeyDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Año no válido',
  })
  cargarLey(
    @Body() datos: CargarFestivosLeyDto,
  ): Promise<ResultadoCargaLeyDto> {
    return this.festivos.cargarLey(datos.anio);
  }

  @Post()
  @ApiOperation({
    summary: 'Agrega un día sin clase (HU-08-01)',
    description:
      'Un festivo o un día no hábil de la Universidad: receso, día cívico. ' +
      RECALCULO,
  })
  @ApiCreatedResponse({ type: ResultadoFestivoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Fecha, nombre u origen no válidos',
  })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'Esa fecha ya está en la tabla',
  })
  crear(@Body() datos: CrearFestivoDto): Promise<ResultadoFestivoDto> {
    return this.festivos.crear(datos);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita un día sin clase (HU-08-01)',
    description:
      'Cambia su fecha, su nombre o su origen. Si cambia la fecha: ' +
      RECALCULO,
  })
  @ApiParam({ name: 'id', example: 12 })
  @ApiOkResponse({ type: ResultadoFestivoDto })
  @ApiBadRequestResponse({
    type: RespuestaErrorDto,
    description: 'Fecha, nombre u origen no válidos',
  })
  @ApiNotFoundResponse({ type: RespuestaErrorDto, description: 'No existe' })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'La fecha nueva ya está en la tabla',
  })
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: EditarFestivoDto,
  ): Promise<ResultadoFestivoDto> {
    return this.festivos.editar(id, datos);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Quita un día sin clase (HU-08-01)',
    description:
      'Si el día marca sesiones de algún calendario, pide confirmar con `confirmar=true`. ' +
      RECALCULO,
  })
  @ApiParam({ name: 'id', example: 12 })
  @ApiOkResponse({ type: ResultadoFestivoDto })
  @ApiNotFoundResponse({ type: RespuestaErrorDto, description: 'No existe' })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'El día marca sesiones y no se confirmó',
  })
  eliminar(
    @Param('id', ParseIntPipe) id: number,
    @Query() consulta: EliminarFestivoDto,
  ): Promise<ResultadoFestivoDto> {
    return this.festivos.eliminar(id, consulta.confirmar === true);
  }
}
