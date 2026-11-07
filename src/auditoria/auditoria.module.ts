import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaService } from './auditoria.service.js';
import { InterceptorAuditoria } from './interceptor-auditoria.js';

/** Global: cualquier módulo de dominio registra sus acciones relevantes (RF-29). */
@Global()
@Module({
  providers: [
    AuditoriaService,
    { provide: APP_INTERCEPTOR, useClass: InterceptorAuditoria },
  ],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
