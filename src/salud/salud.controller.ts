import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Publico } from '../auth/decoradores/publico.decorator.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { EstadoSaludDto } from './dto/estado-salud.dto.js';
import { SaludService } from './salud.service.js';

@ApiTags('Salud')
@Controller('salud')
export class SaludController {
  constructor(private readonly saludService: SaludService) {}

  @Get()
  @Publico()
  @ApiOperation({
    summary: 'Verifica que la API y la base de datos respondan',
    description:
      'Público: lo consultan el monitoreo y el balanceador de carga (NFR-009, NFR-016).',
  })
  @ApiOkResponse({ type: EstadoSaludDto })
  @ApiServiceUnavailableResponse({
    type: RespuestaErrorDto,
    description: 'La base de datos no responde',
  })
  verificar(): Promise<EstadoSaludDto> {
    return this.saludService.verificar();
  }
}
