import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { MENSAJE_SOLO_DOCENTES_ASIGNADOS } from '../src/proyectos-docentes/edicion-proyecto.service.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';
import {
  borrarPlanesDePrueba,
  planDePrueba,
} from './utilidades/plan-estudio.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios (un programa, una asignatura, tres RAP, usuarios y proyectos) y los
// borra al terminar. Funciona con o sin el seed: usa los estados del catálogo si existen y,
// si no, los crea.
describe('Diligenciamiento del proyecto docente (e2e) · RF-11, RF-12, HU-06-01 a 03 y 08', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const matriz = matrizDePrueba();
  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    asignaturas: [] as number[],
    raps: [] as number[],
    usuarios: [] as number[],
    proyectos: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  const estados: Record<string, number> = {};
  let rap1: number;
  let rap2: number;
  let rap3: number;
  let rapAjeno: number;
  let proyecto: number;
  let proyectoAprobado: number;

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => {
    const autorizar = (prueba: request.Test) =>
      prueba.set('Authorization', `Bearer ${tokens[quien]}`);
    return {
      get: (ruta: string) => autorizar(http().get(`/api${ruta}`)),
      post: (ruta: string, cuerpo: object) =>
        autorizar(http().post(`/api${ruta}`)).send(cuerpo),
      put: (ruta: string, cuerpo: object) =>
        autorizar(http().put(`/api${ruta}`)).send(cuerpo),
      delete: (ruta: string) => autorizar(http().delete(`/api${ruta}`)),
    };
  };

  /** El rol del sistema con sus permisos de la Tabla 17: la autorización los exige (HU-01-03). */
  async function rolPorNombre(nombre: string): Promise<number> {
    const existente = await prisma.rol.findUnique({ where: { nombre } });
    const id =
      existente?.id ??
      (await prisma.rol.create({ data: { nombre, activo: true } })).id;
    if (!existente) {
      creados.roles.push(id);
    }
    await asegurarPermisosDeRol(prisma, matriz, id, nombre as NombreRol);
    return id;
  }

  async function estado(
    codigo: string,
    nombre: string,
    permiteEdicion: boolean,
  ): Promise<number> {
    const existente = await prisma.estado_proyecto.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const creado = await prisma.estado_proyecto.create({
      data: { codigo, nombre, permite_edicion: permiteEdicion },
    });
    creados.estados.push(creado.id);
    return creado.id;
  }

  async function crearUsuario(
    clave: string,
    roles: string[],
    idPrograma: number,
  ): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.dil.${clave}.${sufijo}@prueba.urap.local`,
        password_hash: hash,
        activo: true,
      },
    });
    creados.usuarios.push(usuario.id);
    usuarios[clave] = usuario.id;
    for (const nombreRol of roles) {
      await prisma.usuario_rol.create({
        data: {
          id_usuario: usuario.id,
          id_rol: await rolPorNombre(nombreRol),
          id_programa: idPrograma,
          activo: true,
        },
      });
    }
    const inicio = await http()
      .post('/api/auth/iniciar-sesion')
      .send({ correo: usuario.email, contrasena })
      .expect(200);
    tokens[clave] = (inicio.body as { token: string }).token;
  }

  async function crearRap(idPrograma: number, numero: number) {
    const rap = await prisma.rap.create({
      data: {
        id_programa: idPrograma,
        numero,
        codigo: `RAP ${numero}`,
        descripcion: `Enunciado ficticio del RAP ${numero}`,
      },
    });
    creados.raps.push(rap.id);
    return rap.id;
  }

  async function crearProyecto(idEstado: number, grupo: string) {
    const creado = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: creados.asignaturas[0],
        id_estado: idEstado,
        grupo,
        origen: 'manual',
        fecha_creacion: new Date(),
        proyecto_docente_rap: {
          create: [rap1, rap2, rap3].map((id_rap) => ({ id_rap })),
        },
        proyecto_docente_docente: {
          create: [
            { id_usuario: usuarios.docente, responsable: true, orden: 1 },
            { id_usuario: usuarios.codocente, responsable: false, orden: 2 },
          ],
        },
      },
    });
    creados.proyectos.push(creado.id);
    return creado.id;
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
    hash = await app.get(ContrasenasService).hashear(contrasena);

    estados.diligenciamiento = await estado(
      'en_diligenciamiento',
      'En diligenciamiento',
      true,
    );
    estados.aprobado = await estado('aprobado', 'Aprobado', false);

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E dil ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const programa = await prisma.programa.create({
      data: { id_facultad: facultad.id, nombre: `Programa E2E dil ${sufijo}` },
    });
    creados.programas.push(programa.id);
    const otroPrograma = await prisma.programa.create({
      data: { id_facultad: facultad.id, nombre: `Otro E2E dil ${sufijo}` },
    });
    creados.programas.push(otroPrograma.id);
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, programa.id),
        codigo_interno: `DIL-${sufijo}`,
        nombre: 'Asignatura ficticia',
        semestre: 4,
      },
    });
    creados.asignaturas.push(asignatura.id);
    rap1 = await crearRap(programa.id, 1);
    rap2 = await crearRap(programa.id, 2);
    rap3 = await crearRap(programa.id, 3);
    rapAjeno = await crearRap(otroPrograma.id, 1);

    await crearUsuario('docente', [ROL.docente], programa.id);
    await crearUsuario('codocente', [ROL.docente], programa.id);
    await crearUsuario('docenteNoAsignado', [ROL.docente], programa.id);
    await crearUsuario('departamento', [ROL.departamento], programa.id);
    await crearUsuario('estudiante', [ROL.estudiante], programa.id);
    await crearUsuario('administrador', [ROL.administrador], programa.id);

    proyecto = await crearProyecto(estados.diligenciamiento, 'D1');
    proyectoAprobado = await crearProyecto(estados.aprobado, 'D2');
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      const racs = await prisma.rac.findMany({
        where: { id_proyecto_docente: { in: creados.proyectos } },
        select: { id: true },
      });
      const idsRac = racs.map((rac) => rac.id);
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.rac_rap.deleteMany({ where: { id_rac: { in: idsRac } } });
      await prisma.rac.deleteMany({ where: { id: { in: idsRac } } });
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: creados.proyectos } },
      });
      await prisma.rap.deleteMany({ where: { id: { in: creados.raps } } });
      await prisma.asignatura.deleteMany({
        where: { id: { in: creados.asignaturas } },
      });
      await prisma.sesion.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.usuario_rol.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.usuario.deleteMany({
        where: { id: { in: creados.usuarios } },
      });
      await borrarPlanesDePrueba(prisma, creados.programas);
      await prisma.programa.deleteMany({
        where: { id: { in: creados.programas } },
      });
      await prisma.facultad.deleteMany({
        where: { id: { in: creados.facultades } },
      });
      await prisma.estado_proyecto.deleteMany({
        where: { id: { in: creados.estados } },
      });
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
  });

  const rac = (codigo: string, idsRap: number[], contribucion?: string) => ({
    codigo,
    enunciado: `Enunciado ficticio de ${codigo}`,
    raps: idsRap.map((idRap) => ({
      idRap,
      descripcionContribucion: contribucion,
    })),
  });

  describe('acceso', () => {
    it('exige sesión', async () => {
      await http()
        .get(`/api/proyectos-docentes/${proyecto}/diligenciamiento`)
        .expect(401);
    });

    it('el Estudiante tiene «C publicados», pero no ve proyectos sin publicar (404)', async () => {
      await como('estudiante')
        .get(`/proyectos-docentes/${proyecto}/diligenciamiento`)
        .expect(404);
    });

    it('el Administrador consulta, pero no diligencia: no es docente asignado (HU-01-03)', async () => {
      await como('administrador')
        .get(`/proyectos-docentes/${proyecto}/descripcion`)
        .expect(200);
      const { body } = await como('administrador')
        .put(`/proyectos-docentes/${proyecto}/descripcion`, { texto: 'x' })
        .expect(403);
      expect(body).toMatchObject({ mensaje: MENSAJE_SOLO_DOCENTES_ASIGNADOS });
    });

    it('un docente no asignado no ve el proyecto (404) ni lo edita', async () => {
      await como('docenteNoAsignado')
        .get(`/proyectos-docentes/${proyecto}/descripcion`)
        .expect(404);
      await como('docenteNoAsignado')
        .put(`/proyectos-docentes/${proyecto}/descripcion`, { texto: 'x' })
        .expect(404);
    });

    it('el Departamento consulta, pero no diligencia', async () => {
      const resumen = await como('departamento')
        .get(`/proyectos-docentes/${proyecto}/diligenciamiento`)
        .expect(200);
      expect(resumen.body).toMatchObject({ puedeEditar: false });
      // HU-06-09: el proyecto recién creado tiene las seis secciones vacías.
      expect(
        (resumen.body.secciones as { estado: string }[]).map((s) => s.estado),
      ).toEqual(Array(6).fill('vacia'));
      expect(resumen.body.completitud).toEqual({
        completas: 0,
        total: 6,
        porcentaje: 0,
      });
      await como('departamento')
        .put(`/proyectos-docentes/${proyecto}/descripcion`, { texto: 'x' })
        .expect(403);
    });
  });

  describe('punto 2 · descripción (RF-11, HU-06-01)', () => {
    it('guarda el texto con sus saltos de línea y la fecha de modificación', async () => {
      const texto = 'Primer párrafo del curso.\n\nSegundo párrafo.';
      const guardado = await como('docente')
        .put(`/proyectos-docentes/${proyecto}/descripcion`, { texto })
        .expect(200);
      expect(guardado.body).toMatchObject({ texto });
      expect(guardado.body.fechaActualizacion).toEqual(expect.any(String));

      const leido = await como('docente')
        .get(`/proyectos-docentes/${proyecto}/descripcion`)
        .expect(200);
      expect(leido.body.texto).toBe(texto);

      const auditoria = await prisma.auditoria.findFirst({
        where: {
          id_usuario: usuarios.docente,
          tabla_afectada: 'proyecto_docente',
          id_registro: proyecto,
          accion: 'actualizar',
        },
      });
      expect(auditoria).not.toBeNull();
      // RF-29: con AuditoriaService la fila lleva la IP y solo el campo que cambió.
      expect(auditoria?.ip).toBeTruthy();
      expect(auditoria?.valor_nuevo).toEqual({ descripcion: texto });
    });

    it('cualquier docente asignado puede diligenciarlo, no solo el responsable', async () => {
      await como('codocente')
        .put(`/proyectos-docentes/${proyecto}/descripcion`, {
          texto: 'Ajuste del codocente.',
        })
        .expect(200);
    });

    it('p3: impide guardar un texto más largo que el máximo', async () => {
      const { body } = await como('docente')
        .get(`/proyectos-docentes/${proyecto}/descripcion`)
        .expect(200);
      const maximo = (body as { longitudMaxima: number }).longitudMaxima;
      const respuesta = await como('docente')
        .put(`/proyectos-docentes/${proyecto}/descripcion`, {
          texto: 'x'.repeat(maximo + 1),
        })
        .expect(400);
      expect(respuesta.body.mensaje ?? respuesta.body.message).toBeDefined();
      const leido = await como('docente')
        .get(`/proyectos-docentes/${proyecto}/descripcion`)
        .expect(200);
      expect(leido.body.texto).toBe('Ajuste del codocente.');
    });

    it('p4: en un proyecto aprobado no deja editar y sugiere la reapertura', async () => {
      const respuesta = await como('docente')
        .put(`/proyectos-docentes/${proyectoAprobado}/descripcion`, {
          texto: 'Cambio tardío',
        })
        .expect(409);
      expect(JSON.stringify(respuesta.body)).toMatch(/reapertura/);
      const resumen = await como('docente')
        .get(`/proyectos-docentes/${proyectoAprobado}/diligenciamiento`)
        .expect(200);
      expect(resumen.body).toMatchObject({ puedeEditar: false });
      expect(resumen.body.motivoNoEditable).toMatch(/reapertura/);
    });
  });

  describe('punto 3 · RAC por RAP (RF-12, HU-06-02 y HU-06-03)', () => {
    let idRac1: number;

    it('presenta los RAP del proyecto con su enunciado y todos sin RAC', async () => {
      const { body } = await como('docente')
        .get(`/proyectos-docentes/${proyecto}/rac`)
        .expect(200);
      expect(body.grupos.map((g: { rap: { id: number } }) => g.rap.id)).toEqual(
        [rap1, rap2, rap3],
      );
      expect(body.grupos[0].rap.descripcion).toBe(
        'Enunciado ficticio del RAP 1',
      );
      expect(body.rapsSinRac).toEqual([rap1, rap2, rap3]);
    });

    it('registra un RAC asociado a dos RAP, con su contribución (HU-06-03)', async () => {
      const { body } = await como('docente')
        .post(
          `/proyectos-docentes/${proyecto}/rac`,
          rac('RAC 1', [rap1, rap2], 'Aporta a los dos'),
        )
        .expect(201);
      expect(body.rapsSinRac).toEqual([rap3]);
      const enRap1 = body.grupos[0].racs[0];
      idRac1 = enRap1.id;
      expect(body.grupos[1].racs[0].id).toBe(idRac1);
      expect(enRap1.raps).toEqual([
        expect.objectContaining({
          idRap: rap1,
          descripcionContribucion: 'Aporta a los dos',
        }),
        expect.objectContaining({ idRap: rap2 }),
      ]);
      // La relación queda en rac_rap para los reportes de trazabilidad.
      expect(await prisma.rac_rap.count({ where: { id_rac: idRac1 } })).toBe(2);
    });

    it('p3: no guarda un RAC sin RAP', async () => {
      await como('docente')
        .post(`/proyectos-docentes/${proyecto}/rac`, rac('RAC 2', []))
        .expect(400);
    });

    it('evita asociar dos veces el mismo RAP', async () => {
      await como('docente')
        .post(`/proyectos-docentes/${proyecto}/rac`, rac('RAC 2', [rap1, rap1]))
        .expect(400);
    });

    it('no asocia RAP ajenos al proyecto', async () => {
      await como('docente')
        .post(`/proyectos-docentes/${proyecto}/rac`, rac('RAC 2', [rapAjeno]))
        .expect(400);
    });

    it('no repite el código del RAC en el proyecto, sin distinguir mayúsculas', async () => {
      await como('docente')
        .post(`/proyectos-docentes/${proyecto}/rac`, rac('rac 1', [rap3]))
        .expect(409);
    });

    it('edita el RAC y reemplaza sus RAP', async () => {
      const { body } = await como('codocente')
        .put(
          `/proyectos-docentes/${proyecto}/rac/${idRac1}`,
          rac('RAC 1', [rap3]),
        )
        .expect(200);
      expect(body.rapsSinRac).toEqual([rap1, rap2]);
    });

    it('el resumen indica qué RAP faltan (p5) y conserva lo guardado (HU-06-08)', async () => {
      const { body } = await como('docente')
        .get(`/proyectos-docentes/${proyecto}/diligenciamiento`)
        .expect(200);
      expect(body).toMatchObject({ puedeEditar: true });
      // Los puntos 4 a 7 se prueban en planeacion.e2e-spec.ts.
      // HU-06-09: el punto 3 tiene un RAC, pero le faltan RAP: queda incompleto, no vacío.
      // La cuenta de secciones completas es la de los estados que trae el mismo resumen.
      const completas = (body.secciones as { estado: string }[]).filter(
        ({ estado }) => estado === 'completa',
      ).length;
      expect(body.completitud).toEqual({
        completas,
        total: 6,
        porcentaje: Math.round((completas * 10_000) / 6) / 100,
      });
      expect({ secciones: body.secciones.slice(0, 2) }).toMatchObject({
        secciones: [
          { numero: 2, completa: true, estado: 'completa', pendientes: [] },
          {
            numero: 3,
            completa: false,
            estado: 'incompleta',
            pendientes: [
              'RAP 1 no tiene RAC asociados.',
              'RAP 2 no tiene RAC asociados.',
            ],
          },
        ],
      });
    });

    it('elimina un RAC', async () => {
      const { body } = await como('docente')
        .delete(`/proyectos-docentes/${proyecto}/rac/${idRac1}`)
        .expect(200);
      expect(body.rapsSinRac).toEqual([rap1, rap2, rap3]);
      expect(await prisma.rac.count({ where: { id: idRac1 } })).toBe(0);
    });

    it('responde 404 con un RAC de otro proyecto', async () => {
      await como('docente')
        .delete(`/proyectos-docentes/${proyecto}/rac/999999999`)
        .expect(404);
    });

    it('en un proyecto aprobado no registra RAC', async () => {
      await como('docente')
        .post(
          `/proyectos-docentes/${proyectoAprobado}/rac`,
          rac('RAC 1', [rap1]),
        )
        .expect(409);
    });
  });
});
