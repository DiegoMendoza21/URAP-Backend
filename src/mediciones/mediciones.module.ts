import { Module } from '@nestjs/common';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { ConsolidadoService } from './consolidado.service.js';
import { MedicionesController } from './mediciones.controller.js';
import { MedicionesService } from './mediciones.service.js';

/**
 * Medición de RAP: valoración por estudiante e indicador (RF-30), consolidado, análisis y
 * cierre (RF-31). El reporte de logro (RF-32) usa el consolidado desde ReportesModule.
 */
@Module({
  imports: [ProyectosDocentesModule],
  controllers: [MedicionesController],
  providers: [ConsolidadoService, MedicionesService],
  exports: [ConsolidadoService],
})
export class MedicionesModule {}
