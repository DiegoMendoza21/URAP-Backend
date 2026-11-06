import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MENSAJE_DEMASIADOS_INTENTOS } from '../src/auth/auth.module.js';
import {
  MENSAJE_CREDENCIALES_INVALIDAS,
  MOTIVO_BLOQUEO,
  PARAMETRO_INTENTOS_MAXIMOS,
  PARAMETRO_MINUTOS_BLOQUEO,
} from '../src/auth/auth.service.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import type { VariablesEntorno } from '../src/common/configuracion/variables-entorno.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';

async function crearAplicacion(
  conLimitePorIp: boolean,
): Promise<INestApplication> {
  let modulo = Test.createTestingModule({ imports: [AppModule] });
  if (!conLimitePorIp) {
    // El bloqueo por cuenta se prueba sin el límite por IP, que tiene su propia prueba.
    modulo = modulo
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true });
  }
  const app = (await modulo.compile()).createNestApplication();
  configurarAplicacion(app);
  await app.init();
  return app;
}

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar. No depende del seed: si los parámetros
// del bloqueo no existen, los crea y después los borra.
describe('Bloqueo por intentos fallidos (e2e) · HU-01-04', () => {
  const sufijo = `${Date.now()}`;
  const correo = `e2e.bloqueo.${sufijo}@prueba.urap.local`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let idRol: number;
  let idUsuario: number;
  let intentosMaximos: number;
  const parametrosCreados: string[] = [];

  const iniciarSesion = (clave: string) =>
    request(app.getHttpServer())
      .post('/api/auth/iniciar-sesion')
      .send({ correo, contrasena: clave });

  async function parametro(clave: string, porDefecto: string): Promise<number> {
    const existente = await prisma.parametro_sistema.findUnique({
      where: { clave },
    });
    if (existente?.valor) {
      return Number(existente.valor);
    }
    await prisma.parametro_sistema.create({
      data: { clave, valor: porDefecto, tipo_dato: 'entero' },
    });
    parametrosCreados.push(clave);
    return Number(porDefecto);
  }

  beforeAll(async () => {
    app = await crearAplicacion(false);
    prisma = app.get(PrismaService);
    intentosMaximos = await parametro(PARAMETRO_INTENTOS_MAXIMOS, '3');
    await parametro(PARAMETRO_MINUTOS_BLOQUEO, '15');

    idRol = (await prisma.rol.create({ data: { nombre: `Rol e2e ${sufijo}` } }))
      .id;
    idUsuario = (
      await prisma.usuario.create({
        data: {
          nombres: 'Usuario',
          apellidos: 'Bloqueo E2E',
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
    if (prisma) {
      await borrarUsuariosDePrueba(prisma, [idUsuario]);
      await prisma.rol.deleteMany({ where: { id: idRol } });
      await prisma.parametro_sistema.deleteMany({
        where: { clave: { in: parametrosCreados } },
      });
    }
    await app?.close();
  });

  it('al llegar al límite de parametro_sistema bloquea la cuenta y lo audita', async () => {
    for (let intento = 1; intento < intentosMaximos; intento++) {
      const respuesta = await iniciarSesion('clave-equivocada').expect(401);
      expect(respuesta.body.mensaje).toBe(MENSAJE_CREDENCIALES_INVALIDAS);
    }

    const bloqueo = await iniciarSesion('clave-equivocada').expect(429);
    expect(bloqueo.body.mensaje).toMatch(
      /bloqueado temporalmente.*Intente de nuevo en \d+ minutos?\./,
    );

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: idUsuario },
    });
    expect(usuario.bloqueado_hasta!.getTime()).toBeGreaterThan(Date.now());
    expect(usuario.intentos_fallidos).toBe(0);

    const eventos = await prisma.auditoria.findMany({
      where: { tabla_afectada: 'usuario', id_registro: idUsuario },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      accion: 'actualizar',
      id_usuario: null,
      valor_nuevo: expect.objectContaining({ motivo: MOTIVO_BLOQUEO }),
    });
  });

  it('mientras dura el bloqueo rechaza incluso la contraseña correcta', async () => {
    await iniciarSesion(contrasena).expect(429);
    await expect(
      prisma.sesion.count({ where: { id_usuario: idUsuario } }),
    ).resolves.toBe(0);
  });

  it('cuando el bloqueo vence, el usuario puede volver a iniciar sesión', async () => {
    await prisma.usuario.update({
      where: { id: idUsuario },
      data: { bloqueado_hasta: new Date(Date.now() - 1000) },
    });

    await iniciarSesion(contrasena).expect(200);
  });

  it('un inicio de sesión exitoso reinicia el conteo de intentos', async () => {
    await iniciarSesion('clave-equivocada').expect(401);
    await expect(
      prisma.usuario.findUniqueOrThrow({ where: { id: idUsuario } }),
    ).resolves.toMatchObject({ intentos_fallidos: 1 });

    await iniciarSesion(contrasena).expect(200);
    await expect(
      prisma.usuario.findUniqueOrThrow({ where: { id: idUsuario } }),
    ).resolves.toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
  });

  describe('límite de intentos por IP', () => {
    let appConLimite: INestApplication;

    beforeAll(async () => {
      appConLimite = await crearAplicacion(true);
    });

    afterAll(async () => {
      await appConLimite?.close();
    });

    it('responde 429 en español al superar el límite, aun con correos inventados', async () => {
      const limite = appConLimite
        .get(ConfigService<VariablesEntorno, true>)
        .get('INICIO_SESION_LIMITE_POR_IP', { infer: true });
      const intentar = () =>
        request(appConLimite.getHttpServer())
          .post('/api/auth/iniciar-sesion')
          .send({
            correo: `nadie.${sufijo}@prueba.urap.local`,
            contrasena: 'cualquiera',
          });

      for (let i = 0; i < limite; i++) {
        await intentar().expect(401);
      }
      const respuesta = await intentar().expect(429);
      expect(respuesta.body).toMatchObject({
        estado: 429,
        mensaje: MENSAJE_DEMASIADOS_INTENTOS,
      });
    });
  });
});
