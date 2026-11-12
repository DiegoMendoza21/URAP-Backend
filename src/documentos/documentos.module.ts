import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  directorioAlmacenamiento,
  type VariablesEntorno,
} from '../common/configuracion/variables-entorno.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { ALMACENAMIENTO_DOCUMENTAL } from './almacenamiento/almacenamiento-documental.js';
import { AlmacenamientoLocal } from './almacenamiento/almacenamiento-local.js';
import { ArchivosEvidenciaInterceptor } from './archivos-evidencia.interceptor.js';
import { EvidenciasLiderRapController } from './evidencias-lider-rap.controller.js';
import { EvidenciasLiderRapService } from './evidencias-lider-rap.service.js';
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
  controllers: [EvidenciasController, EvidenciasLiderRapController],
  providers: [
    EvidenciasService,
    EvidenciasLiderRapService,
    ArchivosEvidenciaInterceptor,
    {
      provide: ALMACENAMIENTO_DOCUMENTAL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<VariablesEntorno, true>) => {
        const almacenamiento = new AlmacenamientoLocal(
          directorioAlmacenamiento(
            config.get('ALMACENAMIENTO_DIRECTORIO', { infer: true }),
          ),
        );
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
