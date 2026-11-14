import { Module } from '@nestjs/common';
import { SesionesModule } from '../sesiones/sesiones.module.js';
import { ConfiguracionParametrosService } from './configuracion-parametros.service.js';
import { FestivosController } from './festivos.controller.js';
import { FestivosService } from './festivos.service.js';
import { ParametrosController } from './parametros.controller.js';

/**
 * Estructura académica y su parametrización (RF-04). Por ahora, la pantalla de los parámetros
 * del sistema (HU-03-07) y la tabla de días festivos (HU-08-01), que recalcula los calendarios
 * con `SesionesService`. La lectura de los parámetros la hace `ParametrosService`
 * (`common/parametros`), que es global.
 */
@Module({
  imports: [SesionesModule],
  controllers: [ParametrosController, FestivosController],
  providers: [ConfiguracionParametrosService, FestivosService],
})
export class EstructuraAcademicaModule {}
