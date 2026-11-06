import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service.js';

/** Global: cualquier módulo de dominio registra sus acciones relevantes (RF-29). */
@Global()
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
