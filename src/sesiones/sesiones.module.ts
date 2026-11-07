import { Module } from '@nestjs/common';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { SesionesController } from './sesiones.controller.js';
import { SesionesService } from './sesiones.service.js';

/**
 * Calendario y registro de clases (RF-19 a RF-23). Por ahora, el horario del curso y la
 * generación del calendario (RF-19). Exporta el servicio para que la administración de
 * festivos (HU-08-01) pueda recalcular los calendarios cuando cambie la tabla.
 */
@Module({
  imports: [ProyectosDocentesModule],
  controllers: [SesionesController],
  providers: [SesionesService],
  exports: [SesionesService],
})
export class SesionesModule {}
