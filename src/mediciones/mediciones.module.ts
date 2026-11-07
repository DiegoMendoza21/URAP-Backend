import { Module } from '@nestjs/common';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { MedicionesController } from './mediciones.controller.js';
import { MedicionesService } from './mediciones.service.js';

/** Medición de RAP: valoración por estudiante e indicador (RF-30). */
@Module({
  imports: [ProyectosDocentesModule],
  controllers: [MedicionesController],
  providers: [MedicionesService],
})
export class MedicionesModule {}
