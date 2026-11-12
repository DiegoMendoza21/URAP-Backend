import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { PendientesController } from './pendientes.controller.js';
import { RecordatoriosController } from './recordatorios.controller.js';
import { RecordatoriosService } from './recordatorios.service.js';
import { RegistroClaseController } from './registro-clase.controller.js';
import { RegistroClaseService } from './registro-clase.service.js';
import { SesionesController } from './sesiones.controller.js';
import { SesionesService } from './sesiones.service.js';

/**
 * Calendario y registro de clases (RF-19 a RF-23). Por ahora, el horario del curso, la
 * generación del calendario (RF-19), el registro de la clase con sus ausentes (RF-20 y RF-22) y
 * las alertas de sesiones vencidas y por vencer (RF-23), con su recordatorio semanal (RF-26,
 * HU-13-02).
 * Exporta el servicio para que la administración de festivos (HU-08-01) pueda recalcular los
 * calendarios cuando cambie la tabla.
 */
@Module({
  imports: [ProyectosDocentesModule, NotificacionesModule],
  controllers: [
    SesionesController,
    PendientesController,
    RegistroClaseController,
    RecordatoriosController,
  ],
  providers: [SesionesService, RegistroClaseService, RecordatoriosService],
  exports: [SesionesService],
})
export class SesionesModule {}
