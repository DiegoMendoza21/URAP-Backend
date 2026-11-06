import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import type { VariablesEntorno } from './common/configuracion/variables-entorno.js';

export const PREFIJO_API = 'api';

/**
 * Lo que se configura sobre la instancia de la aplicación. Lo comparten main.ts y las
 * pruebas e2e, para que estas prueben la API tal como se publica. Lo que puede declararse
 * como proveedor (filtro, pipe y guard globales) vive en AppModule.
 */
export function configurarAplicacion(app: INestApplication): void {
  const config = app.get(ConfigService<VariablesEntorno, true>);

  // Detrás del balanceador, la IP del cliente llega en X-Forwarded-For. Sin esto, todas las
  // sesiones quedarían con la IP del balanceador.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', config.get('PROXIES_CONFIABLES', { infer: true }));
  app.setGlobalPrefix(PREFIJO_API);
  app.enableCors({ origin: config.get('CORS_ORIGENES', { infer: true }) });
  app.enableShutdownHooks();

  // La especificación OpenAPI es el único contrato con el frontend: de aquí genera sus tipos.
  const documento = new DocumentBuilder()
    .setTitle('URAP API')
    .setDescription(
      'Seguimiento, control y análisis de los proyectos docentes del programa de ' +
        'Administración Industrial, Universidad de Cartagena.',
    )
    .setVersion(leerVersion())
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  SwaggerModule.setup(
    `${PREFIJO_API}/docs`,
    app,
    () => SwaggerModule.createDocument(app, documento),
    {
      jsonDocumentUrl: `${PREFIJO_API}/openapi.json`,
    },
  );
}

function leerVersion(): string {
  const paquete = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return paquete.version;
}
