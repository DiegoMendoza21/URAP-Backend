import { Module } from '@nestjs/common';
import { ConfiguracionParametrosService } from './configuracion-parametros.service.js';
import { ParametrosController } from './parametros.controller.js';

/**
 * Estructura académica y su parametrización (RF-04). Por ahora, la pantalla de los parámetros
 * del sistema (HU-03-07). La lectura de los parámetros la hace `ParametrosService`
 * (`common/parametros`), que es global.
 */
@Module({
  controllers: [ParametrosController],
  providers: [ConfiguracionParametrosService],
})
export class EstructuraAcademicaModule {}
