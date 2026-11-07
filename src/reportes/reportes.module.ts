import { Module } from '@nestjs/common';
import { MedicionesModule } from '../mediciones/mediciones.module.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';

/** Reportes académicos (RF-28, RF-32). Por ahora, el de logro de los RAP del programa. */
@Module({
  imports: [MedicionesModule, ProyectosDocentesModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
