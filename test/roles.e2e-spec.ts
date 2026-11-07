import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { MODULOS, PERMISOS } from '../src/datos-iniciales/catalogos.js';
import {
  MENSAJE_NOMBRE_REPETIDO,
  MENSAJE_ROL_CON_USUARIOS,
  MENSAJE_ROL_SISTEMA_INACTIVAR,
  MENSAJE_ROL_SISTEMA_NOMBRE,
  MENSAJE_SIN_LECTURA,
} from '../src/usuarios/roles.service.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarPermisosDeRol,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). No depende del
// seed: crea los catálogos y roles que falten, sus usuarios ficticios, y lo borra todo al
// terminar. La regla del último administrador depende de todos los usuarios de la base, así que
// se prueba en roles.service.spec.ts con una base simulada.
describe('Roles y matriz de permisos (e2e) · HU-02-05 y HU-02-06', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let tokenAdministrador: string;
  let tokenDocente: string;
  const idsUsuarios: number[] = [];
  const idsRolesDePrueba: number[] = [];
  const matriz = matrizDePrueba();
  const creados = {
    modulos: [] as number[],
    permisos: [] as number[],
    roles: [] as number[],
  };
  let descripcionOriginalAdministrador: string | null = null;
  let idRolAdministrador: number;

  const api = () => request(app.getHttpServer());

  /** El rol del sistema con sus permisos de la Tabla 17: `/roles` exige `usuarios.administrar`. */
  async function asegurarRol(nombre: NombreRol): Promise<number> {
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

  async function crearUsuario(nombre: string, idRol: number): Promise<string> {
    const correo = `e2e.roles.${nombre}.${sufijo}@prueba.urap.local`;
    const usuario = await prisma.usuario.create({
      data: {
        nombres: 'Usuario',
        apellidos: `${nombre} E2E`,
        email: correo,
        password_hash: await app.get(ContrasenasService).hashear(contrasena),
        activo: true,
      },
    });
    idsUsuarios.push(usuario.id);
    await prisma.usuario_rol.create({
      data: { id_usuario: usuario.id, id_rol: idRol, activo: true },
    });
    const { body } = await api()
      .post('/api/auth/iniciar-sesion')
      .send({ correo, contrasena })
      .expect(200);
    return body.token as string;
  }

  const comoAdministrador = (peticion: request.Test) =>
    peticion.set('Authorization', `Bearer ${tokenAdministrador}`);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const datos of MODULOS) {
      if (
        !(await prisma.modulo.findUnique({ where: { codigo: datos.codigo } }))
      ) {
        creados.modulos.push((await prisma.modulo.create({ data: datos })).id);
      }
    }
    for (const datos of PERMISOS) {
      if (
        !(await prisma.permiso.findUnique({ where: { codigo: datos.codigo } }))
      ) {
        creados.permisos.push(
          (await prisma.permiso.create({ data: datos })).id,
        );
      }
    }
    idRolAdministrador = await asegurarRol(ROL.administrador);
    descripcionOriginalAdministrador =
      (await prisma.rol.findUnique({ where: { id: idRolAdministrador } }))
        ?.descripcion ?? null;
    const idRolDocente = await asegurarRol(ROL.docente);

    tokenAdministrador = await crearUsuario('admin', idRolAdministrador);
    tokenDocente = await crearUsuario('docente', idRolDocente);
  });

  afterAll(async () => {
    if (prisma) {
      const roles = [...idsRolesDePrueba, ...creados.roles];
      await prisma.auditoria.deleteMany({
        where: {
          tabla_afectada: { in: ['rol', 'rol_permiso'] },
          id_registro: { in: [...roles, idRolAdministrador] },
          fecha: { gte: new Date(Number(sufijo)) },
        },
      });
      await borrarUsuariosDePrueba(prisma, idsUsuarios);
      await prisma.rol_permiso.deleteMany({ where: { id_rol: { in: roles } } });
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: roles } } });
      await prisma.rol.updateMany({
        where: { id: idRolAdministrador },
        data: { descripcion: descripcionOriginalAdministrador },
      });
      await prisma.modulo.deleteMany({
        where: { id: { in: creados.modulos } },
      });
      await prisma.permiso.deleteMany({
        where: { id: { in: creados.permisos } },
      });
    }
    await app?.close();
  });

  describe('acceso', () => {
    it('sin sesión responde 401', async () => {
      await api().get('/api/roles').expect(401);
    });

    it('un usuario sin el rol Administrador recibe 403', async () => {
      await api()
        .get('/api/roles')
        .set('Authorization', `Bearer ${tokenDocente}`)
        .expect(403);
      await api()
        .post('/api/roles')
        .set('Authorization', `Bearer ${tokenDocente}`)
        .send({
          nombre: 'Intruso',
          permisos: [{ modulo: 'usuarios', permiso: 'leer' }],
        })
        .expect(403);
    });
  });

  describe('HU-02-05 · roles', () => {
    let idRol: number;

    it('presenta los roles existentes, paginados, y marca los del sistema', async () => {
      const { body } = await comoAdministrador(
        api().get('/api/roles?tamano=100'),
      ).expect(200);
      expect(body).toMatchObject({ pagina: 1, tamano: 100 });
      expect(body.elementos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nombre: ROL.administrador, sistema: true }),
        ]),
      );
    });

    it('no crea un rol sin permiso de lectura (RF-03, p4)', async () => {
      const { body } = await comoAdministrador(api().post('/api/roles'))
        .send({
          nombre: `Rol sin lectura ${sufijo}`,
          permisos: [{ modulo: 'proyectos', permiso: 'crear' }],
        })
        .expect(400);
      expect(body.mensaje).toBe(MENSAJE_SIN_LECTURA);
    });

    it('rechaza módulos o permisos que no existen', async () => {
      const { body } = await comoAdministrador(api().post('/api/roles'))
        .send({
          nombre: `Rol raro ${sufijo}`,
          permisos: [{ modulo: 'inexistente', permiso: 'leer' }],
        })
        .expect(400);
      expect(body.mensaje).toContain('«inexistente» no existe');
    });

    it('crea un rol con sus permisos y lo deja en auditoría', async () => {
      const { body } = await comoAdministrador(api().post('/api/roles'))
        .send({
          nombre: `Coordinación de prácticas ${sufijo}`,
          descripcion: 'Rol de prueba',
          permisos: [
            { modulo: 'proyectos', permiso: 'leer' },
            { modulo: 'reportes', permiso: 'generar' },
          ],
        })
        .expect(201);
      idRol = body.id;
      idsRolesDePrueba.push(idRol);
      expect(body).toMatchObject({
        activo: true,
        sistema: false,
        usuariosActivos: 0,
        permisos: [
          { modulo: 'proyectos', permiso: 'leer' },
          { modulo: 'reportes', permiso: 'generar' },
        ],
      });

      const auditoria = await prisma.auditoria.findFirst({
        where: { tabla_afectada: 'rol', id_registro: idRol, accion: 'crear' },
      });
      expect(auditoria?.id_usuario).toBe(idsUsuarios[0]);
      expect(auditoria?.valor_nuevo).toMatchObject({
        permisos: ['proyectos.leer', 'reportes.generar'],
      });
    });

    it('no admite dos roles con el mismo nombre, sin importar mayúsculas', async () => {
      const { body } = await comoAdministrador(api().post('/api/roles'))
        .send({
          nombre: `COORDINACIÓN DE PRÁCTICAS ${sufijo}`,
          permisos: [{ modulo: 'proyectos', permiso: 'leer' }],
        })
        .expect(409);
      expect(body.mensaje).toBe(MENSAJE_NOMBRE_REPETIDO);
    });

    it('edita el nombre de un rol propio y audita solo lo que cambió', async () => {
      await comoAdministrador(api().patch(`/api/roles/${idRol}`))
        .send({ nombre: `Prácticas ${sufijo}`, descripcion: 'Rol de prueba' })
        .expect(200);

      const auditoria = await prisma.auditoria.findFirst({
        where: {
          tabla_afectada: 'rol',
          id_registro: idRol,
          accion: 'actualizar',
        },
      });
      expect(auditoria?.valor_anterior).toEqual({
        nombre: `Coordinación de prácticas ${sufijo}`,
      });
      expect(auditoria?.valor_nuevo).toEqual({ nombre: `Prácticas ${sufijo}` });
    });

    it('no renombra un rol del sistema, pero sí edita su descripción', async () => {
      const { body } = await comoAdministrador(
        api().patch(`/api/roles/${idRolAdministrador}`),
      )
        .send({ nombre: 'Superusuario' })
        .expect(409);
      expect(body.mensaje).toBe(MENSAJE_ROL_SISTEMA_NOMBRE);

      await comoAdministrador(api().patch(`/api/roles/${idRolAdministrador}`))
        .send({ descripcion: `Descripción de prueba ${sufijo}` })
        .expect(200);
    });

    it('no inactiva un rol con usuarios activos (RF-03, p3), y sí cuando ya no tiene', async () => {
      const usuario = await prisma.usuario.create({
        data: {
          nombres: 'Usuario',
          apellidos: 'Con rol E2E',
          email: `e2e.roles.conrol.${sufijo}@prueba.urap.local`,
          activo: true,
        },
      });
      idsUsuarios.push(usuario.id);
      const asignacion = await prisma.usuario_rol.create({
        data: { id_usuario: usuario.id, id_rol: idRol, activo: true },
      });

      const { body } = await comoAdministrador(
        api().delete(`/api/roles/${idRol}`),
      ).expect(409);
      expect(body.mensaje).toBe(MENSAJE_ROL_CON_USUARIOS);

      await prisma.usuario_rol.update({
        where: { id: asignacion.id },
        data: { activo: false, fecha_revocacion: new Date() },
      });
      const inactivo = await comoAdministrador(
        api().delete(`/api/roles/${idRol}`),
      ).expect(200);
      expect(inactivo.body.activo).toBe(false);
      // El rol se conserva (borrado lógico): sigue en la base, inactivo.
      await expect(
        prisma.rol.findUnique({ where: { id: idRol } }),
      ).resolves.toMatchObject({
        activo: false,
      });
    });

    it('no inactiva un rol del sistema', async () => {
      const { body } = await comoAdministrador(
        api().delete(`/api/roles/${idRolAdministrador}`),
      ).expect(409);
      expect(body.mensaje).toBe(MENSAJE_ROL_SISTEMA_INACTIVAR);
    });

    it('responde 404 con un rol que no existe', async () => {
      await comoAdministrador(api().get('/api/roles/999999999')).expect(404);
    });
  });

  describe('HU-02-06 · matriz de permisos', () => {
    let idRol: number;

    beforeAll(async () => {
      const { body } = await comoAdministrador(api().post('/api/roles'))
        .send({
          nombre: `Rol matriz ${sufijo}`,
          permisos: [
            { modulo: 'proyectos', permiso: 'leer' },
            { modulo: 'proyectos', permiso: 'crear' },
          ],
        })
        .expect(201);
      idRol = body.id;
      idsRolesDePrueba.push(idRol);
    });

    it('presenta los módulos, los siete permisos y los roles con los suyos', async () => {
      const { body } = await comoAdministrador(
        api().get('/api/roles/matriz'),
      ).expect(200);
      expect(
        body.modulos.map(({ codigo }: { codigo: string }) => codigo),
      ).toEqual(expect.arrayContaining(MODULOS.map(({ codigo }) => codigo)));
      expect(
        body.permisos.map(({ codigo }: { codigo: string }) => codigo).sort(),
      ).toEqual(PERMISOS.map(({ codigo }) => codigo).sort());
      expect(body.roles).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: idRol })]),
      );
    });

    it('guarda la configuración y audita solo los permisos agregados y retirados', async () => {
      const { body } = await comoAdministrador(
        api().put(`/api/roles/${idRol}/permisos`),
      )
        .send({
          permisos: [
            { modulo: 'proyectos', permiso: 'leer' },
            { modulo: 'plan_curso', permiso: 'aprobar' },
          ],
        })
        .expect(200);
      expect(body.permisos).toEqual([
        { modulo: 'proyectos', permiso: 'leer' },
        { modulo: 'plan_curso', permiso: 'aprobar' },
      ]);

      const auditoria = await prisma.auditoria.findFirst({
        where: {
          tabla_afectada: 'rol',
          id_registro: idRol,
          accion: 'actualizar',
        },
        orderBy: { id: 'desc' },
      });
      expect(auditoria?.valor_anterior).toEqual({
        retirados: ['proyectos.crear'],
      });
      expect(auditoria?.valor_nuevo).toEqual({
        agregados: ['plan_curso.aprobar'],
      });
    });

    it('no deja un rol sin permiso de lectura', async () => {
      const { body } = await comoAdministrador(
        api().put(`/api/roles/${idRol}/permisos`),
      )
        .send({ permisos: [{ modulo: 'reportes', permiso: 'generar' }] })
        .expect(400);
      expect(body.mensaje).toBe(MENSAJE_SIN_LECTURA);
    });

    it('rechaza permisos repetidos', async () => {
      await comoAdministrador(api().put(`/api/roles/${idRol}/permisos`))
        .send({
          permisos: [
            { modulo: 'proyectos', permiso: 'leer' },
            { modulo: 'proyectos', permiso: 'leer' },
          ],
        })
        .expect(400);
    });
  });
});
