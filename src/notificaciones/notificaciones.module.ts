import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesService } from './notificaciones.service.js';
import { TiposNotificacionController } from './tipos-notificacion.controller.js';
import { TiposNotificacionService } from './tipos-notificacion.service.js';

/**
 * Notificaciones y recordatorios (RF-26, EP-13): el registro de los avisos que generan otros
 * módulos, la bandeja de cada usuario y la configuración de los tipos (HU-13-04). El
 * recordatorio de sesiones pendientes (HU-13-02) vive en `sesiones/`, junto a sus alertas. El
 * correo llega con URAP-140.
 */
@Module({
  // Las rutas de los tipos van primero: son más específicas que `notificaciones/:id/leida`.
  controllers: [TiposNotificacionController, NotificacionesController],
  providers: [NotificacionesService, TiposNotificacionService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
