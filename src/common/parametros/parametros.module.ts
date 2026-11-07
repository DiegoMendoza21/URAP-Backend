import { Global, Module } from '@nestjs/common';
import { ParametrosService } from './parametros.service.js';

/** Parámetros de negocio de `parametro_sistema` (HU-03-07). Global: los usan varios módulos. */
@Global()
@Module({
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
