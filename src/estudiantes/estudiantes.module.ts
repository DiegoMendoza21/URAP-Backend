import { Module } from '@nestjs/common';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { ArchivoListaInterceptor } from './archivo-lista.interceptor.js';
import { MatriculasController } from './matriculas.controller.js';
import { MatriculasService } from './matriculas.service.js';

/** Estudiantes, matrícula e inasistencias (RF-22, RF-27). Por ahora, la lista del curso. */
@Module({
  // ParametrosModule y AuditoriaModule son globales.
  imports: [ProyectosDocentesModule],
  controllers: [MatriculasController],
  providers: [ArchivoListaInterceptor, MatriculasService],
})
export class EstudiantesModule {}
