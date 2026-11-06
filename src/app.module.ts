import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { validarVariablesEntorno } from './common/configuracion/variables-entorno.js';
import { FiltroExcepciones } from './common/filtros/filtro-excepciones.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { crearPipeValidacion } from './common/validacion/pipe-validacion.js';
import { ProyectosDocentesModule } from './proyectos-docentes/proyectos-docentes.module.js';
import { SaludModule } from './salud/salud.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validarVariablesEntorno,
    }),
    PrismaModule,
    AuthModule,
    SaludModule,
    ProyectosDocentesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: FiltroExcepciones },
    { provide: APP_PIPE, useFactory: crearPipeValidacion },
  ],
})
export class AppModule {}
