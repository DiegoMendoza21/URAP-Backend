import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
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
import { RevisionController } from './revision.controller.js';
import { RevisionService } from './revision.service.js';

/**
 * Proyecto docente: creación con el asistente (RF-08), consulta y diligenciamiento por
 * secciones (RF-11 a RF-16), y su revisión y aprobación (RF-17 y RF-18). RF-09 y RF-10 llegan
 * aquí.
 */
@Module({
  imports: [NotificacionesModule],
  // El asistente va primero: sus rutas son más específicas que `proyectos-docentes/:id`.
  controllers: [
    AsistenteController,
    ProyectosDocentesController,
    DiligenciamientoController,
    PlaneacionController,
    RevisionController,
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
    RevisionService,
  ],
  // La lista de matriculados (EstudiantesModule) usa el mismo alcance por programa, el
  // calendario de sesiones (RF-19) y las evidencias (RF-24) la visibilidad del proyecto, y el
  // tablero (RF-25) el resumen de diligenciamiento.
  exports: [AlcanceService, ProyectosDocentesService, DiligenciamientoService],
})
export class ProyectosDocentesModule {}
