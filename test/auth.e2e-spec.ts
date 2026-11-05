import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar).
// Crea sus propios datos ficticios y los borra al terminar.
describe('Autenticación (e2e) · HU-01-01', () => {
  const sufijo = `${Date.now()}`;
  const correoActivo = `e2e.activo.${sufijo}@prueba.urap.local`;
  const correoInactivo = `e2e.inactivo.${sufijo}@prueba.urap.local`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let idRol: number;
  const idsUsuarios: number[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();

    prisma = app.get(PrismaService);
    const hash = await app.get(ContrasenasService).hashear(contrasena);
    idRol = (await prisma.rol.create({ data: { nombre: `Rol e2e ${sufijo}` } }))
      .id;
    for (const [email, activo] of [
      [correoActivo, true],
      [correoInactivo, false],
    ] as const) {
      const usuario = await prisma.usuario.create({
        data: {
          nombres: 'Usuario',
          apellidos: 'E2E',
          email,
          password_hash: hash,
          activo,
        },
      });
      idsUsuarios.push(usuario.id);
      await prisma.usuario_rol.create({
        data: { id_usuario: usuario.id, id_rol: idRol, activo: true },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.sesion.deleteMany({
        where: { id_usuario: { in: idsUsuarios } },
      });
      await prisma.usuario_rol.deleteMany({
        where: { id_usuario: { in: idsUsuarios } },
      });
      await prisma.usuario.deleteMany({ where: { id: { in: idsUsuarios } } });
      await prisma.rol.deleteMany({ where: { id: idRol } });
    }
    await app?.close();
  });

  it('inicia sesión, registra la sesión y permite consultar el usuario con el token', async () => {
    const inicio = await request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .send({ correo: correoActivo.toUpperCase(), contrasena })
      .expect(200);

    expect(inicio.body).toMatchObject({
      token: expect.any(String),
      expiraEn: expect.any(String),
      usuario: { correo: correoActivo, roles: [`Rol e2e ${sufijo}`] },
    });
    await expect(
      prisma.sesion.count({ where: { id_usuario: idsUsuarios[0] } }),
    ).resolves.toBe(1);

    await request(app.getHttpServer())
      .get('/api/auth/sesion')
      .set('Authorization', `Bearer ${inicio.body.token}`)
      .expect(200)
      .expect(({ body }) => expect(body.correo).toBe(correoActivo));
  });

  it('con credenciales inválidas responde 401 con un mensaje genérico', async () => {
    const errada = await request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .send({ correo: correoActivo, contrasena: 'otra-clave' })
      .expect(401);
    const inexistente = await request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .send({ correo: `nadie.${sufijo}@prueba.urap.local`, contrasena })
      .expect(401);

    expect(errada.body.mensaje).toBe(inexistente.body.mensaje);
  });

  it('a un usuario inactivo le responde 403 y lo remite al administrador', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .send({ correo: correoInactivo, contrasena })
      .expect(403);

    expect(respuesta.body.mensaje).toContain('administrador');
  });

  it('un endpoint protegido sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/sesion').expect(401);
  });

  it('al cerrar sesión revoca el token: las peticiones siguientes responden 401 · HU-01-02', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .send({ correo: correoActivo, contrasena })
      .expect(200);
    const autorizacion = `Bearer ${body.token}`;

    await request(app.getHttpServer())
      .post('/api/auth/cerrar-sesion')
      .set('Authorization', autorizacion)
      .expect(204);

    const sesion = await prisma.sesion.findFirst({
      where: { id_usuario: idsUsuarios[0], revocada_en: { not: null } },
    });
    expect(sesion?.motivo_revocacion).toBe('logout');

    await request(app.getHttpServer())
      .get('/api/auth/sesion')
      .set('Authorization', autorizacion)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/cerrar-sesion')
      .set('Authorization', autorizacion)
      .expect(401);
  });

  it('cerrar sesión sin token responde 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/cerrar-sesion')
      .expect(401);
  });
});
