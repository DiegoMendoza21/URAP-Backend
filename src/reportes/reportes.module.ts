import { Module } from '@nestjs/common';
import { ParametrosModule } from '../common/parametros/parametros.module.js';
import { MedicionesModule } from '../mediciones/mediciones.module.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';
import { SeguimientoController } from './seguimiento.controller.js';
import { SeguimientoService } from './seguimiento.service.js';

/**
 * Seguimiento y reportes académicos: el tablero del diligenciamiento (RF-25), los reportes
 * académicos (RF-28) y el de logro de los RAP del programa (RF-32).
 */
@Module({
  imports: [MedicionesModule, ParametrosModule, ProyectosDocentesModule],
  controllers: [ReportesController, SeguimientoController],
  providers: [ReportesService, SeguimientoService],
})
export class ReportesModule {}
