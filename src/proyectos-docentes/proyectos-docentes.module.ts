import { Module } from '@nestjs/common';
import { AlcanceService } from './alcance.service.js';
import { AsistenteController } from './asistente.controller.js';
import { AsistenteService } from './asistente.service.js';
import { BibliografiaService } from './bibliografia.service.js';
import { ContenidosService } from './contenidos.service.js';
import { DiligenciamientoController } from './diligenciamiento.controller.js';
import { DiligenciamientoService } from './diligenciamiento.service.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { EstrategiasService } from './estrategias.service.js';
import { EvaluacionService } from './evaluacion.service.js';
import { PlaneacionController } from './planeacion.controller.js';
import { ProyectosDocentesController } from './proyectos-docentes.controller.js';
import { ProyectosDocentesService } from './proyectos-docentes.service.js';
import { RacService } from './rac.service.js';

/**
 * Proyecto docente: creación con el asistente (RF-08), consulta y diligenciamiento por
 * secciones (RF-11 a RF-16). RF-09, RF-10, RF-17 y RF-18 llegan aquí.
 */
@Module({
  // El asistente va primero: sus rutas son más específicas que `proyectos-docentes/:id`.
  controllers: [
    AsistenteController,
    ProyectosDocentesController,
    DiligenciamientoController,
    PlaneacionController,
  ],
  providers: [
    AlcanceService,
    AsistenteService,
    ProyectosDocentesService,
    EdicionProyectoService,
    DiligenciamientoService,
    RacService,
    EstrategiasService,
    EvaluacionService,
    ContenidosService,
    BibliografiaService,
  ],
  // El calendario de sesiones (RF-19) y la lista de matriculados (EstudiantesModule, RF-22)
  // reutilizan la visibilidad y el alcance del proyecto.
  exports: [AlcanceService, ProyectosDocentesService],
})
export class ProyectosDocentesModule {}
