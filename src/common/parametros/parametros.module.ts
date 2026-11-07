import { Module } from '@nestjs/common';
import { ParametrosService } from './parametros.service.js';

/** Parámetros de negocio de `parametro_sistema` (HU-03-07). Lo importa cada módulo que los lee. */
@Module({
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
