import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { VariablesEntorno } from './common/configuracion/variables-entorno.js';
import { configurarAplicacion, PREFIJO_API } from './configurar-aplicacion.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarAplicacion(app);

  const puerto = app
    .get(ConfigService<VariablesEntorno, true>)
    .get('PUERTO', { infer: true });
  await app.listen(puerto);

  Logger.log(
    `API en http://localhost:${puerto}/${PREFIJO_API} · documentación en /${PREFIJO_API}/docs`,
    'Arranque',
  );
}
await bootstrap();
