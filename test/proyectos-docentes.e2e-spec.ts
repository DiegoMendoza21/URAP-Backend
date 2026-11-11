import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { NOTIFICACION } from '../src/notificaciones/notificaciones.service.js';
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
// propios datos ficticios (dos programas, asignaturas, RAP y usuarios) y los borra al terminar.
// Funciona con o sin el seed: usa los catálogos y el período vigente si existen y, si no, los crea.
describe('Proyectos docentes (e2e) · RF-08, HU-05-01 a HU-05-03', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const matriz = matrizDePrueba();
  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    periodos: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    asignaturas: [] as number[],
    raps: [] as number[],
    usuarios: [] as number[],
    proyectos: [] as number[],
    tiposNotificacion: [] as number[],
  };
  const tokens: Record<string, string> = {};
  let programaA: number;
  let programaB: number;
  let asignaturaCompleta: number;
  let asignaturaIncompleta: number;
  let asignaturaOtroPrograma: number;
  let rapA1: number;
  let rapA2: number;
  let rapB: number;
  const usuarios: Record<string, number> = {};

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => ({
    get: (ruta: string) =>
      http().get(`/api${ruta}`).set('Authorization', `Bearer ${tokens[quien]}`),
    post: (ruta: string, cuerpo: object) =>
      http()
        .post(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`)
        .send(cuerpo),
  });

  /** El rol del sistema con sus permisos de la Tabla 11: la autorización los exige (HU-01-03). */
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

  async function crearUsuario(
    clave: string,
    nombreRol: string,
    idPrograma: number | null,
  ): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.${clave}.${sufijo}@prueba.urap.local`,
        password_hash: hash,
        activo: true,
      },
    });
    creados.usuarios.push(usuario.id);
    usuarios[clave] = usuario.id;
    await prisma.usuario_rol.create({
      data: {
        id_usuario: usuario.id,
        id_rol: await rolPorNombre(nombreRol),
        id_programa: idPrograma,
        activo: true,
      },
    });
    const inicio = await http()
      .post('/api/auth/iniciar-sesion')
      .send({ correo: usuario.email, contrasena })
      .expect(200);
    tokens[clave] = (inicio.body as { token: string }).token;
  }

  async function crearAsignatura(
    idPrograma: number,
    codigo: string,
    datos: Record<string, number | null>,
  ): Promise<number> {
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, idPrograma),
        codigo_interno: `${codigo}-${sufijo}`,
        nombre: `Asignatura ${codigo}`,
        semestre: 3,
        componente: 'BASICO',
        tipo_curso: 'Obligatorio',
        ...datos,
      },
    });
    creados.asignaturas.push(asignatura.id);
    return asignatura.id;
  }

  async function crearRap(idPrograma: number, numero: number): Promise<number> {
    const rap = await prisma.rap.create({
      data: {
        id_programa: idPrograma,
        numero,
        codigo: `RAP ${numero}`,
        descripcion: `RAP ficticio ${numero}`,
      },
    });
    creados.raps.push(rap.id);
    return rap.id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);
    // HU-13-01: sin el tipo sembrado, la creación no deja el aviso (base vacía de la CI).
    const tipoAsignacion = await prisma.tipo_notificacion.findUnique({
      where: { codigo: NOTIFICACION.asignacionProyecto },
    });
    if (!tipoAsignacion) {
      const creado = await prisma.tipo_notificacion.create({
        data: {
          codigo: NOTIFICACION.asignacionProyecto,
          nombre: NOTIFICACION.asignacionProyecto,
          activo: true,
        },
      });
      creados.tiposNotificacion.push(creado.id);
    }
    await asegurarCatalogoDePermisos(prisma, matriz);
    hash = await app.get(ContrasenasService).hashear(contrasena);

    if (
      !(await prisma.estado_proyecto.findUnique({
        where: { codigo: 'en_diligenciamiento' },
      }))
    ) {
      const estado = await prisma.estado_proyecto.create({
        data: { codigo: 'en_diligenciamiento', nombre: 'En diligenciamiento' },
      });
      creados.estados.push(estado.id);
    }
    if (
      !(await prisma.periodo_academico.findFirst({
        where: { activo: true, cerrado: false },
      }))
    ) {
      const periodo = await prisma.periodo_academico.create({
        data: {
          codigo: `E2E-${sufijo}`,
          fecha_inicio: new Date('2026-08-03'),
          fecha_fin: new Date('2026-11-21'),
          numero_semanas: 16,
          activo: true,
          cerrado: false,
        },
      });
      creados.periodos.push(periodo.id);
    }

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    for (const letra of ['A', 'B']) {
      const programa = await prisma.programa.create({
        data: {
          id_facultad: facultad.id,
          nombre: `Programa E2E ${letra} ${sufijo}`,
        },
      });
      creados.programas.push(programa.id);
    }
    [programaA, programaB] = creados.programas;

    asignaturaIncompleta = await crearAsignatura(programaA, 'INC', {
      creditos: null,
      horas_tde: null,
      horas_tdp: null,
      horas_ti: null,
    });
    asignaturaCompleta = await crearAsignatura(programaA, 'COM', {
      creditos: 2,
      horas_tde: 32,
      horas_tdp: 0,
      horas_ti: 64,
      horas_totales: 96,
    });
    asignaturaOtroPrograma = await crearAsignatura(programaB, 'OTR', {
      creditos: 2,
      horas_tde: 32,
      horas_tdp: 0,
      horas_ti: 64,
    });
    await prisma.asignatura_requisito.create({
      data: {
        id_asignatura: asignaturaCompleta,
        id_asignatura_requerida: asignaturaIncompleta,
        tipo: 'prerrequisito',
      },
    });
    rapA1 = await crearRap(programaA, 1);
    rapA2 = await crearRap(programaA, 2);
    rapB = await crearRap(programaB, 1);
    await prisma.asignatura_rap.create({
      data: { id_asignatura: asignaturaCompleta, id_rap: rapA1 },
    });

    await crearUsuario('departamento', ROL.departamento, programaA);
    await crearUsuario('docente1', ROL.docente, programaA);
    await crearUsuario('docente2', ROL.docente, programaA);
    await crearUsuario('docente3', ROL.docente, programaA);
    await crearUsuario('docente4', ROL.docente, programaA);
    await crearUsuario('docenteOtro', ROL.docente, programaB);
    await crearUsuario('estudiante', ROL.estudiante, programaA);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      const proyectos = await prisma.proyecto_docente.findMany({
        where: { id_asignatura: { in: creados.asignaturas } },
        select: { id: true },
      });
      const idsProyectos = proyectos.map((proyecto) => proyecto.id);
      await prisma.auditoria.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            {
              tabla_afectada: 'proyecto_docente',
              id_registro: { in: idsProyectos },
            },
          ],
        },
      });
      await prisma.notificacion.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            { entidad: 'proyecto_docente', id_entidad: { in: idsProyectos } },
          ],
        },
      });
      await prisma.tipo_notificacion.deleteMany({
        where: { id: { in: creados.tiposNotificacion } },
      });
      const deProyectos = { id_proyecto_docente: { in: idsProyectos } };
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: idsProyectos } },
      });
      await prisma.asignatura_rap.deleteMany({
        where: { id_asignatura: { in: creados.asignaturas } },
      });
      await prisma.asignatura_requisito.deleteMany({
        where: { id_asignatura: { in: creados.asignaturas } },
      });
      await prisma.asignatura.deleteMany({
        where: { id: { in: creados.asignaturas } },
      });
      await prisma.rap.deleteMany({ where: { id: { in: creados.raps } } });
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
      await prisma.periodo_academico.deleteMany({
        where: { id: { in: creados.periodos } },
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

  const proyectoValido = () => ({
    idAsignatura: asignaturaCompleta,
    idsRap: [rapA1, rapA2],
    docentes: [
      { idUsuario: usuarios.docente2, responsable: false },
      { idUsuario: usuarios.docente1, responsable: true },
    ],
  });

  describe('asistente', () => {
    it('exige sesión', async () => {
      await http()
        .get('/api/proyectos-docentes/asistente/programas')
        .expect(401);
    });

    it('solo atiende al Departamento académico', async () => {
      await como('docente1')
        .get('/proyectos-docentes/asistente/programas')
        .expect(403);
    });

    it('paso 1: ofrece solo los programas donde el usuario es Departamento', async () => {
      const respuesta = await como('departamento')
        .get('/proyectos-docentes/asistente/programas')
        .expect(200);
      const ids = (respuesta.body as { id: number }[]).map(
        (programa) => programa.id,
      );
      expect(ids).toContain(programaA);
      expect(ids).not.toContain(programaB);
    });

    it('paso 2: lista las asignaturas del programa y niega las de otro', async () => {
      const respuesta = await como('departamento')
        .get(`/proyectos-docentes/asistente/programas/${programaA}/asignaturas`)
        .expect(200);
      expect((respuesta.body as { id: number }[]).map((a) => a.id)).toEqual(
        expect.arrayContaining([asignaturaCompleta, asignaturaIncompleta]),
      );
      await como('departamento')
        .get(`/proyectos-docentes/asistente/programas/${programaB}/asignaturas`)
        .expect(403);
    });

    it('autocompleta la información institucional y propone los RAP del mapeo (p5)', async () => {
      const respuesta = await como('departamento')
        .get(`/proyectos-docentes/asistente/asignaturas/${asignaturaCompleta}`)
        .expect(200);

      expect(respuesta.body).toMatchObject({
        informacion: {
          facultad: `Facultad E2E ${sufijo}`,
          programa: `Programa E2E A ${sufijo}`,
          codigo: `COM-${sufijo}`,
          componente: 'BASICO',
          tipoCurso: 'Obligatorio',
          creditos: 2,
          horasTde: 32,
          horasTdp: 0,
          horasTi: 64,
          prerrequisitos: [{ id: asignaturaIncompleta }],
          correquisitos: [],
          informacionIncompleta: false,
          camposFaltantes: [],
        },
        periodo: { id: expect.any(Number), codigo: expect.any(String) },
        raps: [
          { id: rapA1, mapeado: true },
          { id: rapA2, mapeado: false },
        ],
      });
    });

    it('marca la información incompleta cuando faltan créditos u horas (p7)', async () => {
      const respuesta = await como('departamento')
        .get(
          `/proyectos-docentes/asistente/asignaturas/${asignaturaIncompleta}`,
        )
        .expect(200);
      expect(respuesta.body).toMatchObject({
        informacion: {
          informacionIncompleta: true,
          camposFaltantes: ['créditos', 'horas TDE', 'horas TDP', 'horas TI'],
        },
      });
    });

    it('ofrece como docentes solo a los del programa', async () => {
      const respuesta = await como('departamento')
        .get(`/proyectos-docentes/asistente/programas/${programaA}/docentes`)
        .expect(200);
      const ids = (respuesta.body as { id: number }[]).map(
        (docente) => docente.id,
      );
      expect(ids).toEqual(
        expect.arrayContaining([usuarios.docente1, usuarios.docente2]),
      );
      expect(ids).not.toContain(usuarios.docenteOtro);
      expect(ids).not.toContain(usuarios.departamento);
    });
  });

  describe('creación', () => {
    it('no permite continuar sin al menos un RAP (p4)', async () => {
      const respuesta = await como('departamento')
        .post('/proyectos-docentes', { ...proyectoValido(), idsRap: [] })
        .expect(400);
      expect(respuesta.body).toMatchObject({
        detalles: ['Seleccione al menos un RAP.'],
      });
    });

    it('rechaza RAP de otro programa', async () => {
      await como('departamento')
        .post('/proyectos-docentes', {
          ...proyectoValido(),
          idsRap: [rapA1, rapB],
        })
        .expect(400);
    });

    it('admite como máximo tres docentes, con un único responsable', async () => {
      const cuatro = ['docente1', 'docente2', 'docente3', 'docente4'].map(
        (clave, indice) => ({
          idUsuario: usuarios[clave],
          responsable: indice === 0,
        }),
      );
      await como('departamento')
        .post('/proyectos-docentes', { ...proyectoValido(), docentes: cuatro })
        .expect(400);
      await como('departamento')
        .post('/proyectos-docentes', {
          ...proyectoValido(),
          docentes: [{ idUsuario: usuarios.docente1, responsable: false }],
        })
        .expect(400);
    });

    it('rechaza docentes de otro programa', async () => {
      await como('departamento')
        .post('/proyectos-docentes', {
          ...proyectoValido(),
          docentes: [{ idUsuario: usuarios.docenteOtro, responsable: true }],
        })
        .expect(400);
    });

    it('no deja crear al Docente ni en un programa ajeno', async () => {
      await como('docente1')
        .post('/proyectos-docentes', proyectoValido())
        .expect(403);
      await como('departamento')
        .post('/proyectos-docentes', {
          idAsignatura: asignaturaOtroPrograma,
          idsRap: [rapB],
          docentes: [{ idUsuario: usuarios.docenteOtro, responsable: true }],
        })
        .expect(403);
    });

    it('crea el proyecto en diligenciamiento con sus RAP y docentes, y lo audita (p7)', async () => {
      const inicio = Date.now();
      const respuesta = await como('departamento')
        .post('/proyectos-docentes', proyectoValido())
        .expect(201);
      // q2: la creación completa en menos de 5 segundos.
      expect(Date.now() - inicio).toBeLessThan(5000);

      const proyecto = respuesta.body as {
        id: number;
        raps: { id: number }[];
        docentes: { id: number; responsable: boolean }[];
      };
      creados.proyectos.push(proyecto.id);
      expect(respuesta.body).toMatchObject({
        idAsignatura: asignaturaCompleta,
        grupo: null,
        origen: 'manual',
        estado: { codigo: 'en_diligenciamiento' },
        informacionIncompleta: false,
        docentes: [
          { id: usuarios.docente1, responsable: true },
          { id: usuarios.docente2, responsable: false },
        ],
      });
      expect(proyecto.raps.map((rap) => rap.id)).toEqual([rapA1, rapA2]);
      await expect(
        prisma.auditoria.count({
          where: {
            accion: 'crear',
            tabla_afectada: 'proyecto_docente',
            id_registro: proyecto.id,
            id_usuario: usuarios.departamento,
            // RF-29: la IP sale sola del contexto de la petición.
            ip: { not: null },
          },
        }),
      ).resolves.toBe(1);

      // HU-13-01: cada docente asignado recibe el aviso, con el enlace al proyecto.
      const avisos = await prisma.notificacion.findMany({
        where: {
          entidad: 'proyecto_docente',
          id_entidad: proyecto.id,
          tipo_notificacion: { codigo: NOTIFICACION.asignacionProyecto },
        },
        select: { id_usuario: true, url_destino: true, leida: true },
        orderBy: { id_usuario: 'asc' },
      });
      expect(avisos).toEqual(
        [usuarios.docente1, usuarios.docente2]
          .sort((a, b) => a - b)
          .map((idUsuario) => ({
            id_usuario: idUsuario,
            url_destino: `/proyectos-docentes/${proyecto.id}`,
            leida: false,
          })),
      );
    });

    it('advierte si ya existe el curso y permite consultarlo antes de crear (p6)', async () => {
      const respuesta = await como('departamento')
        .post('/proyectos-docentes', proyectoValido())
        .expect(409);
      expect((respuesta.body as { mensaje: string }).mensaje).toContain(
        'Ya existe un proyecto docente',
      );

      const existente = await como('departamento')
        .get(
          `/proyectos-docentes/asistente/proyecto-existente?idAsignatura=${asignaturaCompleta}`,
        )
        .expect(200);
      expect(existente.body).toMatchObject({
        proyecto: { id: creados.proyectos[0] },
      });

      const otroGrupo = await como('departamento')
        .get(
          `/proyectos-docentes/asistente/proyecto-existente?idAsignatura=${asignaturaCompleta}&grupo=B`,
        )
        .expect(200);
      expect(otroGrupo.body).toEqual({ proyecto: null });
    });

    it('permite el mismo curso en otro grupo', async () => {
      const respuesta = await como('departamento')
        .post('/proyectos-docentes', {
          ...proyectoValido(),
          grupo: 'B',
          docentes: [{ idUsuario: usuarios.docente3, responsable: true }],
        })
        .expect(201);
      creados.proyectos.push((respuesta.body as { id: number }).id);
      expect(respuesta.body).toMatchObject({ grupo: 'B' });
    });

    it('crea igual si la asignatura no tiene créditos ni horas, marcado como incompleto (p7)', async () => {
      const respuesta = await como('departamento')
        .post('/proyectos-docentes', {
          idAsignatura: asignaturaIncompleta,
          idsRap: [rapA2],
          docentes: [{ idUsuario: usuarios.docente2, responsable: true }],
        })
        .expect(201);
      creados.proyectos.push((respuesta.body as { id: number }).id);
      expect(respuesta.body).toMatchObject({
        informacionIncompleta: true,
        informacion: {
          camposFaltantes: ['créditos', 'horas TDE', 'horas TDP', 'horas TI'],
        },
      });
    });
    it('ante creaciones simultáneas del mismo curso sin grupo, crea solo una (p6)', async () => {
      // Un doble clic en «Crear»: sin bloqueo, en REPEATABLE READ todas leían «no existe».
      const asignatura = await crearAsignatura(programaA, 'SIM', {
        creditos: 2,
        horas_tde: 32,
        horas_tdp: 0,
        horas_ti: 64,
      });
      const datos = {
        idAsignatura: asignatura,
        idsRap: [rapA1],
        docentes: [{ idUsuario: usuarios.docente1, responsable: true }],
      };

      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () =>
          como('departamento').post('/proyectos-docentes', datos),
        ),
      );

      const estados = respuestas.map((respuesta) => respuesta.status).sort();
      expect(estados).toEqual([201, 409, 409, 409, 409]);
      await expect(
        prisma.proyecto_docente.count({ where: { id_asignatura: asignatura } }),
      ).resolves.toBe(1);
    });
  });

  describe('bandeja', () => {
    const idsVisibles = async (quien: string) => {
      const respuesta = await como(quien)
        .get('/proyectos-docentes?tamano=100')
        .expect(200);
      return (respuesta.body as { elementos: { id: number }[] }).elementos.map(
        (proyecto) => proyecto.id,
      );
    };

    it('el proyecto aparece en la bandeja de todos los docentes asignados (HU-05-03)', async () => {
      const [primero, grupoB, incompleto] = creados.proyectos;
      expect(await idsVisibles('docente1')).toEqual(
        expect.arrayContaining([primero]),
      );
      expect(await idsVisibles('docente2')).toEqual(
        expect.arrayContaining([primero, incompleto]),
      );
      const delDocente1 = await idsVisibles('docente1');
      expect(delDocente1).not.toContain(grupoB);
      expect(delDocente1).not.toContain(incompleto);
    });

    it('el Departamento ve los de su programa', async () => {
      expect(await idsVisibles('departamento')).toEqual(
        expect.arrayContaining(creados.proyectos),
      );
    });

    it('un docente no asignado no los ve ni puede abrirlos', async () => {
      const visibles = await idsVisibles('docenteOtro');
      for (const id of creados.proyectos) {
        expect(visibles).not.toContain(id);
      }
      await como('docenteOtro')
        .get(`/proyectos-docentes/${creados.proyectos[0]}`)
        .expect(404);
    });

    it('el docente asignado abre la ficha de su proyecto', async () => {
      const respuesta = await como('docente1')
        .get(`/proyectos-docentes/${creados.proyectos[0]}`)
        .expect(200);
      expect(respuesta.body).toMatchObject({
        id: creados.proyectos[0],
        informacion: { codigo: `COM-${sufijo}` },
      });
    });

    it('el Estudiante entra a la bandeja pero no ve proyectos: solo verá los publicados (RF-27)', async () => {
      // Tabla 11: el Estudiante tiene «C publicados» en proyectos docentes (HU-01-03). La
      // publicación todavía no existe, así que el alcance del servicio no le muestra ninguno.
      const { body } = await como('estudiante')
        .get('/proyectos-docentes')
        .expect(200);
      expect(body).toMatchObject({ total: 0, elementos: [] });
    });

    it('el Estudiante no abre la ficha de un proyecto (404, sin revelar que existe)', async () => {
      await como('estudiante')
        .get(`/proyectos-docentes/${creados.proyectos[0]}`)
        .expect(404);
    });

    it('valida la paginación', async () => {
      await como('departamento')
        .get('/proyectos-docentes?tamano=1000')
        .expect(400);
    });
  });
});
