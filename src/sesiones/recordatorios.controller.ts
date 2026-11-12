import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { Permiso } from '../auth/decoradores/permiso.decorator.js';
import { RespuestaErrorDto } from '../common/dto/respuesta-error.dto.js';
import { ResultadoRecordatoriosDto } from './dto/respuestas.dto.js';
import { RecordatoriosService } from './recordatorios.service.js';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  type: RespuestaErrorDto,
  description: 'Sin sesión válida',
})
@ApiForbiddenResponse({
  type: RespuestaErrorDto,
  description:
    'El usuario no tiene el permiso de administrar la configuración (`estructura.administrar`)',
})
// La misma regla que la pantalla de parámetros (HU-03-07), donde vive la periodicidad.
@Permiso('estructura', 'administrar')
@Controller('recordatorios')
export class RecordatoriosController {
  constructor(
    private readonly recordatorios: RecordatoriosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Post('sesiones')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Envía ahora el recordatorio de sesiones pendientes (RF-26, HU-13-02)',
    description:
      'Hace lo mismo que la revisión diaria de las 7:00: un solo aviso por docente con sus ' +
      'sesiones vencidas y por vencer. Respeta la periodicidad: quien ya lo recibió dentro de ' +
      '`recordatorio_sesiones_dias` no lo recibe otra vez.',
  })
  @ApiOkResponse({ type: ResultadoRecordatoriosDto })
  @ApiConflictResponse({
    type: RespuestaErrorDto,
    description: 'Ya hay un envío en curso',
  })
  async enviar(): Promise<ResultadoRecordatoriosDto> {
    const resultado = await this.recordatorios.enviar();
    if (resultado.enviados > 0) {
      await this.auditoria.registrar({
        accion: 'crear',
        tablaAfectada: 'notificacion',
        idRegistro: null,
        valorNuevo: { recordatoriosDeSesiones: resultado.enviados },
      });
    }
    return resultado;
  }
}
