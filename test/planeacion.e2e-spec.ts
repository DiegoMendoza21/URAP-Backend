import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PARAMETRO } from '../src/common/parametros/parametros.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
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
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed: usa los estados
// del catálogo si existen y, si no, los crea.
describe('Planeación del curso (e2e) · RF-13 a RF-16, HU-06-04 a 07', () => {
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
    periodos: [] as number[],
    raps: [] as number[],
    usuarios: [] as number[],
    proyectos: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  const estados: Record<string, number> = {};
  const asignaturas: Record<string, number> = {};
  const periodos: Record<string, number> = {};
  let idPrograma: number;
  let rap1: number;
  let rap2: number;
  // Proyectos: el que se diligencia, uno aprobado, uno sin horas en la asignatura, uno con un
  // período sin semanas, uno anterior del mismo docente y uno de otro docente.
  const proyectos: Record<string, number> = {};

  // El catálogo del MEN (RF-13) para la prueba: «lluvia de ideas» está en los dos grupos y debe
  // salir solo en el primero. Al terminar, los parámetros vuelven a como estaban.
  const CATALOGO_DE_PRUEBA = {
    [PARAMETRO.catalogoEstrategiasEnsenanza]: 'Lluvia de ideas, Matriz C-Q-A',
    [PARAMETRO.catalogoEstrategiasAprendizaje]: 'Portafolio, lluvia de ideas',
  };
  const catalogoAnterior = new Map<
    string,
    {
      valor: string | null;
      tipo_dato: string | null;
      descripcion: string | null;
    } | null
  >();

  /** Escribe un parámetro del catálogo, o lo borra con `null`. */
  async function ponerParametro(clave: string, valor: string | null) {
    if (valor === null) {
      await prisma.parametro_sistema.deleteMany({ where: { clave } });
      return;
    }
    await prisma.parametro_sistema.upsert({
      where: { clave },
      create: { clave, valor, tipo_dato: 'lista' },
      update: { valor },
    });
  }

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

  async function crearUsuario(clave: string, roles: string[]): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.plan.${clave}.${sufijo}@prueba.urap.local`,
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

  async function crearPeriodo(
    clave: string,
    numeroSemanas: number | null,
    inicio: string,
  ) {
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `E2E-PLAN-${clave}-${sufijo}`,
        fecha_inicio: new Date(inicio),
        fecha_fin: new Date(inicio),
        numero_semanas: numeroSemanas,
        activo: true,
        cerrado: false,
      },
    });
    creados.periodos.push(periodo.id);
    periodos[clave] = periodo.id;
  }

  async function crearProyecto(
    clave: string,
    {
      asignatura = asignaturas.conHoras,
      periodo = periodos.actual,
      idEstado = estados.diligenciamiento,
      docentes = [usuarios.docente, usuarios.codocente],
    }: {
      asignatura?: number;
      periodo?: number;
      idEstado?: number;
      docentes?: number[];
    } = {},
  ) {
    const creado = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: asignatura,
        id_periodo: periodo,
        id_estado: idEstado,
        grupo: clave,
        origen: 'manual',
        fecha_creacion: new Date(),
        proyecto_docente_rap: {
          create: [rap1, rap2].map((id_rap) => ({ id_rap })),
        },
        proyecto_docente_docente: {
          create: docentes.map((id_usuario, indice) => ({
            id_usuario,
            responsable: indice === 0,
            orden: indice + 1,
          })),
        },
      },
    });
    creados.proyectos.push(creado.id);
    proyectos[clave] = creado.id;
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
      data: { nombre: `Facultad E2E plan ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const programa = await prisma.programa.create({
      data: { id_facultad: facultad.id, nombre: `Programa E2E plan ${sufijo}` },
    });
    creados.programas.push(programa.id);
    idPrograma = programa.id;

    // Las horas de una asignatura real de 2 créditos (datos institucionales, §4).
    const conHoras = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, programa.id),
        codigo_interno: `PLAN-H-${sufijo}`,
        nombre: 'Asignatura ficticia con horas',
        semestre: 8,
        creditos: 2,
        horas_tde: 32,
        horas_tdp: 0,
        horas_ti: 64,
        horas_totales: 96,
      },
    });
    const sinHoras = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, programa.id),
        codigo_interno: `PLAN-S-${sufijo}`,
        nombre: 'Asignatura ficticia sin horas',
        semestre: 1,
      },
    });
    creados.asignaturas.push(conHoras.id, sinHoras.id);
    asignaturas.conHoras = conHoras.id;
    asignaturas.sinHoras = sinHoras.id;

    for (const numero of [1, 2]) {
      const rap = await prisma.rap.create({
        data: {
          id_programa: programa.id,
          numero,
          codigo: `RAP ${numero}`,
          descripcion: `Enunciado ficticio del RAP ${numero}`,
        },
      });
      creados.raps.push(rap.id);
    }
    [rap1, rap2] = creados.raps;

    await crearPeriodo('actual', 16, '2026-08-03');
    await crearPeriodo('anterior', 16, '2026-02-02');
    await crearPeriodo('sinSemanas', null, '2026-08-03');

    await crearUsuario('docente', [ROL.docente]);
    await crearUsuario('codocente', [ROL.docente]);
    await crearUsuario('otroDocente', [ROL.docente]);
    await crearUsuario('departamento', [ROL.departamento]);
    await crearUsuario('estudiante', [ROL.estudiante]);

    await crearProyecto('P1');
    await crearProyecto('P2', { idEstado: estados.aprobado });
    await crearProyecto('P3', { asignatura: asignaturas.sinHoras });
    await crearProyecto('P4', { periodo: periodos.sinSemanas });
    await crearProyecto('ANT', { periodo: periodos.anterior });
    await crearProyecto('AJENO', { docentes: [usuarios.otroDocente] });

    // Datos previos: la bibliografía del proyecto anterior y lo que registró el otro docente.
    await prisma.bibliografia.createMany({
      data: ['Referencia ficticia A.', 'Referencia ficticia B.'].map(
        (referencia, indice) => ({
          id_proyecto_docente: proyectos.ANT,
          referencia,
          orden: indice + 1,
        }),
      ),
    });
    await prisma.bibliografia.create({
      data: {
        id_proyecto_docente: proyectos.AJENO,
        referencia: 'Referencia ajena.',
        orden: 1,
      },
    });
    // «Portafolio» también está en el catálogo del MEN: se sugiere ahí, no entre las del programa.
    await prisma.estrategia_metodologica.createMany({
      data: ['Estrategia ficticia del programa', 'Portafolio'].map(
        (descripcion, indice) => ({
          id_proyecto_docente: proyectos.AJENO,
          descripcion,
          orden: indice + 1,
        }),
      ),
    });

    for (const [clave, valor] of Object.entries(CATALOGO_DE_PRUEBA)) {
      catalogoAnterior.set(
        clave,
        await prisma.parametro_sistema.findUnique({
          where: { clave },
          select: { valor: true, tipo_dato: true, descripcion: true },
        }),
      );
      await ponerParametro(clave, valor);
    }
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      for (const [clave, anterior] of catalogoAnterior) {
        await (anterior === null
          ? ponerParametro(clave, null)
          : prisma.parametro_sistema.upsert({
              where: { clave },
              create: { clave, ...anterior },
              update: anterior,
            }));
      }
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      const racs = await prisma.rac.findMany({
        where: deProyectos,
        select: { id: true },
      });
      const idsRac = racs.map((rac) => rac.id);
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.evaluacion_rac.deleteMany({
        where: { id_rac: { in: idsRac } },
      });
      await prisma.rac_rap.deleteMany({ where: { id_rac: { in: idsRac } } });
      await prisma.rac.deleteMany({ where: { id: { in: idsRac } } });
      await prisma.estrategia_metodologica.deleteMany({ where: deProyectos });
      await prisma.contenido_programatico.deleteMany({ where: deProyectos });
      await prisma.bibliografia.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: creados.proyectos } },
      });
      await prisma.rap.deleteMany({ where: { id: { in: creados.raps } } });
      await prisma.asignatura.deleteMany({
        where: { id: { in: creados.asignaturas } },
      });
      await prisma.periodo_academico.deleteMany({
        where: { id: { in: creados.periodos } },
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

  const ruta = (clave: string, seccion: string) =>
    `/proyectos-docentes/${proyectos[clave]}/${seccion}`;

  async function resumen(clave = 'P1') {
    const { body } = await como('docente')
      .get(ruta(clave, 'diligenciamiento'))
      .expect(200);
    return body as {
      secciones: {
        numero: number;
        completa: boolean;
        pendientes: string[];
      }[];
    };
  }
  const seccion = async (numero: number, clave = 'P1') =>
    (await resumen(clave)).secciones.find((s) => s.numero === numero);

  describe('acceso', () => {
    it('el resumen trae los puntos 4 a 7 con la numeración del formato', async () => {
      const { secciones } = await resumen();
      expect(secciones.map((s) => s.numero)).toEqual([2, 3, 4, 5, 6, 7]);
    });

    it('el Departamento consulta las secciones, pero no las diligencia', async () => {
      for (const nombre of [
        'estrategias',
        'evaluacion',
        'contenidos',
        'bibliografia',
      ]) {
        await como('departamento').get(ruta('P1', nombre)).expect(200);
      }
      await como('departamento')
        .put(ruta('P1', 'estrategias'), { estrategias: ['Debate'] })
        .expect(403);
      await como('departamento')
        .put(ruta('P1', 'bibliografia'), { referencias: ['Libro'] })
        .expect(403);
    });

    it('un docente no asignado no ve el proyecto (404) ni lo edita', async () => {
      await como('otroDocente').get(ruta('P1', 'contenidos')).expect(404);
      await como('otroDocente')
        .put(ruta('P1', 'contenidos'), { semanas: [] })
        .expect(404);
    });

    it('el Estudiante tiene «C publicados», pero no ve proyectos sin publicar (404)', async () => {
      await como('estudiante').get(ruta('P1', 'bibliografia')).expect(404);
    });
  });

  describe('punto 4 · estrategias metodológicas (RF-13, HU-06-04)', () => {
    it('empieza vacía, pendiente y con el catálogo del MEN completo y lo usado en el programa', async () => {
      const { body } = await como('docente')
        .get(ruta('P1', 'estrategias'))
        .expect(200);
      // Ninguna sale dos veces: «lluvia de ideas» queda en enseñanza, y «Portafolio», que usa
      // otro proyecto, queda en el catálogo del MEN.
      expect(body).toEqual({
        estrategias: [],
        catalogo: {
          ensenanza: ['Lluvia de ideas', 'Matriz C-Q-A'],
          aprendizaje: ['Portafolio'],
        },
        sugeridas: ['Estrategia ficticia del programa'],
      });
      expect(await seccion(4)).toMatchObject({ completa: false });
    });

    it('agrega redactadas y del catálogo, y reordena y elimina (p2 y p3)', async () => {
      const primera = await como('docente')
        .put(ruta('P1', 'estrategias'), {
          estrategias: [
            'Estrategia ficticia del programa',
            'Debate dirigido',
            'Taller práctico',
          ],
        })
        .expect(200);
      expect(primera.body.sugeridas).toEqual([]);

      const { body } = await como('codocente')
        .put(ruta('P1', 'estrategias'), {
          estrategias: ['Taller práctico', 'Debate dirigido'],
        })
        .expect(200);
      expect(
        body.estrategias.map((e: { numero: number; descripcion: string }) => [
          e.numero,
          e.descripcion,
        ]),
      ).toEqual([
        [1, 'Taller práctico'],
        [2, 'Debate dirigido'],
      ]);
      expect(body.sugeridas).toEqual(['Estrategia ficticia del programa']);
      expect(await seccion(4)).toMatchObject({
        completa: true,
        pendientes: [],
      });

      const auditoria = await prisma.auditoria.findFirst({
        where: {
          id_usuario: usuarios.codocente,
          tabla_afectada: 'proyecto_docente',
          id_registro: proyectos.P1,
        },
        orderBy: { id: 'desc' },
      });
      expect(auditoria?.valor_nuevo).toEqual({
        estrategias: ['Taller práctico', 'Debate dirigido'],
      });
    });

    it('rechaza estrategias vacías o repetidas sin tocar lo guardado', async () => {
      await como('docente')
        .put(ruta('P1', 'estrategias'), { estrategias: ['  '] })
        .expect(400);
      await como('docente')
        .put(ruta('P1', 'estrategias'), {
          estrategias: ['Debate dirigido', 'debate dirigido'],
        })
        .expect(400);
      const { body } = await como('docente')
        .get(ruta('P1', 'estrategias'))
        .expect(200);
      expect(body.estrategias).toHaveLength(2);
    });

    it('una estrategia del catálogo del MEN ya agregada no se vuelve a sugerir (p2)', async () => {
      const { body } = await como('docente')
        .put(ruta('P1', 'estrategias'), {
          estrategias: ['Taller práctico', 'Debate dirigido', 'matriz c-q-a'],
        })
        .expect(200);
      expect(body.catalogo).toEqual({
        ensenanza: ['Lluvia de ideas'],
        aprendizaje: ['Portafolio'],
      });
      expect(body.sugeridas).toEqual(['Estrategia ficticia del programa']);
    });

    it('sin un parámetro del catálogo, la sección responde igual, con ese grupo vacío', async () => {
      const clave = PARAMETRO.catalogoEstrategiasEnsenanza;
      await ponerParametro(clave, null);
      try {
        const { body } = await como('docente')
          .get(ruta('P1', 'estrategias'))
          .expect(200);
        expect(body.catalogo).toEqual({
          ensenanza: [],
          aprendizaje: ['Portafolio', 'lluvia de ideas'],
        });
        expect(body.estrategias).toHaveLength(3);
      } finally {
        await ponerParametro(clave, CATALOGO_DE_PRUEBA[clave]);
      }
    });

    it('p4: una sección vacía queda pendiente para el envío a revisión', async () => {
      await como('docente')
        .put(ruta('P3', 'estrategias'), { estrategias: [] })
        .expect(200);
      expect(await seccion(4, 'P3')).toMatchObject({
        completa: false,
        pendientes: ['Registre al menos una estrategia metodológica.'],
      });
    });

    it('no se edita en un proyecto aprobado y sugiere la reapertura', async () => {
      const respuesta = await como('docente')
        .put(ruta('P2', 'estrategias'), { estrategias: ['Debate'] })
        .expect(409);
      expect(JSON.stringify(respuesta.body)).toMatch(/reapertura/);
    });
  });

  describe('punto 5 · evaluación de los RAC (RF-14, HU-06-05)', () => {
    let idRac1: number;
    let idRac2: number;

    it('sin RAC remite al punto 3 (precondición)', async () => {
      expect(await seccion(5)).toMatchObject({
        completa: false,
        pendientes: ['Registre primero los RAC del curso en el punto 3.'],
      });
    });

    it('presenta los RAC registrados y señala los que no tienen evaluación (p2)', async () => {
      for (const [codigo, idRap] of [
        ['RAC 1', rap1],
        ['RAC 2', rap2],
      ] as const) {
        await como('docente')
          .post(ruta('P1', 'rac'), {
            codigo,
            enunciado: `Enunciado ficticio de ${codigo}`,
            raps: [{ idRap }],
          })
          .expect(201);
      }
      const { body } = await como('docente')
        .get(ruta('P1', 'evaluacion'))
        .expect(200);
      expect(body.racs.map((r: { codigo: string }) => r.codigo)).toEqual([
        'RAC 1',
        'RAC 2',
      ]);
      expect(body.racs[0].raps).toEqual(['RAP 1']);
      [idRac1, idRac2] = body.racs.map((r: { id: number }) => r.id);
      expect(body.racsSinEvaluacion).toEqual([idRac1, idRac2]);
    });

    it('registra las actividades e instrumentos de un RAC (p3)', async () => {
      const { body } = await como('docente')
        .put(ruta('P1', `evaluacion/${idRac1}`), {
          actividades: [
            {
              actividad: 'Taller ficticio en grupo',
              instrumento: 'Rúbrica',
              porcentaje: 60,
            },
            {
              actividad: 'Informe escrito',
              instrumento: 'Lista de chequeo',
              porcentaje: 40,
            },
          ],
        })
        .expect(200);
      expect(body.racsSinEvaluacion).toEqual([idRac2]);
      expect(body.racs[0]).toMatchObject({
        pesoTotal: 100,
        actividades: [
          { actividad: 'Taller ficticio en grupo', porcentaje: 60 },
          { actividad: 'Informe escrito', instrumento: 'Lista de chequeo' },
        ],
      });
    });

    it('p4: indica qué RAC falta por evaluar', async () => {
      expect(await seccion(5)).toMatchObject({
        completa: false,
        pendientes: ['RAC 2 no tiene actividades de evaluación.'],
      });
      await como('docente')
        .put(ruta('P1', `evaluacion/${idRac2}`), {
          actividades: [{ actividad: 'Sustentación', instrumento: 'Rúbrica' }],
        })
        .expect(200);
      expect(await seccion(5)).toMatchObject({ completa: true });
    });

    it('un RAC con evaluación no se elimina hasta quitarla (regla del punto 3)', async () => {
      await como('docente')
        .delete(ruta('P1', `rac/${idRac2}`))
        .expect(409);
      const { body } = await como('docente')
        .put(ruta('P1', `evaluacion/${idRac2}`), { actividades: [] })
        .expect(200);
      expect(body.racsSinEvaluacion).toEqual([idRac2]);
    });

    it('valida la actividad y el peso, y responde 404 con un RAC ajeno', async () => {
      await como('docente')
        .put(ruta('P1', `evaluacion/${idRac1}`), {
          actividades: [
            { actividad: 'Taller', instrumento: '', porcentaje: 150 },
          ],
        })
        .expect(400);
      await como('docente')
        .put(ruta('P3', `evaluacion/${idRac1}`), { actividades: [] })
        .expect(404);
    });
  });

  describe('punto 6 · contenidos por semana (RF-15, HU-06-06)', () => {
    const semanasCompletas = () =>
      Array.from({ length: 16 }, (_, i) => ({
        semana: i + 1,
        tema: `Tema ficticio ${i + 1}`,
        horasTde: 2,
        horasTdp: 0,
        horasTi: 4,
      }));

    it('presenta una fila por semana del período, todas sin tema (p2 y p5)', async () => {
      const { body } = await como('docente')
        .get(ruta('P1', 'contenidos'))
        .expect(200);
      expect(body.numeroSemanas).toBe(16);
      expect(body.semanas).toHaveLength(16);
      expect(body.semanasSinTema).toHaveLength(16);
      expect(body.datosAsignaturaFaltantes).toEqual([]);
      expect(await seccion(6)).toMatchObject({
        pendientes: ['Las semanas 1 a 16 no tienen tema.'],
      });
    });

    it('con 16 semanas de 2 TDE y 4 TI coincide con una asignatura de 2 créditos (p4)', async () => {
      const { body } = await como('docente')
        .put(ruta('P1', 'contenidos'), { semanas: semanasCompletas() })
        .expect(200);
      expect(body.horasCoinciden).toBe(true);
      expect(body.semanasSinTema).toEqual([]);
      expect(await seccion(6)).toMatchObject({ completa: true });
    });

    it('p4 y p5: con una diferencia de horas guarda, advierte y deja constancia', async () => {
      const antes = await prisma.contenido_programatico.findFirstOrThrow({
        where: { id_proyecto_docente: proyectos.P1, semana: 16 },
      });
      const semanas = semanasCompletas().slice(0, 15);
      const { body } = await como('docente')
        .put(ruta('P1', 'contenidos'), { semanas })
        .expect(200);
      expect(body.horasCoinciden).toBe(false);
      expect(body.semanasSinTema).toEqual([16]);
      expect(
        body.comparacion.find((f: { tipo: string }) => f.tipo === 'Total'),
      ).toEqual({
        tipo: 'Total',
        contenidos: 90,
        asignatura: 96,
        diferencia: -6,
      });
      // La semana vaciada conserva su fila: el registro de clase la puede referenciar.
      expect(body.semanas[15]).toMatchObject({ id: antes.id, tema: null });
      expect(await seccion(6)).toMatchObject({
        completa: false,
        pendientes: ['La semana 16 no tiene tema.'],
      });

      const auditoria = await prisma.auditoria.findFirst({
        where: {
          id_usuario: usuarios.docente,
          tabla_afectada: 'proyecto_docente',
          id_registro: proyectos.P1,
        },
        orderBy: { id: 'desc' },
      });
      expect(auditoria?.valor_nuevo).toMatchObject({ horasCoinciden: false });
    });

    it('rechaza semanas fuera del período o repetidas', async () => {
      await como('docente')
        .put(ruta('P1', 'contenidos'), {
          semanas: [{ semana: 17, tema: 'Fuera del período' }],
        })
        .expect(400);
      await como('docente')
        .put(ruta('P1', 'contenidos'), {
          semanas: [{ semana: 1 }, { semana: 1 }],
        })
        .expect(400);
    });

    it('sin horas en la asignatura, muestra información incompleta y no compara', async () => {
      const { body } = await como('docente')
        .put(ruta('P3', 'contenidos'), {
          semanas: [{ semana: 1, tema: 'Tema', horasTde: 3, horasTi: 6 }],
        })
        .expect(200);
      expect(body.horasCoinciden).toBeNull();
      expect(body.datosAsignaturaFaltantes).toEqual([
        'créditos',
        'horas TDE',
        'horas TDP',
        'horas TI',
      ]);
      expect(
        body.comparacion.every(
          (f: { asignatura: number | null }) => f.asignatura === null,
        ),
      ).toBe(true);
    });

    it('sin número de semanas en el período, lo informa y no guarda', async () => {
      const { body } = await como('docente')
        .get(ruta('P4', 'contenidos'))
        .expect(200);
      expect(body).toMatchObject({ numeroSemanas: null, semanas: [] });
      await como('docente')
        .put(ruta('P4', 'contenidos'), { semanas: [{ semana: 1, tema: 'x' }] })
        .expect(409);
    });
  });

  describe('punto 7 · bibliografía (RF-16, HU-06-07)', () => {
    it('ofrece importar de los proyectos propios, primero los de la misma asignatura (p2)', async () => {
      const { body } = await como('docente')
        .get(ruta('P1', 'bibliografia/proyectos-para-importar'))
        .expect(200);
      expect(body).toEqual([
        expect.objectContaining({
          id: proyectos.ANT,
          referencias: 2,
          mismaAsignatura: true,
        }),
      ]);
      // El proyecto del otro docente no aparece ni se puede leer.
      await como('docente').get(ruta('AJENO', 'bibliografia')).expect(404);
      const origen = await como('docente')
        .get(ruta('ANT', 'bibliografia'))
        .expect(200);
      expect(
        origen.body.referencias.map(
          (r: { referencia: string }) => r.referencia,
        ),
      ).toEqual(['Referencia ficticia A.', 'Referencia ficticia B.']);
    });

    it('guarda el listado numerado y lo reordena (p3 y p4)', async () => {
      await como('docente')
        .put(ruta('P1', 'bibliografia'), {
          referencias: ['Referencia ficticia A.', 'Referencia ficticia B.'],
        })
        .expect(200);
      const { body } = await como('docente')
        .put(ruta('P1', 'bibliografia'), {
          referencias: [
            'Referencia ficticia nueva.',
            'Referencia ficticia B.',
            'Referencia ficticia A.',
          ],
        })
        .expect(200);
      expect(
        body.referencias.map((r: { numero: number; referencia: string }) => [
          r.numero,
          r.referencia,
        ]),
      ).toEqual([
        [1, 'Referencia ficticia nueva.'],
        [2, 'Referencia ficticia B.'],
        [3, 'Referencia ficticia A.'],
      ]);
      expect(await seccion(7)).toMatchObject({ completa: true });
    });

    it('rechaza referencias repetidas', async () => {
      await como('docente')
        .put(ruta('P1', 'bibliografia'), { referencias: ['Libro', 'LIBRO'] })
        .expect(400);
    });

    it('p4: vacía queda pendiente para el envío a revisión', async () => {
      await como('docente')
        .put(ruta('P1', 'bibliografia'), { referencias: [] })
        .expect(200);
      expect(await seccion(7)).toMatchObject({
        completa: false,
        pendientes: ['Registre al menos una referencia.'],
      });
    });

    it('solo el Docente pide los proyectos para importar', async () => {
      await como('departamento')
        .get(ruta('P1', 'bibliografia/proyectos-para-importar'))
        .expect(403);
    });
  });
});
