import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALMACENAMIENTO_DIRECTORIO_DESARROLLO,
  type VariablesEntorno,
} from '../common/configuracion/variables-entorno.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { ALMACENAMIENTO_DOCUMENTAL } from './almacenamiento/almacenamiento-documental.js';
import { AlmacenamientoLocal } from './almacenamiento/almacenamiento-local.js';
import { ArchivosEvidenciaInterceptor } from './archivos-evidencia.interceptor.js';
import { EvidenciasController } from './evidencias.controller.js';
import { EvidenciasService } from './evidencias.service.js';

/**
 * Evidencias y documentos soporte (RF-24; RF-10 llega aquí). El almacenamiento documental es
 * un disco local en el prototipo: cambiar a Amazon S3 es cambiar este proveedor por otro
 * adaptador de `AlmacenamientoDocumental`.
 */
@Module({
  // ParametrosModule y AuditoriaModule son globales.
  imports: [ProyectosDocentesModule],
  controllers: [EvidenciasController],
  providers: [
    EvidenciasService,
    ArchivosEvidenciaInterceptor,
    {
      provide: ALMACENAMIENTO_DOCUMENTAL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<VariablesEntorno, true>) => {
        const directorio =
          config.get('ALMACENAMIENTO_DIRECTORIO', { infer: true }) ??
          ALMACENAMIENTO_DIRECTORIO_DESARROLLO;
        const almacenamiento = new AlmacenamientoLocal(directorio);
        try {
          await almacenamiento.preparar();
        } catch (error) {
          // Sin carpeta utilizable no se puede cargar ni descargar nada: la API no arranca.
          throw new Error(
            `No se puede usar la carpeta del almacenamiento documental «${almacenamiento.raiz}» ` +
              '(ALMACENAMIENTO_DIRECTORIO). Revise que exista o se pueda crear, y que la API ' +
              'tenga permiso de lectura y escritura.',
            { cause: error },
          );
        }
        Logger.log(
          `Almacenamiento documental en ${almacenamiento.raiz}`,
          'DocumentosModule',
        );
        return almacenamiento;
      },
    },
  ],
})
export class DocumentosModule {}
