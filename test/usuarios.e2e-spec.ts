import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VALOR_OMITIDO } from '../src/auditoria/auditoria.service.js';
import {
  MENSAJE_SESION_INVALIDA,
  MENSAJE_USUARIO_INACTIVO,
} from '../src/auth/auth.service.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { MENSAJE_SIN_PERMISO } from '../src/auth/roles.guard.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  MENSAJE_CORREO_REPETIDO,
  MENSAJE_DOCUMENTO_REPETIDO,
  MENSAJE_NO_INACTIVARSE,
  MENSAJE_PROGRAMA_NO_EXISTE,
  MENSAJE_ROL_REPETIDO,
  MENSAJE_USUARIO_NO_EXISTE,
} from '../src/usuarios/usuarios.service.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

const PATRON_CONTRASENA = /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/;

// Requiere el .env configurado y la base local levantada (npm run db:levantar). No depende del
// seed: crea sus programas, roles y usuarios ficticios, y lo borra todo al terminar. La regla
// del último administrador depende de todos los usuarios de la base: se prueba en
// usuarios.service.spec.ts con una base simulada.
describe('Gestión de usuarios (e2e) · HU-02-01 a HU-02-04', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  const matriz = matrizDePrueba();
  const rolesCreados: number[] = [];
  const idsUsuarios: number[] = [];
  let idProgramaA: number;
  let idProgramaB: number;
  let idRolDocente: number;
  let idRolDepartamento: number;
  let idAdministrador: number;
  let idDocente: number;
  let idDeOtroPrograma: number;
  let tokenAdministrador: string;
  let tokenDepartamento: string;
  let tokenDocente: string;
  /** El usuario que crea la prueba por la API, y su contraseña temporal. */
  let idNuevo: number;
  let contrasenaTemporal: string;
  let tokenNuevo: string;

  const api = () => request(app.getHttpServer());
  const con = (token: string) => {
    const autorizar = (peticion: request.Test) =>
      peticion.set('Authorization', `Bearer ${token}`);
    return {
      get: (ruta: string) => autorizar(api().get(`/api${ruta}`)),
      post: (ruta: string) => autorizar(api().post(`/api${ruta}`)),
      patch: (ruta: string) => autorizar(api().patch(`/api${ruta}`)),
      delete: (ruta: string) => autorizar(api().delete(`/api${ruta}`)),
    };
  };
  const correoDe = (nombre: string) =>
    `e2e.usuarios.${nombre}.${sufijo}@prueba.urap.local`;
  const iniciarSesion = (correo: string, clave: string) =>
    api().post('/api/auth/iniciar-sesion').send({ correo, contrasena: clave });
  const ids = (cuerpo: { elementos: { id: number }[] }) =>
    cuerpo.elementos.map(({ id }) => id);

  async function rolDelSistema(nombre: NombreRol): Promise<number> {
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
    idProgramaRol: number | null,
    idPrograma: number,
  ): Promise<{ id: number; token: string }> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Persona',
        apellidos: `${nombre} ${sufijo}`,
        email: correoDe(nombre),
        identificacion: `E2E-${nombre.slice(0, 3)}-${sufijo.slice(-8)}`,
        id_programa: idPrograma,
        password_hash: await app.get(ContrasenasService).hashear(contrasena),
        activo: true,
      },
    });
    idsUsuarios.push(usuario.id);
    await prisma.usuario_rol.create({
      data: {
        id_usuario: usuario.id,
        id_rol: idRol,
        id_programa: idProgramaRol,
        activo: true,
      },
    });
    const { body } = await iniciarSesion(correoDe(nombre), contrasena).expect(
      200,
    );
    return { id: usuario.id, token: body.token as string };
  }

  const datosNuevo = () => ({
    nombres: 'Persona',
    apellidos: `Nueva ${sufijo}`,
    identificacion: `N-${sufijo.slice(-10)}`,
    correo: correoDe('nueva'),
    idPrograma: idProgramaA,
    roles: [
      { idRol: idRolDocente, idPrograma: idProgramaA },
      { idRol: idRolDepartamento, idPrograma: idProgramaB },
    ],
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);
    await asegurarCatalogoDePermisos(prisma, matriz);

    idProgramaA = (
      await prisma.programa.create({
        data: { nombre: `Programa A e2e ${sufijo}`, activo: true },
      })
    ).id;
    idProgramaB = (
      await prisma.programa.create({
        data: { nombre: `Programa B e2e ${sufijo}`, activo: true },
      })
    ).id;
    const idRolAdministrador = await rolDelSistema(ROL.administrador);
    idRolDepartamento = await rolDelSistema(ROL.departamento);
    idRolDocente = await rolDelSistema(ROL.docente);

    const administrador = await crearUsuario(
      'administrador',
      idRolAdministrador,
      null,
      idProgramaA,
    );
    idAdministrador = administrador.id;
    tokenAdministrador = administrador.token;
    tokenDepartamento = (
      await crearUsuario(
        'departamento',
        idRolDepartamento,
        idProgramaA,
        idProgramaA,
      )
    ).token;
    const docente = await crearUsuario(
      'docente',
      idRolDocente,
      idProgramaA,
      idProgramaA,
    );
    idDocente = docente.id;
    tokenDocente = docente.token;
    idDeOtroPrograma = (
      await crearUsuario('otro', idRolDocente, idProgramaB, idProgramaB)
    ).id;
    // Cuatro usuarios con su contraseña y su inicio de sesión no caben en 10 segundos en un
    // equipo ocupado.
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      await borrarUsuariosDePrueba(prisma, idsUsuarios);
      await prisma.programa.deleteMany({
        where: { id: { in: [idProgramaA, idProgramaB] } },
      });
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: rolesCreados } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
  });

  describe('quién puede (matriz, Tabla 11)', () => {
    it('sin sesión responde 401', async () => {
      await api().get('/api/usuarios').expect(401);
      await api().post('/api/usuarios').send(datosNuevo()).expect(401);
    });

    it('el Docente no tiene acceso: 403 en todo', async () => {
      const { body } = await con(tokenDocente).get('/usuarios').expect(403);
      expect(body.mensaje).toBe(MENSAJE_SIN_PERMISO);
      await con(tokenDocente).get('/usuarios/opciones').expect(403);
      await con(tokenDocente).get(`/usuarios/${idDocente}`).expect(403);
      await con(tokenDocente).post('/usuarios').send(datosNuevo()).expect(403);
    });

    it('el Departamento consulta a los de su programa, sin el documento, y no cambia nada', async () => {
      const lista = await con(tokenDepartamento)
        .get('/usuarios')
        .query({ buscar: sufijo, tamano: 100 })
        .expect(200);
      expect(ids(lista.body)).toContain(idDocente);
      expect(ids(lista.body)).not.toContain(idDeOtroPrograma);

      const detalle = await con(tokenDepartamento)
        .get(`/usuarios/${idDocente}`)
        .expect(200);
      expect(detalle.body.identificacion).toBeNull();
      // Un usuario de otro programa no existe para quien no lo alcanza.
      await con(tokenDepartamento)
        .get(`/usuarios/${idDeOtroPrograma}`)
        .expect(404);

      const opciones = await con(tokenDepartamento)
        .get('/usuarios/opciones')
        .expect(200);
      expect(opciones.body.programas).toEqual([
        { id: idProgramaA, nombre: `Programa A e2e ${sufijo}` },
      ]);

      await con(tokenDepartamento)
        .post('/usuarios')
        .send(datosNuevo())
        .expect(403);
      await con(tokenDepartamento)
        .patch(`/usuarios/${idDocente}`)
        .send({ nombres: 'Otra' })
        .expect(403);
      await con(tokenDepartamento)
        .patch(`/usuarios/${idDocente}/estado`)
        .send({ activo: false })
        .expect(403);
      await con(tokenDepartamento)
        .post(`/usuarios/${idDocente}/contrasena-temporal`)
        .expect(403);
    });
  });

  describe('crear (HU-02-01)', () => {
    it('crea el usuario activo con sus roles y devuelve la contraseña temporal una vez', async () => {
      const { body, text } = await con(tokenAdministrador)
        .post('/usuarios')
        .send({ ...datosNuevo(), correo: correoDe('nueva').toUpperCase() })
        .expect(201);
      idNuevo = body.usuario.id;
      idsUsuarios.push(idNuevo);
      contrasenaTemporal = body.contrasenaTemporal;

      expect(contrasenaTemporal).toMatch(PATRON_CONTRASENA);
      expect(body.usuario).toMatchObject({
        nombres: 'Persona',
        apellidos: `Nueva ${sufijo}`,
        // El correo se guarda en minúsculas.
        correo: correoDe('nueva'),
        identificacion: `N-${sufijo.slice(-10)}`,
        idPrograma: idProgramaA,
        programa: `Programa A e2e ${sufijo}`,
        activo: true,
      });
      expect(body.usuario.roles).toMatchObject([
        { idRol: idRolDocente, rol: ROL.docente, idPrograma: idProgramaA },
        {
          idRol: idRolDepartamento,
          rol: ROL.departamento,
          idPrograma: idProgramaB,
        },
      ]);
      expect(text).not.toContain('password');
      expect(text).not.toContain('scrypt$');

      const asignaciones = await prisma.usuario_rol.findMany({
        where: { id_usuario: idNuevo },
      });
      expect(asignaciones).toHaveLength(2);
      for (const asignacion of asignaciones) {
        expect(asignacion.id_asignado_por).toBe(idAdministrador);
        expect(asignacion.fecha_asignacion).toBeInstanceOf(Date);
      }
    });

    it('la contraseña se guarda como hash y el usuario entra con la temporal', async () => {
      const guardado = await prisma.usuario.findUniqueOrThrow({
        where: { id: idNuevo },
      });
      expect(guardado.password_hash).toMatch(/^scrypt\$/);
      expect(guardado.password_hash).not.toContain(contrasenaTemporal);

      const { body } = await iniciarSesion(
        correoDe('nueva'),
        contrasenaTemporal,
      ).expect(200);
      tokenNuevo = body.token;
      expect(body.usuario.roles.sort()).toEqual(
        [ROL.departamento, ROL.docente].sort(),
      );
    });

    it('la creación queda en auditoría, sin el documento ni la contraseña', async () => {
      const creacion = await prisma.auditoria.findFirstOrThrow({
        where: {
          tabla_afectada: 'usuario',
          id_registro: idNuevo,
          accion: 'crear',
        },
      });
      expect(creacion.id_usuario).toBe(idAdministrador);
      expect(creacion.valor_nuevo).toEqual({
        nombres: 'Persona',
        apellidos: `Nueva ${sufijo}`,
        correo: correoDe('nueva'),
        identificacion: VALOR_OMITIDO,
        idPrograma: idProgramaA,
        activo: true,
      });
      const texto = JSON.stringify(creacion);
      expect(texto).not.toContain(contrasenaTemporal);
      expect(texto).not.toContain(`N-${sufijo.slice(-10)}`);

      const roles = await prisma.auditoria.count({
        where: {
          tabla_afectada: 'usuario_rol',
          accion: 'crear',
          id_usuario: idAdministrador,
        },
      });
      expect(roles).toBe(2);
    });

    it('no admite un correo ni un documento que ya existen (RF-02, excepción p5)', async () => {
      const correo = await con(tokenAdministrador)
        .post('/usuarios')
        .send({ ...datosNuevo(), identificacion: `X-${sufijo.slice(-10)}` })
        .expect(409);
      expect(correo.body.mensaje).toBe(MENSAJE_CORREO_REPETIDO);

      const documento = await con(tokenAdministrador)
        .post('/usuarios')
        .send({ ...datosNuevo(), correo: correoDe('distinta') })
        .expect(409);
      expect(documento.body.mensaje).toBe(MENSAJE_DOCUMENTO_REPETIDO);
    });

    it('rechaza los datos que no son válidos', async () => {
      const base = {
        ...datosNuevo(),
        correo: correoDe('invalida'),
        identificacion: `I-${sufijo.slice(-10)}`,
      };
      const enviar = (cambios: Record<string, unknown>) =>
        con(tokenAdministrador)
          .post('/usuarios')
          .send({ ...base, ...cambios });

      await enviar({ roles: [] }).expect(400);
      await enviar({ correo: 'no-es-un-correo' }).expect(400);
      await enviar({ nombres: ' ' }).expect(400);
      await enviar({ identificacion: '12 34' }).expect(400);
      await enviar({ contrasena: 'la-elijo-yo' }).expect(400);
      const repetido = await enviar({
        roles: [
          { idRol: idRolDocente, idPrograma: idProgramaA },
          { idRol: idRolDocente, idPrograma: idProgramaA },
        ],
      }).expect(400);
      expect(repetido.body.mensaje).toBe(MENSAJE_ROL_REPETIDO);
      const programa = await enviar({ idPrograma: 999999999 }).expect(400);
      expect(programa.body.mensaje).toBe(MENSAJE_PROGRAMA_NO_EXISTE);
      await enviar({ roles: [{ idRol: 999999999 }] }).expect(400);

      expect(
        await prisma.usuario.count({ where: { email: correoDe('invalida') } }),
      ).toBe(0);
    });
  });

  describe('consultar (HU-02-04)', () => {
    const listar = (filtros: Record<string, string | number> = {}) =>
      con(tokenAdministrador)
        .get('/usuarios')
        .query({ buscar: sufijo, tamano: 100, ...filtros });

    it('lista nombre, correo, roles y estado, sin documento ni contraseña', async () => {
      const { body, text } = await listar().expect(200);

      expect(body.total).toBe(5);
      const nuevo = body.elementos.find(
        (usuario: { id: number }) => usuario.id === idNuevo,
      );
      expect(nuevo).toMatchObject({
        correo: correoDe('nueva'),
        activo: true,
        programa: `Programa A e2e ${sufijo}`,
      });
      expect(nuevo.roles).toHaveLength(2);
      expect(nuevo).not.toHaveProperty('identificacion');
      expect(text).not.toContain('identificacion');
      expect(text).not.toContain('password');
      expect(text).not.toContain('scrypt$');
    });

    it('filtra por programa: los que pertenecen a él o tienen ahí un rol', async () => {
      const { body } = await listar({ idPrograma: idProgramaB }).expect(200);

      expect(ids(body).sort()).toEqual([idDeOtroPrograma, idNuevo].sort());
    });

    it('filtra por rol y por estado', async () => {
      const departamento = await listar({ idRol: idRolDepartamento }).expect(
        200,
      );
      expect(departamento.body.total).toBe(2);
      expect(ids(departamento.body)).toContain(idNuevo);

      const inactivos = await listar({ estado: 'inactivo' }).expect(200);
      expect(inactivos.body.total).toBe(0);
      const activos = await listar({ estado: 'activo' }).expect(200);
      expect(activos.body.total).toBe(5);
    });

    it('está paginado y ordenado por apellidos', async () => {
      const { body } = await listar({ tamano: 2, pagina: 2 }).expect(200);

      expect(body).toMatchObject({ pagina: 2, tamano: 2, total: 5 });
      expect(body.elementos).toHaveLength(2);
      const todos = await listar().expect(200);
      const apellidos = todos.body.elementos.map(
        (usuario: { apellidos: string }) => usuario.apellidos,
      );
      expect(apellidos).toEqual(
        [...apellidos].sort((a, b) => a.localeCompare(b, 'es')),
      );
      await listar({ tamano: 101 }).expect(400);
      await listar({ estado: 'borrado' }).expect(400);
    });

    it('el detalle trae el documento para quien administra, y 404 si no existe', async () => {
      const { body, text } = await con(tokenAdministrador)
        .get(`/usuarios/${idNuevo}`)
        .expect(200);
      expect(body.identificacion).toBe(`N-${sufijo.slice(-10)}`);
      expect(text).not.toContain('password');

      const inexistente = await con(tokenAdministrador)
        .get('/usuarios/999999999')
        .expect(404);
      expect(inexistente.body.mensaje).toBe(MENSAJE_USUARIO_NO_EXISTE);
    });
  });

  describe('editar (HU-02-02)', () => {
    it('cambia los datos y audita solo lo que cambió, con el valor anterior y el nuevo', async () => {
      const { body } = await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({
          nombres: 'Persona Editada',
          apellidos: `Nueva ${sufijo}`,
          identificacion: `M-${sufijo.slice(-10)}`,
        })
        .expect(200);
      expect(body).toMatchObject({
        nombres: 'Persona Editada',
        identificacion: `M-${sufijo.slice(-10)}`,
        correo: correoDe('nueva'),
      });

      const cambio = await prisma.auditoria.findFirstOrThrow({
        where: {
          tabla_afectada: 'usuario',
          id_registro: idNuevo,
          accion: 'actualizar',
        },
        orderBy: { id: 'desc' },
      });
      // Los apellidos llegaron iguales: no están. Del documento queda solo que cambió.
      expect(cambio.valor_anterior).toEqual({
        nombres: 'Persona',
        identificacion: VALOR_OMITIDO,
      });
      expect(cambio.valor_nuevo).toEqual({
        nombres: 'Persona Editada',
        identificacion: VALOR_OMITIDO,
      });
    });

    it('si nada cambia, no deja registro en auditoría', async () => {
      const antes = await prisma.auditoria.count({
        where: { tabla_afectada: 'usuario', id_registro: idNuevo },
      });
      await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ nombres: 'Persona Editada' })
        .expect(200);
      const despues = await prisma.auditoria.count({
        where: { tabla_afectada: 'usuario', id_registro: idNuevo },
      });
      expect(despues).toBe(antes);
    });

    it('valida de nuevo que el correo y el documento sean únicos', async () => {
      const correo = await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ correo: correoDe('docente') })
        .expect(409);
      expect(correo.body.mensaje).toBe(MENSAJE_CORREO_REPETIDO);

      const documento = await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ identificacion: `E2E-doc-${sufijo.slice(-8)}` })
        .expect(409);
      expect(documento.body.mensaje).toBe(MENSAJE_DOCUMENTO_REPETIDO);

      // Su propio correo no choca consigo mismo.
      await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ correo: correoDe('nueva') })
        .expect(200);
    });

    it('rechaza datos no válidos, la contraseña y un usuario que no existe', async () => {
      await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ correo: 'no-es-un-correo' })
        .expect(400);
      await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ password_hash: 'x' })
        .expect(400);
      await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}`)
        .send({ activo: false })
        .expect(400);
      await con(tokenAdministrador)
        .patch('/usuarios/999999999')
        .send({ nombres: 'Nadie' })
        .expect(404);
    });
  });

  describe('inactivar (HU-02-03)', () => {
    it('no existe una ruta para eliminar usuarios (RF-02, excepción p6)', async () => {
      await con(tokenAdministrador).delete(`/usuarios/${idNuevo}`).expect(404);
      expect(await prisma.usuario.count({ where: { id: idNuevo } })).toBe(1);
    });

    it('nadie se inactiva a sí mismo', async () => {
      const { body } = await con(tokenAdministrador)
        .patch(`/usuarios/${idAdministrador}/estado`)
        .send({ activo: false })
        .expect(409);
      expect(body.mensaje).toBe(MENSAJE_NO_INACTIVARSE);
    });

    it('un usuario inactivo no inicia sesión y su sesión abierta deja de servir', async () => {
      await con(tokenNuevo).get('/auth/sesion').expect(200);

      const { body } = await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}/estado`)
        .send({ activo: false })
        .expect(200);
      expect(body.activo).toBe(false);

      const sesion = await con(tokenNuevo).get('/auth/sesion').expect(401);
      expect(sesion.body.mensaje).toBe(MENSAJE_SESION_INVALIDA);
      const ingreso = await iniciarSesion(
        correoDe('nueva'),
        contrasenaTemporal,
      ).expect(403);
      expect(ingreso.body.mensaje).toBe(MENSAJE_USUARIO_INACTIVO);

      const cambio = await prisma.auditoria.findFirstOrThrow({
        where: {
          tabla_afectada: 'usuario',
          id_registro: idNuevo,
          accion: 'actualizar',
        },
        orderBy: { id: 'desc' },
      });
      expect(cambio.valor_anterior).toEqual({ activo: true });
      expect(cambio.valor_nuevo).toEqual({ activo: false });
    });

    it('sigue en el listado como inactivo, con sus roles', async () => {
      const { body } = await con(tokenAdministrador)
        .get('/usuarios')
        .query({ buscar: sufijo, estado: 'inactivo' })
        .expect(200);
      expect(ids(body)).toEqual([idNuevo]);
      expect(body.elementos[0].roles).toHaveLength(2);
    });

    it('al reactivarlo vuelve a entrar, pero la sesión anterior no revive', async () => {
      const { body } = await con(tokenAdministrador)
        .patch(`/usuarios/${idNuevo}/estado`)
        .send({ activo: true })
        .expect(200);
      expect(body.activo).toBe(true);

      await con(tokenNuevo).get('/auth/sesion').expect(401);
      const ingreso = await iniciarSesion(
        correoDe('nueva'),
        contrasenaTemporal,
      ).expect(200);
      tokenNuevo = ingreso.body.token;
    });
  });

  describe('contraseña temporal nueva', () => {
    it('la genera, la devuelve una vez, cierra las sesiones del usuario y no la audita', async () => {
      const { body } = await con(tokenAdministrador)
        .post(`/usuarios/${idNuevo}/contrasena-temporal`)
        .expect(200);
      const nueva = body.contrasenaTemporal as string;
      expect(nueva).toMatch(PATRON_CONTRASENA);
      expect(nueva).not.toBe(contrasenaTemporal);

      await con(tokenNuevo).get('/auth/sesion').expect(401);
      await iniciarSesion(correoDe('nueva'), contrasenaTemporal).expect(401);
      await iniciarSesion(correoDe('nueva'), nueva).expect(200);

      const registro = await prisma.auditoria.findFirstOrThrow({
        where: {
          tabla_afectada: 'usuario',
          id_registro: idNuevo,
          accion: 'actualizar',
        },
        orderBy: { id: 'desc' },
      });
      expect(registro.valor_nuevo).toEqual({ contrasena: VALOR_OMITIDO });
      expect(JSON.stringify(registro)).not.toContain(nueva);
    });

    it('quien se la genera a sí mismo conserva su sesión', async () => {
      const { body } = await con(tokenAdministrador)
        .post(`/usuarios/${idAdministrador}/contrasena-temporal`)
        .expect(200);
      expect(body.contrasenaTemporal).toMatch(PATRON_CONTRASENA);
      await con(tokenAdministrador).get('/auth/sesion').expect(200);
    });

    it('responde 404 si el usuario no existe', async () => {
      await con(tokenAdministrador)
        .post('/usuarios/999999999/contrasena-temporal')
        .expect(404);
    });
  });
});
