import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar).
describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/salud confirma que la API y la base de datos responden', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/salud')
      .expect(200);

    expect(respuesta.body).toMatchObject({ estado: 'disponible' });
  });

  it('una ruta inexistente responde 404 con el formato de error en español', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/no-existe')
      .expect(404);

    expect(respuesta.body).toMatchObject({
      estado: 404,
      error: 'No encontrado',
      mensaje: 'El recurso solicitado no existe.',
      ruta: '/api/no-existe',
    });
  });

  it('publica la especificación OpenAPI con los endpoints documentados', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);

    expect(respuesta.body).toHaveProperty(['paths', '/api/salud']);
  });
});
