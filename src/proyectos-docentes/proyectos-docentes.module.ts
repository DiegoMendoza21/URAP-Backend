import { Module } from '@nestjs/common';
import { AlcanceService } from './alcance.service.js';
import { AsistenteController } from './asistente.controller.js';
import { AsistenteService } from './asistente.service.js';
import { DiligenciamientoController } from './diligenciamiento.controller.js';
import { DiligenciamientoService } from './diligenciamiento.service.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { ProyectosDocentesController } from './proyectos-docentes.controller.js';
import { ProyectosDocentesService } from './proyectos-docentes.service.js';
import { RacService } from './rac.service.js';

/**
 * Proyecto docente: creación con el asistente (RF-08), consulta y diligenciamiento por
 * secciones (RF-11 y RF-12). RF-09, RF-10 y RF-13 a RF-18 llegan aquí.
 */
@Module({
  // El asistente va primero: sus rutas son más específicas que `proyectos-docentes/:id`.
  controllers: [
    AsistenteController,
    ProyectosDocentesController,
    DiligenciamientoController,
  ],
  providers: [
    AlcanceService,
    AsistenteService,
    ProyectosDocentesService,
    EdicionProyectoService,
    DiligenciamientoService,
    RacService,
  ],
  // El calendario de sesiones (RF-19) reutiliza la visibilidad y el alcance del proyecto.
  exports: [AlcanceService, ProyectosDocentesService],
})
export class ProyectosDocentesModule {}
