import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { MENSAJE_SIN_PERMISO } from '../src/auth/roles.guard.js';
import { ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { borrarUsuariosDePrueba } from './utilidades/limpieza.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

/**
 * HU-01-03 (RF-01 y RF-03): la autorización sale de la matriz de permisos, como la unión de
 * los roles del usuario, y se comprueba en cada petición. Datos ficticios.
 */
describe('Opciones autorizadas por la matriz de permisos (e2e) · HU-01-03', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-de-prueba-2026';
  const matriz = matrizDePrueba();
  const rolesCreados: number[] = [];
  const idsUsuarios: number[] = [];
  let idRolPropio: number;
  let tokenDosRoles: string;
  let tokenRolPropio: string;

  const api = () => request(app.getHttpServer());
  const con = (token: string) => ({
    get: (ruta: string) =>
      api().get(`/api${ruta}`).set('Authorization', `Bearer ${token}`),
    post: (ruta: string) =>
      api().post(`/api${ruta}`).set('Authorization', `Bearer ${token}`),
  });

  async function rolDelSistema(nombre: (typeof ROL)[keyof typeof ROL]) {
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

  async function permisosPorCodigo(
    pares: [string, string][],
  ): Promise<{ id_modulo: number; id_permiso: number }[]> {
    const filas = [];
    for (const [modulo, permiso] of pares) {
      const m = await prisma.modulo.findUnique({ where: { codigo: modulo } });
      const p = await prisma.permiso.findUnique({ where: { codigo: permiso } });
      filas.push({ id_modulo: m!.id, id_permiso: p!.id });
    }
    return filas;
  }

  async function crearUsuario(nombre: string, idsRol: number[]) {
    const correo = `e2e.permisos.${nombre}.${sufijo}@prueba.urap.local`;
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
    for (const idRol of idsRol) {
      await prisma.usuario_rol.create({
        data: { id_usuario: usuario.id, id_rol: idRol, activo: true },
      });
    }
    const { body } = await api()
      .post('/api/auth/iniciar-sesion')
      .send({ correo, contrasena })
      .expect(200);
    return body as { token: string; usuario: { permisos: string[] } };
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

    const docente = await rolDelSistema(ROL.docente);
    const departamento = await rolDelSistema(ROL.departamento);
    tokenDosRoles = (await crearUsuario('dos-roles', [docente, departamento]))
      .token;

    // Un rol creado por el administrador (HU-02-05), con un nombre que no es del sistema.
    idRolPropio = (
      await prisma.rol.create({
        data: { nombre: `Rol propio e2e ${sufijo}`, activo: true },
      })
    ).id;
    rolesCreados.push(idRolPropio);
    await prisma.rol_permiso.createMany({
      data: (await permisosPorCodigo([['proyectos', 'leer']])).map((fila) => ({
        ...fila,
        id_rol: idRolPropio,
      })),
    });
    tokenRolPropio = (await crearUsuario('rol-propio', [idRolPropio])).token;
    // Arrancar la API, cargar la matriz y crear dos usuarios con su hash tarda unos 9 s: con
    // el equipo cargado pasaba del límite por defecto de 10 s.
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await borrarUsuariosDePrueba(prisma, idsUsuarios);
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol_permiso.deleteMany({
        where: { id_rol: { in: rolesCreados } },
      });
      await prisma.rol.deleteMany({ where: { id: { in: rolesCreados } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
  });

  it('la sesión trae la unión de los permisos de los dos roles del usuario', async () => {
    const { body } = await con(tokenDosRoles).get('/auth/sesion').expect(200);

    // Del Docente (E propios) y del Departamento (R/A/C), sin repetir `proyectos.leer`.
    expect(body.permisos).toEqual(
      expect.arrayContaining([
        'proyectos.actualizar',
        'proyectos.crear',
        'proyectos.aprobar',
        'proyectos.leer',
        'usuarios.leer',
      ]),
    );
    expect(
      body.permisos.filter((p: string) => p === 'proyectos.leer'),
    ).toHaveLength(1);
    expect(body.permisos).not.toContain('usuarios.administrar');
  });

  it('con dos roles, abre lo que permite cualquiera de los dos', async () => {
    // `proyectos.crear` viene del Departamento: el Docente solo no lo tiene (Tabla 11, fila corregida).
    await con(tokenDosRoles)
      .get('/proyectos-docentes/asistente/programas')
      .expect(200);
  });

  it('niega con 403 lo que ningún rol permite, aunque el frontend no muestre la opción', async () => {
    const { body } = await con(tokenDosRoles).get('/roles').expect(403);
    expect(body.mensaje).toBe(MENSAJE_SIN_PERMISO);
  });

  it('decide por el permiso, no por el nombre del rol: un rol propio con `proyectos.leer` consulta la bandeja', async () => {
    await con(tokenRolPropio).get('/proyectos-docentes').expect(200);
    await con(tokenRolPropio).post('/proyectos-docentes').expect(403);
  });

  it('un cambio en la matriz rige desde la siguiente petición, con el mismo token (RF-03, q1)', async () => {
    await con(tokenRolPropio).get('/proyectos-docentes').expect(200);

    await prisma.rol_permiso.deleteMany({ where: { id_rol: idRolPropio } });

    await con(tokenRolPropio).get('/proyectos-docentes').expect(403);
    const { body } = await con(tokenRolPropio).get('/auth/sesion').expect(200);
    expect(body.permisos).toEqual([]);
  });
});
