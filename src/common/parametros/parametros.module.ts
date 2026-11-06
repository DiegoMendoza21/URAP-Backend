import { Global, Module } from '@nestjs/common';
import { ParametrosService } from './parametros.service.js';

@Global()
@Module({
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
