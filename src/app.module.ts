import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ParametrosModule } from './common/parametros/parametros.module.js';
import { EstudiantesModule } from './estudiantes/estudiantes.module.js';
import { validarVariablesEntorno } from './common/configuracion/variables-entorno.js';
import { FiltroExcepciones } from './common/filtros/filtro-excepciones.js';
import { MedicionesModule } from './mediciones/mediciones.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { crearPipeValidacion } from './common/validacion/pipe-validacion.js';
import { ProyectosDocentesModule } from './proyectos-docentes/proyectos-docentes.module.js';
import { SaludModule } from './salud/salud.module.js';
import { SesionesModule } from './sesiones/sesiones.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarVariablesEntorno,
    }),
    PrismaModule,
    ParametrosModule,
    AuditoriaModule,
    AuthModule,
    SaludModule,
    ProyectosDocentesModule,
    EstudiantesModule,
    MedicionesModule,
    SesionesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: FiltroExcepciones },
    { provide: APP_PIPE, useFactory: crearPipeValidacion },
  ],
})
export class AppModule {}
