import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesService } from './notificaciones.service.js';

/**
 * Notificaciones y recordatorios (RF-26, EP-13): el registro de los avisos que generan otros
 * módulos y la bandeja de cada usuario. El correo y la configuración de los tipos llegan
 * después.
 */
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
