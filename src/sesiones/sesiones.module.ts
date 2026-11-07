import { Module } from '@nestjs/common';
import { ParametrosModule } from '../common/parametros/parametros.module.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { PendientesController } from './pendientes.controller.js';
import { RegistroClaseController } from './registro-clase.controller.js';
import { RegistroClaseService } from './registro-clase.service.js';
import { SesionesController } from './sesiones.controller.js';
import { SesionesService } from './sesiones.service.js';

/**
 * Calendario y registro de clases (RF-19 a RF-23). Por ahora, el horario del curso, la
 * generación del calendario (RF-19), el registro de la clase con sus ausentes (RF-20 y RF-22) y
 * las alertas de sesiones vencidas y por vencer (RF-23).
 * Exporta el servicio para que la administración de festivos (HU-08-01) pueda recalcular los
 * calendarios cuando cambie la tabla.
 */
@Module({
  imports: [ProyectosDocentesModule, ParametrosModule],
  controllers: [
    SesionesController,
    PendientesController,
    RegistroClaseController,
  ],
  providers: [SesionesService, RegistroClaseService],
  exports: [SesionesService],
})
export class SesionesModule {}
