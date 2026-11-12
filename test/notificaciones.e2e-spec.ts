import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { MENSAJE_NOTIFICACION_NO_EXISTE } from '../src/notificaciones/notificaciones.service.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

interface Notificacion {
  id: number;
  tipo: string | null;
  titulo: string;
  urlDestino: string | null;
  leida: boolean;
  fechaLectura: string | null;
}

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios usuarios ficticios y sus notificaciones, y los borra al terminar. Funciona con o sin
// el seed.
describe('Bandeja de notificaciones (e2e) · RF-26, HU-13-01, HU-13-03', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const TIPO = 'proyecto_devuelto';

  let app: INestApplication;
  let prisma: PrismaService;
  const matriz = matrizDePrueba();
  const creados = {
    roles: [] as number[],
    tipos: [] as number[],
    usuarios: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  let idTipo: number;

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => {
    const autorizar = (prueba: request.Test) =>
      prueba.set('Authorization', `Bearer ${tokens[quien]}`);
    return {
      get: (ruta: string) => autorizar(http().get(`/api${ruta}`)),
      patch: (ruta: string) => autorizar(http().patch(`/api${ruta}`)).send({}),
    };
  };

  async function rolPorNombre(nombre: NombreRol): Promise<number> {
    const existente = await prisma.rol.findUnique({ where: { nombre } });
    const id =
      existente?.id ??
      (await prisma.rol.create({ data: { nombre, activo: true } })).id;
    if (!existente) {
      creados.roles.push(id);
    }
    await asegurarPermisosDeRol(prisma, matriz, id, nombre);
    return id;
  }

  async function crearUsuario(clave: string, hash: string): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.notif.${clave}.${sufijo}@prueba.urap.local`,
        password_hash: hash,
        activo: true,
      },
    });
    creados.usuarios.push(usuario.id);
    usuarios[clave] = usuario.id;
    await prisma.usuario_rol.create({
      data: {
        id_usuario: usuario.id,
        id_rol: await rolPorNombre(ROL.docente),
        activo: true,
      },
    });
    const inicio = await http()
      .post('/api/auth/iniciar-sesion')
      .send({ correo: usuario.email, contrasena })
      .expect(200);
    tokens[clave] = (inicio.body as { token: string }).token;
  }

  /** Una notificación sin leer para el usuario, `segundos` antes de ahora. */
  async function notificar(
    quien: string,
    titulo: string,
    segundos: number,
  ): Promise<number> {
    const creada = await prisma.notificacion.create({
      data: {
        id_tipo_notificacion: idTipo,
        id_usuario: usuarios[quien],
        titulo,
        mensaje: `Mensaje de ${titulo}`,
        entidad: 'proyecto_docente',
        id_entidad: 1,
        url_destino: '/proyectos-docentes/1/diligenciar',
        leida: false,
        estado_envio: 'pendiente',
        created_at: new Date(Date.now() - segundos * 1000),
      },
    });
    return creada.id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);
    await asegurarCatalogoDePermisos(prisma, matriz);

    const existente = await prisma.tipo_notificacion.findUnique({
      where: { codigo: TIPO },
    });
    if (existente) {
      idTipo = existente.id;
    } else {
      idTipo = (
        await prisma.tipo_notificacion.create({
          data: { codigo: TIPO, nombre: TIPO, activo: true },
        })
      ).id;
      creados.tipos.push(idTipo);
    }

    const hash = await app.get(ContrasenasService).hashear(contrasena);
    await crearUsuario('docente', hash);
    await crearUsuario('otro', hash);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.notificacion.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await borrarUsuariosDePrueba(prisma, creados.usuarios);
      await prisma.tipo_notificacion.deleteMany({
        where: { id: { in: creados.tipos } },
      });
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
  });

  it('sin sesión responde 401 en las cuatro rutas', async () => {
    await http().get('/api/notificaciones').expect(401);
    await http().get('/api/notificaciones/no-leidas').expect(401);
    await http().patch('/api/notificaciones/leidas').expect(401);
    await http().patch('/api/notificaciones/1/leida').expect(401);
  });

  describe('con notificaciones de dos usuarios', () => {
    let antigua: number;
    let reciente: number;
    let ajena: number;

    beforeAll(async () => {
      antigua = await notificar('docente', 'Antigua', 120);
      reciente = await notificar('docente', 'Reciente', 10);
      ajena = await notificar('otro', 'De otra persona', 5);
    });

    it('cada usuario ve solo las suyas, de la más reciente a la más antigua', async () => {
      const respuesta = await como('docente')
        .get('/notificaciones')
        .expect(200);
      const elementos = respuesta.body.elementos as Notificacion[];

      expect(respuesta.body.total).toBe(2);
      expect(elementos.map((n) => n.id)).toEqual([reciente, antigua]);
      expect(elementos[0]).toMatchObject({
        tipo: TIPO,
        titulo: 'Reciente',
        urlDestino: '/proyectos-docentes/1/diligenciar',
        leida: false,
        fechaLectura: null,
      });
    });

    it('cuenta las no leídas del usuario', async () => {
      await como('docente')
        .get('/notificaciones/no-leidas')
        .expect(200, { noLeidas: 2 });
      await como('otro')
        .get('/notificaciones/no-leidas')
        .expect(200, { noLeidas: 1 });
    });

    it('rechaza un filtro o una página que no son válidos', async () => {
      await como('docente').get('/notificaciones?filtro=leidas').expect(400);
      await como('docente').get('/notificaciones?tamano=101').expect(400);
    });

    it('marca como leída una propia y deja de salir con el filtro de no leídas', async () => {
      const respuesta = await como('docente')
        .patch(`/notificaciones/${antigua}/leida`)
        .expect(200);
      expect(respuesta.body).toMatchObject({ id: antigua, leida: true });
      expect(respuesta.body.fechaLectura).not.toBeNull();

      const noLeidas = await como('docente')
        .get('/notificaciones?filtro=no_leidas')
        .expect(200);
      expect(
        (noLeidas.body.elementos as Notificacion[]).map((n) => n.id),
      ).toEqual([reciente]);
    });

    it('no puede marcar la de otra persona: responde 404 y no la toca', async () => {
      const respuesta = await como('docente')
        .patch(`/notificaciones/${ajena}/leida`)
        .expect(404);
      expect(respuesta.body.mensaje).toBe(MENSAJE_NOTIFICACION_NO_EXISTE);

      const fila = await prisma.notificacion.findUnique({
        where: { id: ajena },
      });
      expect(fila?.leida).toBe(false);
    });

    it('marca todas las suyas como leídas y no toca las de los demás', async () => {
      await como('docente')
        .patch('/notificaciones/leidas')
        .expect(200, { marcadas: 1 });
      await como('docente')
        .get('/notificaciones/no-leidas')
        .expect(200, { noLeidas: 0 });
      await como('otro')
        .get('/notificaciones/no-leidas')
        .expect(200, { noLeidas: 1 });
    });
  });
});
