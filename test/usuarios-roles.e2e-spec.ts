import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  MENSAJE_ASIGNACION_NO_EXISTE,
  MENSAJE_NO_QUITARSE_ADMINISTRACION,
  MENSAJE_ROL_YA_ASIGNADO,
} from '../src/usuarios/usuarios.service.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). No depende del
// seed: crea sus programas, roles y usuarios ficticios, y lo borra todo al terminar.
describe('Roles de un usuario con historial (e2e) · HU-02-07', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  /** Como un rol del sembrado: con su fecha, pero sin pasar por la auditoría. */
  const fechaInicial = new Date('2026-08-03T13:00:00.000Z');

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
  let idAsignacionAdministrador: number;
  let idDocente: number;
  let idAsignacionInicial: number;
  let tokenAdministrador: string;
  let tokenDepartamento: string;
  let tokenDocente: string;
  /** La asignación que crea la prueba por la API. */
  let idAsignacionNueva: number;

  const api = () => request(app.getHttpServer());
  const con = (token: string) => {
    const autorizar = (peticion: request.Test) =>
      peticion.set('Authorization', `Bearer ${token}`);
    return {
      get: (ruta: string) => autorizar(api().get(`/api${ruta}`)),
      post: (ruta: string) => autorizar(api().post(`/api${ruta}`)),
      delete: (ruta: string) => autorizar(api().delete(`/api${ruta}`)),
    };
  };
  const correoDe = (nombre: string) =>
    `e2e.roles-usuario.${nombre}.${sufijo}@prueba.urap.local`;

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
  ): Promise<{ id: number; idAsignacion: number; token: string }> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Persona',
        apellidos: `${nombre} ${sufijo}`,
        email: correoDe(nombre),
        id_programa: idProgramaA,
        password_hash: await app.get(ContrasenasService).hashear(contrasena),
        activo: true,
      },
    });
    idsUsuarios.push(usuario.id);
    const asignacion = await prisma.usuario_rol.create({
      data: {
        id_usuario: usuario.id,
        id_rol: idRol,
        id_programa: idProgramaRol,
        activo: true,
        fecha_asignacion: fechaInicial,
      },
    });
    const { body } = await api()
      .post('/api/auth/iniciar-sesion')
      .send({ correo: correoDe(nombre), contrasena })
      .expect(200);
    return {
      id: usuario.id,
      idAsignacion: asignacion.id,
      token: body.token as string,
    };
  }

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
        data: { nombre: `Programa A roles e2e ${sufijo}`, activo: true },
      })
    ).id;
    idProgramaB = (
      await prisma.programa.create({
        data: { nombre: `Programa B roles e2e ${sufijo}`, activo: true },
      })
    ).id;
    const idRolAdministrador = await rolDelSistema(ROL.administrador);
    idRolDepartamento = await rolDelSistema(ROL.departamento);
    idRolDocente = await rolDelSistema(ROL.docente);

    const administrador = await crearUsuario(
      'administrador',
      idRolAdministrador,
      null,
    );
    idAdministrador = administrador.id;
    idAsignacionAdministrador = administrador.idAsignacion;
    tokenAdministrador = administrador.token;
    tokenDepartamento = (
      await crearUsuario('departamento', idRolDepartamento, idProgramaA)
    ).token;
    const docente = await crearUsuario('docente', idRolDocente, idProgramaA);
    idDocente = docente.id;
    idAsignacionInicial = docente.idAsignacion;
    tokenDocente = docente.token;
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: idsUsuarios } },
      });
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

  it('solo quien administra usuarios asigna, revoca y ve el historial', async () => {
    const rol = { idRol: idRolDepartamento, idPrograma: idProgramaA };
    await api().post(`/api/usuarios/${idDocente}/roles`).send(rol).expect(401);
    for (const token of [tokenDepartamento, tokenDocente]) {
      await con(token)
        .post(`/usuarios/${idDocente}/roles`)
        .send(rol)
        .expect(403);
      await con(token)
        .delete(`/usuarios/${idDocente}/roles/${idAsignacionInicial}`)
        .expect(403);
      await con(token)
        .get(`/usuarios/${idDocente}/roles/historial`)
        .expect(403);
    }
  });

  it('asigna un rol y registra la fecha y quién lo asignó', async () => {
    // Con solo el rol de Docente, la persona no consulta usuarios.
    await con(tokenDocente).get('/usuarios').expect(403);

    const { body } = await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idRol: idRolDepartamento, idPrograma: idProgramaA })
      .expect(201);
    expect(body.roles).toMatchObject([
      { id: idAsignacionInicial, rol: ROL.docente, idPrograma: idProgramaA },
      {
        rol: ROL.departamento,
        idPrograma: idProgramaA,
        programa: `Programa A roles e2e ${sufijo}`,
      },
    ]);
    idAsignacionNueva = body.roles[1].id;

    const fila = await prisma.usuario_rol.findUniqueOrThrow({
      where: { id: idAsignacionNueva },
    });
    expect(fila).toMatchObject({
      activo: true,
      fecha_revocacion: null,
      id_asignado_por: idAdministrador,
    });
    expect(fila.fecha_asignacion).toBeInstanceOf(Date);

    const auditoria = await prisma.auditoria.findFirstOrThrow({
      where: { tabla_afectada: 'usuario_rol', id_registro: idAsignacionNueva },
    });
    expect(auditoria).toMatchObject({
      accion: 'crear',
      id_usuario: idAdministrador,
      valor_nuevo: {
        idUsuario: idDocente,
        idRol: idRolDepartamento,
        idPrograma: idProgramaA,
        activo: true,
      },
    });
  });

  it('el usuario tiene los dos roles vigentes, y el nuevo rige desde la siguiente petición', async () => {
    const sesion = await con(tokenDocente).get('/auth/sesion').expect(200);
    expect(sesion.body.roles.sort()).toEqual(
      [ROL.departamento, ROL.docente].sort(),
    );
    await con(tokenDocente).get('/usuarios').expect(200);
  });

  it('no asigna dos veces el mismo rol sobre el mismo programa, ni roles o usuarios que no existen', async () => {
    const repetido = await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idRol: idRolDepartamento, idPrograma: idProgramaA })
      .expect(409);
    expect(repetido.body.mensaje).toBe(MENSAJE_ROL_YA_ASIGNADO);

    await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idRol: 999999999, idPrograma: idProgramaA })
      .expect(400);
    await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idRol: idRolDepartamento, idPrograma: 999999999 })
      .expect(400);
    await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idPrograma: idProgramaA })
      .expect(400);
    await con(tokenAdministrador)
      .post('/usuarios/999999999/roles')
      .send({ idRol: idRolDepartamento, idPrograma: idProgramaA })
      .expect(404);
  });

  it('el mismo rol sobre otro programa es otra asignación', async () => {
    const { body } = await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idRol: idRolDepartamento, idPrograma: idProgramaB })
      .expect(201);
    expect(body.roles).toHaveLength(3);
  });

  it('revoca de forma lógica: la fila queda inactiva con su fecha, y el permiso deja de regir', async () => {
    const { body } = await con(tokenAdministrador)
      .delete(`/usuarios/${idDocente}/roles/${idAsignacionNueva}`)
      .expect(200);
    expect(body.roles.map((rol: { id: number }) => rol.id)).not.toContain(
      idAsignacionNueva,
    );

    const fila = await prisma.usuario_rol.findUniqueOrThrow({
      where: { id: idAsignacionNueva },
    });
    expect(fila.activo).toBe(false);
    expect(fila.fecha_revocacion).toBeInstanceOf(Date);

    const auditoria = await prisma.auditoria.findFirstOrThrow({
      where: { tabla_afectada: 'usuario_rol', id_registro: idAsignacionNueva },
      orderBy: { id: 'desc' },
    });
    expect(auditoria.accion).toBe('actualizar');
    expect(auditoria.valor_anterior).toMatchObject({ activo: true });
    expect(auditoria.valor_nuevo).toMatchObject({ activo: false });

    // Le queda el Departamento del programa B: sigue consultando, pero ya no al programa A.
    const opciones = await con(tokenDocente)
      .get('/usuarios/opciones')
      .expect(200);
    expect(
      opciones.body.programas.map((programa: { id: number }) => programa.id),
    ).toEqual([idProgramaB]);
  });

  it('responde 404 si el usuario no tiene ese rol vigente', async () => {
    const yaRevocado = await con(tokenAdministrador)
      .delete(`/usuarios/${idDocente}/roles/${idAsignacionNueva}`)
      .expect(404);
    expect(yaRevocado.body.mensaje).toBe(MENSAJE_ASIGNACION_NO_EXISTE);
    // La asignación de otro usuario no se revoca desde este.
    await con(tokenAdministrador)
      .delete(`/usuarios/${idDocente}/roles/${idAsignacionAdministrador}`)
      .expect(404);
  });

  it('volver a asignar un rol revocado reutiliza la fila, sin perder el historial', async () => {
    const filasAntes = await prisma.usuario_rol.count({
      where: { id_usuario: idDocente },
    });
    const { body } = await con(tokenAdministrador)
      .post(`/usuarios/${idDocente}/roles`)
      .send({ idRol: idRolDepartamento, idPrograma: idProgramaA })
      .expect(201);
    expect(body.roles.map((rol: { id: number }) => rol.id)).toContain(
      idAsignacionNueva,
    );
    expect(
      await prisma.usuario_rol.count({ where: { id_usuario: idDocente } }),
    ).toBe(filasAntes);
    const fila = await prisma.usuario_rol.findUniqueOrThrow({
      where: { id: idAsignacionNueva },
    });
    expect(fila).toMatchObject({ activo: true, fecha_revocacion: null });
  });

  it('nadie se quita a sí mismo el rol con el que administra usuarios', async () => {
    const { body } = await con(tokenAdministrador)
      .delete(`/usuarios/${idAdministrador}/roles/${idAsignacionAdministrador}`)
      .expect(409);
    expect(body.mensaje).toBe(MENSAJE_NO_QUITARSE_ADMINISTRACION);
    await con(tokenAdministrador).get('/usuarios').expect(200);
  });

  it('el historial dice quién tuvo qué rol y cuándo, del más reciente al más antiguo', async () => {
    // Se revoca también el rol inicial, que nunca pasó por la auditoría.
    await con(tokenAdministrador)
      .delete(`/usuarios/${idDocente}/roles/${idAsignacionInicial}`)
      .expect(200);

    const { body } = await con(tokenAdministrador)
      .get(`/usuarios/${idDocente}/roles/historial`)
      .expect(200);
    const administrador = `Persona administrador ${sufijo}`;
    const resumen = body.eventos.map(
      (evento: {
        tipo: string;
        rol: string;
        idPrograma: number;
        realizadoPor: string | null;
      }) =>
        [evento.tipo, evento.rol, evento.idPrograma, evento.realizadoPor].join(
          '|',
        ),
    );
    // La fecha de la auditoría no guarda milisegundos: dos eventos pueden caer en el mismo
    // segundo, así que se compara sin depender de su orden entre sí.
    expect([...resumen].sort()).toEqual(
      [
        `revocacion|${ROL.docente}|${idProgramaA}|${administrador}`,
        `asignacion|${ROL.departamento}|${idProgramaA}|${administrador}`,
        `revocacion|${ROL.departamento}|${idProgramaA}|${administrador}`,
        `asignacion|${ROL.departamento}|${idProgramaB}|${administrador}`,
        `asignacion|${ROL.departamento}|${idProgramaA}|${administrador}`,
        // El rol inicial: la revocación guardó desde cuándo lo tenía; nadie quedó registrado.
        `asignacion|${ROL.docente}|${idProgramaA}|`,
      ].sort(),
    );
    const inicial = body.eventos.at(-1);
    expect(inicial).toMatchObject({
      tipo: 'asignacion',
      idAsignacion: idAsignacionInicial,
      fecha: fechaInicial.toISOString(),
      realizadoPor: null,
    });
    const fechas = body.eventos.map(
      (evento: { fecha: string }) => evento.fecha,
    );
    expect(fechas).toEqual([...fechas].sort().reverse());

    await con(tokenAdministrador)
      .get('/usuarios/999999999/roles/historial')
      .expect(404);
  });
});
