import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { MENSAJE_SIN_PERMISO } from '../src/auth/roles.guard.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { NOTIFICACION } from '../src/notificaciones/notificaciones.service.js';
import {
  MENSAJE_AVISO_RAP,
  MENSAJE_PERIODO_NO_DISPONIBLE,
} from '../src/proyectos-docentes/duplicacion.service.js';
import {
  MENSAJE_DOCENTES_INVALIDOS,
  MENSAJE_PROYECTO_EXISTENTE,
  MENSAJE_PROYECTO_NO_EXISTE,
  MENSAJE_RAP_INVALIDOS,
  MENSAJE_UN_RESPONSABLE,
} from '../src/proyectos-docentes/proyectos-docentes.service.js';
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
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed: usa los
// catálogos y el período vigente si existen y, si no, los crea.
describe('Duplicar un proyecto docente (e2e) · RF-09, HU-05-04', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const SEMANAS_ORIGEN = 16;

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
    tiposNotificacion: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  let programaA: number;
  let programaB: number;
  let asignatura: number;
  let rapA1: number;
  let rapA2: number;
  let rapA3: number;
  let rapB: number;
  let periodoVigente: number;
  let periodoCorto: number;
  let periodoCerrado: number;
  let origen: number;

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
  const ruta = () => `/proyectos-docentes/${origen}/duplicacion`;
  const copiaValida = (cambios: object = {}) => ({
    grupo: 'B',
    docentes: [{ idUsuario: usuarios.docente2, responsable: true }],
    ...cambios,
  });

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
        email: `e2e.dup.${clave}.${sufijo}@prueba.urap.local`,
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

  async function estado(codigo: string): Promise<number> {
    const existente = await prisma.estado_proyecto.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const creado = await prisma.estado_proyecto.create({
      data: { codigo, nombre: codigo },
    });
    creados.estados.push(creado.id);
    return creado.id;
  }

  async function crearPeriodo(
    codigo: string,
    datos: { inicio: string; semanas: number; cerrado?: boolean },
  ): Promise<number> {
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `${codigo}-${sufijo}`,
        fecha_inicio: new Date(datos.inicio),
        fecha_fin: new Date(datos.inicio),
        numero_semanas: datos.semanas,
        activo: true,
        cerrado: datos.cerrado ?? false,
      },
    });
    creados.periodos.push(periodo.id);
    return periodo.id;
  }

  /** Todo lo que cuelga de un proyecto, para comparar la copia con su origen. */
  function leerProyecto(id: number) {
    return prisma.proyecto_docente.findUniqueOrThrow({
      where: { id },
      include: {
        estado_proyecto: true,
        proyecto_docente_rap: { orderBy: { id_rap: 'asc' } },
        proyecto_docente_docente: true,
        rac: {
          include: {
            rac_rap: { orderBy: { id_rap: 'asc' } },
            evaluacion_rac: { orderBy: { id: 'asc' } },
          },
          orderBy: { orden: 'asc' },
        },
        estrategia_metodologica: { orderBy: { orden: 'asc' } },
        contenido_programatico: { orderBy: { semana: 'asc' } },
        bibliografia: { orderBy: { orden: 'asc' } },
        horario_curso: true,
        revision_proyecto: true,
      },
    });
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);
    if (
      !(await prisma.tipo_notificacion.findUnique({
        where: { codigo: NOTIFICACION.asignacionProyecto },
      }))
    ) {
      const tipo = await prisma.tipo_notificacion.create({
        data: {
          codigo: NOTIFICACION.asignacionProyecto,
          nombre: NOTIFICACION.asignacionProyecto,
          activo: true,
        },
      });
      creados.tiposNotificacion.push(tipo.id);
    }
    await asegurarCatalogoDePermisos(prisma, matriz);
    hash = await app.get(ContrasenasService).hashear(contrasena);

    const enDiligenciamiento = await estado('en_diligenciamiento');
    const aprobado = await estado('aprobado');
    periodoVigente =
      (
        await prisma.periodo_academico.findFirst({
          where: { activo: true, cerrado: false },
          orderBy: { fecha_inicio: 'desc' },
        })
      )?.id ??
      (await crearPeriodo('E2E-VIGENTE', {
        inicio: '2026-08-03',
        semanas: SEMANAS_ORIGEN,
      }));
    // Más antiguos que el vigente: no le quitan ese lugar a ninguna otra prueba.
    periodoCorto = await crearPeriodo('E2E-CORTO', {
      inicio: '2001-01-15',
      semanas: 2,
    });
    periodoCerrado = await crearPeriodo('E2E-CERRADO', {
      inicio: '2001-01-08',
      semanas: SEMANAS_ORIGEN,
      cerrado: true,
    });

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E dup ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    for (const letra of ['A', 'B']) {
      const programa = await prisma.programa.create({
        data: {
          id_facultad: facultad.id,
          nombre: `Programa E2E dup ${letra} ${sufijo}`,
        },
      });
      creados.programas.push(programa.id);
    }
    [programaA, programaB] = creados.programas;
    const nuevaAsignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, programaA),
        codigo_interno: `DUP-${sufijo}`,
        nombre: 'Asignatura de prueba para duplicar',
        semestre: 4,
        creditos: 3,
        horas_tde: 48,
        horas_tdp: 0,
        horas_ti: 96,
        horas_totales: 144,
      },
    });
    asignatura = nuevaAsignatura.id;
    creados.asignaturas.push(asignatura);
    for (const [programa, numero] of [
      [programaA, 1],
      [programaA, 2],
      [programaA, 3],
      [programaB, 1],
    ]) {
      const rap = await prisma.rap.create({
        data: {
          id_programa: programa,
          numero,
          codigo: `RAP ${numero}`,
          descripcion: `RAP ficticio ${numero}`,
        },
      });
      creados.raps.push(rap.id);
    }
    [rapA1, rapA2, rapA3, rapB] = creados.raps;
    await prisma.asignatura_rap.createMany({
      data: [
        { id_asignatura: asignatura, id_rap: rapA1 },
        { id_asignatura: asignatura, id_rap: rapA2 },
      ],
    });

    await crearUsuario('departamento', ROL.departamento, programaA);
    await crearUsuario('departamentoOtro', ROL.departamento, programaB);
    await crearUsuario('administrador', ROL.administrador, null);
    await crearUsuario('docente1', ROL.docente, programaA);
    await crearUsuario('docente2', ROL.docente, programaA);
    await crearUsuario('docenteOtro', ROL.docente, programaB);

    // El origen: un proyecto aprobado, con sus seis puntos llenos y con lo que no se copia
    // (horario y revisión).
    const proyecto = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: asignatura,
        id_periodo: periodoVigente,
        id_estado: aprobado,
        grupo: 'A',
        descripcion: 'Descripción ficticia del curso de prueba.',
        origen: 'manual',
        fecha_envio: new Date('2026-08-10T15:00:00Z'),
        fecha_aprobacion: new Date('2026-08-12T15:00:00Z'),
        proyecto_docente_rap: {
          create: [{ id_rap: rapA1 }, { id_rap: rapA2 }],
        },
        proyecto_docente_docente: {
          create: [
            { id_usuario: usuarios.docente1, responsable: true, orden: 1 },
          ],
        },
        estrategia_metodologica: {
          create: [1, 2, 3].map((orden) => ({
            descripcion: `Estrategia ficticia ${orden}`,
            orden,
          })),
        },
        contenido_programatico: {
          create: Array.from({ length: SEMANAS_ORIGEN }, (_, i) => ({
            semana: i + 1,
            tema: `Tema ficticio de la semana ${i + 1}`,
            horas_tde: 3,
            horas_tdp: 0,
            horas_ti: 6,
          })),
        },
        bibliografia: {
          create: [1, 2].map((orden) => ({
            referencia: `Referencia ficticia ${orden}`,
            orden,
          })),
        },
        horario_curso: {
          create: [
            {
              dia_semana: 1,
              hora_inicio: new Date('1970-01-01T07:00:00Z'),
              hora_fin: new Date('1970-01-01T09:00:00Z'),
            },
          ],
        },
        revision_proyecto: {
          create: [{ tipo: 'aprobacion', resultado: 'aprobado' }],
        },
      },
    });
    origen = proyecto.id;
    for (const [orden, relaciones] of [
      [1, [rapA1, rapA2]],
      [2, [rapA2]],
    ] as const) {
      await prisma.rac.create({
        data: {
          id_proyecto_docente: origen,
          codigo: `RAC ${orden}`,
          descripcion: `RAC ficticio ${orden}`,
          orden,
          rac_rap: {
            create: relaciones.map((idRap) => ({
              id_rap: idRap,
              descripcion_contribucion: `Contribución al RAP ${idRap}`,
            })),
          },
          evaluacion_rac: {
            create: [
              { instrumento: 'Rúbrica', descripcion: 'Taller', porcentaje: 30 },
              { instrumento: 'Prueba', descripcion: 'Parcial', porcentaje: 20 },
            ],
          },
        },
      });
    }
    // La copia nace en diligenciamiento: el estado debe existir aunque la base esté vacía.
    expect(enDiligenciamiento).toBeGreaterThan(0);
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      const proyectos = await prisma.proyecto_docente.findMany({
        where: { id_asignatura: { in: creados.asignaturas } },
        select: { id: true },
        orderBy: { id: 'desc' },
      });
      const ids = proyectos.map((proyecto) => proyecto.id);
      const deProyectos = { id_proyecto_docente: { in: ids } };
      await prisma.auditoria.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            { tabla_afectada: 'proyecto_docente', id_registro: { in: ids } },
          ],
        },
      });
      await prisma.notificacion.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            { entidad: 'proyecto_docente', id_entidad: { in: ids } },
          ],
        },
      });
      await prisma.tipo_notificacion.deleteMany({
        where: { id: { in: creados.tiposNotificacion } },
      });
      const racs = await prisma.rac.findMany({
        where: deProyectos,
        select: { id: true },
      });
      const deRacs = { id_rac: { in: racs.map((rac) => rac.id) } };
      await prisma.evaluacion_rac.deleteMany({ where: deRacs });
      await prisma.rac_rap.deleteMany({ where: deRacs });
      await prisma.rac.deleteMany({ where: deProyectos });
      await prisma.estrategia_metodologica.deleteMany({ where: deProyectos });
      await prisma.contenido_programatico.deleteMany({ where: deProyectos });
      await prisma.bibliografia.deleteMany({ where: deProyectos });
      await prisma.horario_curso.deleteMany({ where: deProyectos });
      await prisma.revision_proyecto.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      // Primero las copias: apuntan al origen.
      for (const id of ids) {
        await prisma.proyecto_docente.delete({ where: { id } });
      }
      await prisma.asignatura_rap.deleteMany({
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
  }, 60_000);

  describe('quién puede duplicar', () => {
    it('exige sesión', async () => {
      await http().get(`/api${ruta()}`).expect(401);
      await http().post(`/api${ruta()}`).send(copiaValida()).expect(401);
    });

    it('el Docente y el Administrador no tienen el permiso de crear proyectos', async () => {
      for (const quien of ['docente1', 'administrador']) {
        const { body } = await como(quien).get(ruta()).expect(403);
        expect(body.mensaje).toBe(MENSAJE_SIN_PERMISO);
        await como(quien).post(ruta(), copiaValida()).expect(403);
      }
    });

    it('el Departamento de otro programa no ve el proyecto: 404, sin revelar que existe', async () => {
      const { body } = await como('departamentoOtro').get(ruta()).expect(404);
      expect(body.mensaje).toBe(MENSAJE_PROYECTO_NO_EXISTE);
      await como('departamentoOtro').post(ruta(), copiaValida()).expect(404);
    });

    it('un proyecto que no existe responde 404', async () => {
      await como('departamento')
        .get('/proyectos-docentes/999999999/duplicacion')
        .expect(404);
    });
  });

  describe('preparar la copia (p3)', () => {
    it('muestra lo que se va a copiar y lo que sugiere el origen', async () => {
      const { body } = await como('departamento').get(ruta()).expect(200);

      expect(body.origen).toMatchObject({ id: origen, grupo: 'A' });
      expect(body.contenido).toEqual({
        descripcion: true,
        racs: 2,
        relacionesRap: 3,
        estrategias: 3,
        actividadesEvaluacion: 4,
        semanasContenido: SEMANAS_ORIGEN,
        referencias: 2,
      });
      expect(body.idPeriodoSugerido).toBe(periodoVigente);
      const periodos = new Map(
        body.periodos.map((p: { id: number; semanasQueNoCaben: number }) => [
          p.id,
          p.semanasQueNoCaben,
        ]),
      );
      expect(periodos.get(periodoCorto)).toBe(SEMANAS_ORIGEN - 2);
      expect(periodos.has(periodoCerrado)).toBe(false);
      expect(body.docentesSugeridos).toEqual([
        { idUsuario: usuarios.docente1, responsable: true },
      ]);
      expect(body.docentes.map((d: { id: number }) => d.id)).toEqual(
        expect.arrayContaining([usuarios.docente1, usuarios.docente2]),
      );
      expect(body.docentes.map((d: { id: number }) => d.id)).not.toContain(
        usuarios.docenteOtro,
      );
      expect(body.idsRapSugeridos).toEqual([rapA1, rapA2]);
      expect(body.avisoRap).toBeNull();
    });

    it('advierte si la asignatura cambió de RAP desde el origen (excepción de p4)', async () => {
      await prisma.asignatura_rap.create({
        data: { id_asignatura: asignatura, id_rap: rapA3 },
      });
      try {
        const { body } = await como('departamento').get(ruta()).expect(200);

        expect(body.avisoRap).toMatchObject({ mensaje: MENSAJE_AVISO_RAP });
        expect(body.avisoRap.nuevos.map((r: { id: number }) => r.id)).toEqual([
          rapA3,
        ]);
        expect(body.raps).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: rapA3, mapeado: true }),
          ]),
        );
      } finally {
        await prisma.asignatura_rap.deleteMany({
          where: { id_asignatura: asignatura, id_rap: rapA3 },
        });
      }
    });
  });

  describe('guardar la copia (p5 y p6)', () => {
    let copia: number;

    it('copia los seis puntos, nace en diligenciamiento y conserva el origen, en menos de 5 s', async () => {
      const inicio = performance.now();
      const { body } = await como('departamento')
        .post(ruta(), copiaValida())
        .expect(201);
      const duracion = performance.now() - inicio;

      // RF-09, q1.
      expect(duracion).toBeLessThan(5_000);
      copia = body.id;
      expect(body).toMatchObject({
        grupo: 'B',
        origen: 'duplicado',
        idProyectoOrigen: origen,
        estado: { codigo: 'en_diligenciamiento' },
        periodoAcademico: { id: periodoVigente },
      });
      expect(body.docentes).toEqual([
        expect.objectContaining({ id: usuarios.docente2, responsable: true }),
      ]);

      const [original, nuevo] = await Promise.all([
        leerProyecto(origen),
        leerProyecto(copia),
      ]);
      expect(nuevo.id_proyecto_origen).toBe(origen);
      expect(nuevo.descripcion).toBe(original.descripcion);
      expect(nuevo.fecha_envio).toBeNull();
      expect(nuevo.fecha_aprobacion).toBeNull();
      const sinIds = (p: typeof original) => ({
        raps: p.proyecto_docente_rap.map((r) => [r.id_rap, r.id_rubrica]),
        racs: p.rac.map((rac) => ({
          codigo: rac.codigo,
          descripcion: rac.descripcion,
          orden: rac.orden,
          raps: rac.rac_rap.map((r) => [r.id_rap, r.descripcion_contribucion]),
          evaluacion: rac.evaluacion_rac.map((e) => [
            e.instrumento,
            e.descripcion,
            Number(e.porcentaje),
          ]),
        })),
        estrategias: p.estrategia_metodologica.map((e) => [
          e.orden,
          e.descripcion,
        ]),
        contenidos: p.contenido_programatico.map((c) => [
          c.semana,
          c.tema,
          c.horas_tde,
          c.horas_tdp,
          c.horas_ti,
        ]),
        bibliografia: p.bibliografia.map((b) => [b.orden, b.referencia]),
      });
      expect(sinIds(nuevo)).toEqual(sinIds(original));
      // Son filas nuevas, no las del origen.
      expect(nuevo.rac.map((r) => r.id)).not.toEqual(
        original.rac.map((r) => r.id),
      );
      // Lo que no se copia.
      expect(nuevo.horario_curso).toEqual([]);
      expect(nuevo.revision_proyecto).toEqual([]);
      // El origen sigue igual.
      expect(original.estado_proyecto?.codigo).toBe('aprobado');
      expect(original.horario_curso).toHaveLength(1);
    });

    it('lo audita como creación, con el proyecto de origen (RF-29)', async () => {
      const registro = await prisma.auditoria.findFirst({
        where: {
          tabla_afectada: 'proyecto_docente',
          id_registro: copia,
          accion: 'crear',
        },
      });

      expect(registro?.id_usuario).toBe(usuarios.departamento);
      expect(registro?.valor_nuevo).toMatchObject({
        origen: 'duplicado',
        idProyectoOrigen: origen,
        grupo: 'B',
        copiado: { racs: 2, semanasContenido: SEMANAS_ORIGEN },
      });
    });

    it('avisa al docente asignado (HU-13-01)', async () => {
      const aviso = await prisma.notificacion.findFirst({
        where: {
          id_usuario: usuarios.docente2,
          entidad: 'proyecto_docente',
          id_entidad: copia,
        },
      });

      expect(aviso).not.toBeNull();
    });

    it('no deja guardar un curso que ya existe (excepción de p5)', async () => {
      for (const grupo of ['B', 'A']) {
        const { body } = await como('departamento')
          .post(ruta(), copiaValida({ grupo }))
          .expect(409);
        expect(body.mensaje).toBe(MENSAJE_PROYECTO_EXISTENTE);
      }
    });

    it('en un período con menos semanas, copia solo las que caben', async () => {
      const { body } = await como('departamento')
        .post(ruta(), copiaValida({ grupo: 'A', idPeriodo: periodoCorto }))
        .expect(201);

      const nuevo = await leerProyecto(body.id);
      expect(nuevo.id_periodo).toBe(periodoCorto);
      expect(nuevo.contenido_programatico.map((c) => c.semana)).toEqual([1, 2]);
    });

    it('con menos RAP, no copia las relaciones de los RAC con los que salieron', async () => {
      const { body } = await como('departamento')
        .post(ruta(), copiaValida({ grupo: 'C', idsRap: [rapA1] }))
        .expect(201);

      const nuevo = await leerProyecto(body.id);
      expect(nuevo.proyecto_docente_rap.map((r) => r.id_rap)).toEqual([rapA1]);
      expect(nuevo.rac.map((rac) => rac.rac_rap.map((r) => r.id_rap))).toEqual([
        [rapA1],
        [],
      ]);
      // La evaluación se copia igual: es del RAC, no del RAP.
      expect(nuevo.rac.map((rac) => rac.evaluacion_rac.length)).toEqual([2, 2]);
    });

    it('valida como el asistente: período, RAP y docentes', async () => {
      const casos: [object, number, string][] = [
        [{ idPeriodo: periodoCerrado }, 400, MENSAJE_PERIODO_NO_DISPONIBLE],
        [{ idsRap: [rapA1, rapB] }, 400, MENSAJE_RAP_INVALIDOS],
        [
          {
            docentes: [{ idUsuario: usuarios.docenteOtro, responsable: true }],
          },
          400,
          MENSAJE_DOCENTES_INVALIDOS,
        ],
        [
          {
            docentes: [
              { idUsuario: usuarios.docente1, responsable: true },
              { idUsuario: usuarios.docente2, responsable: true },
            ],
          },
          400,
          MENSAJE_UN_RESPONSABLE,
        ],
      ];
      for (const [cambios, codigo, mensaje] of casos) {
        const { body } = await como('departamento')
          .post(ruta(), copiaValida({ grupo: 'Z', ...cambios }))
          .expect(codigo);
        expect(body.mensaje).toBe(mensaje);
      }
      await como('departamento')
        .post(ruta(), copiaValida({ docentes: [] }))
        .expect(400);
      expect(
        await prisma.proyecto_docente.count({
          where: { id_asignatura: asignatura, grupo: 'Z' },
        }),
      ).toBe(0);
    });
  });
});
