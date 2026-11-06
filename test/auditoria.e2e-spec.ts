import { type INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar.
describe('Auditoría automática (e2e) · HU-14-01', () => {
  const sufijo = `${Date.now()}`;
  const correo = `e2e.auditoria.${sufijo}@prueba.urap.local`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let idRol: number;
  let idUsuario: number;

  const iniciarSesion = () =>
    request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .set('User-Agent', 'navegador e2e')
      .send({ correo, contrasena });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      // El límite por IP tiene su propia prueba (bloqueo.e2e-spec.ts).
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);

    idRol = (await prisma.rol.create({ data: { nombre: `Rol e2e ${sufijo}` } }))
      .id;
    idUsuario = (
      await prisma.usuario.create({
        data: {
          nombres: 'Usuario',
          apellidos: 'Auditoría E2E',
          email: correo,
          password_hash: await app.get(ContrasenasService).hashear(contrasena),
          activo: true,
        },
      })
    ).id;
    await prisma.usuario_rol.create({
      data: { id_usuario: idUsuario, id_rol: idRol, activo: true },
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (prisma) {
      await borrarUsuariosDePrueba(prisma, [idUsuario]);
      await prisma.rol.deleteMany({ where: { id: idRol } });
    }
    await app?.close();
  });

  it('el inicio y el cierre de sesión quedan en auditoría con el usuario y la IP', async () => {
    const { body } = await iniciarSesion().expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/cerrar-sesion')
      .set('Authorization', `Bearer ${body.token}`)
      .expect(204);

    const sesion = await prisma.sesion.findFirstOrThrow({
      where: { id_usuario: idUsuario },
      orderBy: { id: 'desc' },
    });
    const eventos = await prisma.auditoria.findMany({
      where: { tabla_afectada: 'sesion', id_registro: sesion.id },
      orderBy: { id: 'asc' },
    });

    expect(eventos).toHaveLength(2);
    const [inicio, cierre] = eventos;
    expect(inicio).toMatchObject({
      accion: 'crear',
      id_usuario: idUsuario,
      valor_nuevo: expect.objectContaining({
        id_usuario: idUsuario,
        user_agent: 'navegador e2e',
      }),
    });
    // El jti identifica el token: no se guarda en auditoría.
    expect(JSON.stringify(inicio.valor_nuevo)).not.toContain(sesion.jti!);
    // El cierre toma el usuario del contexto de la petición, que llenó el guard.
    expect(cierre).toMatchObject({
      accion: 'actualizar',
      id_usuario: idUsuario,
      valor_anterior: { revocada_en: null, motivo_revocacion: null },
      valor_nuevo: expect.objectContaining({ motivo_revocacion: 'logout' }),
    });
    for (const evento of eventos) {
      expect(evento.ip).toMatch(/127\.0\.0\.1|::1/);
      expect(evento.fecha).toBeInstanceOf(Date);
    }
  });

  it('si la auditoría falla, el inicio de sesión funciona igual (RF-29, p3)', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const crear = vi
      .spyOn(prisma.auditoria, 'create')
      .mockRejectedValueOnce(new Error('auditoría caída'));

    const respuesta = await iniciarSesion().expect(200);

    expect(respuesta.body.token).toEqual(expect.any(String));
    expect(crear).toHaveBeenCalled();
  });
});
