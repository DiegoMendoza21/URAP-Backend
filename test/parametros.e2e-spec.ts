import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PARAMETRO } from '../src/common/parametros/parametros.service.js';
import { RANGO_PARAMETRO } from '../src/common/parametros/rangos-parametros.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { MENSAJE_DATOS_INVALIDOS } from '../src/common/validacion/pipe-validacion.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  CLAVES_PARAMETRO,
  MENSAJE_ELEMENTO_VACIO,
  MENSAJE_FALTAN_ELEMENTOS,
  MENSAJE_LISTA_VACIA,
  MENSAJE_NO_ES_ENTERO,
  MENSAJE_NO_ES_SI_NO,
  MENSAJE_PARAMETRO_NO_EXISTE,
  mensajeElementoRepetido,
  mensajeFueraDeRango,
  mensajeValorLargo,
} from '../src/estructura-academica/reglas-parametros.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). No depende del
// seed: crea los roles y usuarios ficticios que necesita, y al terminar deja cada parámetro
// como estaba (o lo borra, si no existía).
describe('Parámetros del sistema (e2e) · HU-03-07', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  /** Una fila que alguien podría insertar a mano: no por eso es un parámetro editable. */
  const CLAVE_JWT = 'jwt_expiracion_minutos';

  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const idsUsuarios: Record<string, number> = {};
  const matriz = matrizDePrueba();
  const rolesCreados: number[] = [];
  /** Cómo estaba cada fila antes de la prueba; `null`, si no existía. */
  const originales = new Map<
    string,
    { valor: string | null; id_actualizado_por: number | null } | null
  >();

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => ({
    listar: () =>
      http()
        .get('/api/parametros')
        .set('Authorization', `Bearer ${tokens[quien]}`),
    cambiar: (clave: string, cuerpo: object) =>
      http()
        .patch(`/api/parametros/${clave}`)
        .set('Authorization', `Bearer ${tokens[quien]}`)
        .send(cuerpo),
  });
  const correoDe = (nombre: string) =>
    `e2e.parametros.${nombre}.${sufijo}@prueba.urap.local`;
  const iniciarSesion = (nombre: string, clave: string) =>
    http()
      .post('/api/auth/iniciar-sesion')
      .send({ correo: correoDe(nombre), contrasena: clave });

  async function asegurarRol(nombre: NombreRol): Promise<number> {
    const existente = await prisma.rol.findUnique({ where: { nombre } });
    const id =
      existente?.id ??
      (await prisma.rol.create({ data: { nombre, activo: true } })).id;
    if (!existente) {
      rolesCreados.push(id);
    }
    await asegurarPermisosDeRol(prisma, matriz, id, nombre);
    return id;
  }

  async function crearUsuario(
    nombre: string,
    idRol: number,
    conSesion = true,
  ): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Usuario',
        apellidos: `${nombre} E2E`,
        email: correoDe(nombre),
        password_hash: await app.get(ContrasenasService).hashear(contrasena),
        activo: true,
      },
    });
    idsUsuarios[nombre] = usuario.id;
    await prisma.usuario_rol.create({
      data: { id_usuario: usuario.id, id_rol: idRol, activo: true },
    });
    if (conSesion) {
      const { body } = await iniciarSesion(nombre, contrasena).expect(200);
      tokens[nombre] = body.token as string;
    }
  }

  const fila = (clave: string) =>
    prisma.parametro_sistema.findUnique({ where: { clave } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const clave of [...CLAVES_PARAMETRO, CLAVE_JWT]) {
      const actual = await prisma.parametro_sistema.findUnique({
        where: { clave },
        select: { valor: true, id_actualizado_por: true },
      });
      originales.set(clave, actual);
    }

    await asegurarCatalogoDePermisos(prisma, matriz);
    const administrador = await asegurarRol(ROL.administrador);
    const docente = await asegurarRol(ROL.docente);
    const departamento = await asegurarRol(ROL.departamento);
    await crearUsuario('administrador', administrador);
    await crearUsuario('docente', docente);
    await crearUsuario('departamento', departamento);
    // Las víctimas del bloqueo no inician sesión: sus intentos fallidos se cuentan desde cero.
    await crearUsuario('victimaUno', docente, false);
    await crearUsuario('victimaDos', docente, false);
  });

  afterAll(async () => {
    if (prisma) {
      // Primero los parámetros: su `id_actualizado_por` apunta al administrador de la prueba.
      for (const [clave, original] of originales) {
        if (original) {
          await prisma.parametro_sistema.updateMany({
            where: { clave },
            data: original,
          });
        } else {
          await prisma.parametro_sistema.deleteMany({ where: { clave } });
        }
      }
      await prisma.auditoria.deleteMany({
        where: {
          tabla_afectada: 'parametro_sistema',
          id_usuario: { in: Object.values(idsUsuarios) },
        },
      });
      await borrarUsuariosDePrueba(prisma, Object.values(idsUsuarios));
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: rolesCreados } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
  });

  describe('quién entra', () => {
    it('sin sesión responde 401', async () => {
      await http().get('/api/parametros').expect(401);
      await http()
        .patch(`/api/parametros/${PARAMETRO.alertaDiasAnticipacion}`)
        .send({ valor: '3' })
        .expect(401);
    });

    // Tabla 11: solo el Administrador administra «Estructura académica»; los demás la consultan.
    it.each(['docente', 'departamento'])(
      'sin el permiso de administrar la estructura académica responde 403 (%s)',
      async (quien) => {
        await como(quien).listar().expect(403);
        const antes = await fila(PARAMETRO.alertaDiasAnticipacion);
        await como(quien)
          .cambiar(PARAMETRO.alertaDiasAnticipacion, { valor: '3' })
          .expect(403);
        expect(await fila(PARAMETRO.alertaDiasAnticipacion)).toEqual(antes);
      },
    );
  });

  describe('consulta', () => {
    it('lista los parámetros que el sistema lee, con su tipo y su rango', async () => {
      const { body } = await como('administrador').listar().expect(200);

      expect(
        (body.elementos as { clave: string }[]).map(({ clave }) => clave),
      ).toEqual(CLAVES_PARAMETRO);
      expect(body.elementos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            clave: PARAMETRO.alertaDiasAnticipacion,
            tipoDato: 'entero',
            ...RANGO_PARAMETRO[PARAMETRO.alertaDiasAnticipacion],
          }),
          expect.objectContaining({
            clave: PARAMETRO.revisionBloquearAutoaprobacion,
            tipoDato: 'booleano',
            minimo: null,
            maximo: null,
          }),
          expect.objectContaining({
            clave: PARAMETRO.archivoTiposPermitidos,
            tipoDato: 'lista',
            admiteVacia: false,
          }),
        ]),
      );
    });
  });

  describe('lo que no es un parámetro', () => {
    it('una clave desconocida responde 404', async () => {
      const { body } = await como('administrador')
        .cambiar('parametro_inventado', { valor: '1' })
        .expect(404);
      expect(body).toMatchObject({ mensaje: MENSAJE_PARAMETRO_NO_EXISTE });
      expect(await fila('parametro_inventado')).toBeNull();
    });

    // NFR-003: el secreto y la vigencia del token son variables de entorno. Ni siquiera una
    // fila puesta a mano en la tabla los vuelve editables desde la aplicación.
    it('el secreto y la vigencia del JWT no aparecen ni se pueden editar', async () => {
      await prisma.parametro_sistema.upsert({
        where: { clave: CLAVE_JWT },
        create: { clave: CLAVE_JWT, valor: '480', tipo_dato: 'entero' },
        update: { valor: '480' },
      });

      const { body } = await como('administrador').listar().expect(200);
      const texto = JSON.stringify(body).toLowerCase();
      for (const palabra of ['jwt', 'token', 'secreto']) {
        expect(texto).not.toContain(palabra);
      }

      for (const clave of [CLAVE_JWT, 'jwt_secreto', 'JWT_SECRETO']) {
        const respuesta = await como('administrador')
          .cambiar(clave, { valor: '99999' })
          .expect(404);
        expect(respuesta.body).toMatchObject({
          mensaje: MENSAJE_PARAMETRO_NO_EXISTE,
        });
      }
      expect((await fila(CLAVE_JWT))?.valor).toBe('480');
      expect(await fila('jwt_secreto')).toBeNull();
    });
  });

  describe('valores inválidos (400)', () => {
    const rango = RANGO_PARAMETRO[PARAMETRO.inicioSesionIntentosMaximos];
    const casos: [string, string, object, string][] = [
      [
        'un texto donde va un entero',
        PARAMETRO.alertaDiasAnticipacion,
        { valor: 'dos' },
        MENSAJE_NO_ES_ENTERO,
      ],
      [
        'un entero fuera del rango',
        PARAMETRO.inicioSesionIntentosMaximos,
        { valor: '0' },
        mensajeFueraDeRango(rango),
      ],
      [
        'otro valor donde va sí o no',
        PARAMETRO.revisionBloquearAutoaprobacion,
        { valor: 'quizás' },
        MENSAJE_NO_ES_SI_NO,
      ],
      [
        'los tipos de archivo vacíos',
        PARAMETRO.archivoTiposPermitidos,
        { elementos: [] },
        MENSAJE_LISTA_VACIA,
      ],
      [
        'un elemento vacío',
        PARAMETRO.catalogoEstrategiasEnsenanza,
        { elementos: ['Lluvia de ideas', ' '] },
        MENSAJE_ELEMENTO_VACIO,
      ],
      [
        'un elemento repetido',
        PARAMETRO.catalogoEstrategiasEnsenanza,
        { elementos: ['Lluvia de ideas', 'lluvia de ideas'] },
        mensajeElementoRepetido('lluvia de ideas'),
      ],
      [
        'una lista que no cabe en el valor',
        PARAMETRO.catalogoEstrategiasEnsenanza,
        { elementos: ['a'.repeat(200), 'b'.repeat(100)] },
        mensajeValorLargo(302),
      ],
      [
        'un valor suelto donde va una lista',
        PARAMETRO.archivoTiposPermitidos,
        { valor: 'pdf' },
        MENSAJE_FALTAN_ELEMENTOS,
      ],
    ];

    it.each(casos)('%s', async (_caso, clave, cuerpo, mensaje) => {
      const antes = await fila(clave);
      const { body } = await como('administrador')
        .cambiar(clave, cuerpo)
        .expect(400);
      expect(body).toMatchObject({ estado: 400, mensaje });
      expect(await fila(clave)).toEqual(antes);
    });

    it('un campo que no es del contrato, o un valor que no es texto', async () => {
      const clave = PARAMETRO.alertaDiasAnticipacion;
      const extra = await como('administrador')
        .cambiar(clave, { valor: '3', tipo_dato: 'lista' })
        .expect(400);
      expect(extra.body).toMatchObject({
        mensaje: MENSAJE_DATOS_INVALIDOS,
        detalles: ['El campo «tipo_dato» no está permitido.'],
      });
      const numero = await como('administrador')
        .cambiar(clave, { valor: 3 })
        .expect(400);
      expect(numero.body).toMatchObject({
        mensaje: MENSAJE_DATOS_INVALIDOS,
        detalles: expect.arrayContaining(['El valor debe ser un texto.']),
      });
    });
  });

  describe('cambio', () => {
    it('guarda el valor, dice quién lo cambió y lo audita con el anterior y el nuevo', async () => {
      const clave = PARAMETRO.alertaDiasAnticipacion;
      // Punto de partida conocido, exista o no la fila.
      await como('administrador').cambiar(clave, { valor: '2' }).expect(200);
      const desde = new Date(Date.now() - 1000);

      const { body } = await como('administrador')
        .cambiar(clave, { valor: ' 7 ' })
        .expect(200);

      expect(body).toMatchObject({
        clave,
        tipoDato: 'entero',
        valor: '7',
        actualizadoPor: 'Usuario administrador E2E',
      });
      expect(new Date(body.actualizadoEn as string).getTime()).not.toBeNaN();

      const guardada = await fila(clave);
      expect(guardada).toMatchObject({
        valor: '7',
        id_actualizado_por: idsUsuarios.administrador,
      });

      const eventos = await prisma.auditoria.findMany({
        where: {
          tabla_afectada: 'parametro_sistema',
          id_registro: guardada!.id,
          id_usuario: idsUsuarios.administrador,
          fecha: { gte: desde },
        },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({
        accion: 'actualizar',
        valor_anterior: { clave, valor: '2' },
        valor_nuevo: { clave, valor: '7' },
      });

      // Y la consulta lo muestra en la siguiente petición.
      const lista = await como('administrador').listar().expect(200);
      expect(lista.body.elementos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            clave,
            valor: '7',
            actualizadoPor: 'Usuario administrador E2E',
          }),
        ]),
      );
    });

    it('guardar el mismo valor no deja otro registro de auditoría', async () => {
      const clave = PARAMETRO.alertaDiasAnticipacion;
      await como('administrador').cambiar(clave, { valor: '7' }).expect(200);
      const cuenta = () =>
        prisma.auditoria.count({
          where: {
            tabla_afectada: 'parametro_sistema',
            id_usuario: idsUsuarios.administrador,
          },
        });
      const antes = await cuenta();

      await como('administrador').cambiar(clave, { valor: '07' }).expect(200);

      expect(await cuenta()).toBe(antes);
    });

    it('guarda una lista normalizada y la devuelve por elementos', async () => {
      const clave = PARAMETRO.archivoTiposPermitidos;
      const { body } = await como('administrador')
        .cambiar(clave, { elementos: ['.PDF', ' xlsx ', 'Jpg'] })
        .expect(200);

      expect(body).toMatchObject({
        valor: 'pdf,xlsx,jpg',
        elementos: ['pdf', 'xlsx', 'jpg'],
      });
      expect((await fila(clave))?.valor).toBe('pdf,xlsx,jpg');
    });
  });

  // Criterio de aceptación: «los cambios aplican sin redesplegar». El bloqueo por intentos
  // fallidos (HU-01-04) lee el límite en cada inicio de sesión. La regla de la revisión (RF-18)
  // se prueba igual en revision.e2e-spec.ts.
  describe('el cambio rige desde la siguiente petición', () => {
    it('el límite de intentos nuevo se aplica al siguiente inicio de sesión', async () => {
      await como('administrador')
        .cambiar(PARAMETRO.inicioSesionMinutosBloqueo, { valor: '15' })
        .expect(200);

      await como('administrador')
        .cambiar(PARAMETRO.inicioSesionIntentosMaximos, { valor: '2' })
        .expect(200);
      await iniciarSesion('victimaUno', 'clave-equivocada').expect(401);
      await iniciarSesion('victimaUno', 'clave-equivocada').expect(429);

      // Con el límite en 1, a otra cuenta la bloquea el primer intento fallido.
      await como('administrador')
        .cambiar(PARAMETRO.inicioSesionIntentosMaximos, { valor: '1' })
        .expect(200);
      await iniciarSesion('victimaDos', 'clave-equivocada').expect(429);
    });
  });
});
