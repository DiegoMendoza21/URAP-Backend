import { Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service.js';

/**
 * Notificaciones y recordatorios (RF-26, EP-13). Por ahora solo el registro de los avisos que
 * generan otros módulos; la bandeja, el correo y la configuración llegan con EP-13.
 */
@Module({
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
