import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaController } from './auditoria.controller.js';
import { AuditoriaService } from './auditoria.service.js';
import { ConsultaAuditoriaService } from './consulta-auditoria.service.js';
import { InterceptorAuditoria } from './interceptor-auditoria.js';

/**
 * Global: cualquier módulo de dominio registra sus acciones relevantes (RF-29). La consulta
 * (HU-14-02 y HU-14-03) no se exporta: solo la usa su controlador.
 */
@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [
    AuditoriaService,
    ConsultaAuditoriaService,
    { provide: APP_INTERCEPTOR, useClass: InterceptorAuditoria },
  ],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
