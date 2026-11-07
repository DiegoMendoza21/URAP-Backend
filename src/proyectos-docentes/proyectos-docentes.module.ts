import { Module } from '@nestjs/common';
import { AlcanceService } from './alcance.service.js';
import { AsistenteController } from './asistente.controller.js';
import { AsistenteService } from './asistente.service.js';
import { ProyectosDocentesController } from './proyectos-docentes.controller.js';
import { ProyectosDocentesService } from './proyectos-docentes.service.js';

/** Proyecto docente: creación con el asistente (RF-08) y consulta. RF-09 a RF-18 llegan aquí. */
@Module({
  // El asistente va primero: sus rutas son más específicas que `proyectos-docentes/:id`.
  controllers: [AsistenteController, ProyectosDocentesController],
  providers: [AlcanceService, AsistenteService, ProyectosDocentesService],
  // El calendario de sesiones (RF-19) reutiliza la visibilidad y el alcance del proyecto; la
  // lista de matriculados (EstudiantesModule), el mismo alcance por programa.
  exports: [AlcanceService, ProyectosDocentesService],
})
export class ProyectosDocentesModule {}
