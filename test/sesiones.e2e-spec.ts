import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_SIN_HORARIO,
  MENSAJE_SOLO_DOCENTE_ASIGNADO,
  mensajeSinFestivos,
  NOTIFICACION_FESTIVOS_FALTANTES,
} from '../src/sesiones/sesiones.service.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed: usa períodos
// propios en 2031 y 2032, años que el seed no carga, y crea los catálogos que falten.
describe('Calendario de sesiones (e2e) · RF-19, HU-08-02 y HU-08-03', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  /** Año sin festivos parametrizados (excepción p3). */
  const ANIO_SIN_FESTIVOS = 2031;

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const creados = {
    roles: [] as number[],
    tiposSesion: [] as number[],
    tiposNotificacion: [] as number[],
    festivos: [] as number[],
    periodos: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    asignaturas: [] as number[],
    usuarios: [] as number[],
    proyectos: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  let programa: number;
  /** Período de cuatro semanas en 2032, con un festivo el lunes 16 de agosto. */
  let periodo2032: number;
  let periodo2031: number;
  let periodoCerrado: number;
  let proyecto: number;
  let proyectoSinHorario: number;
  let proyectoSinFestivos: number;
  let proyectoCerrado: number;

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => ({
    get: (ruta: string) =>
      http().get(`/api${ruta}`).set('Authorization', `Bearer ${tokens[quien]}`),
    put: (ruta: string, cuerpo: object) =>
      http()
        .put(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`)
        .send(cuerpo),
    post: (ruta: string) =>
      http()
        .post(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`),
  });

  const lunesYMiercoles = {
    bloques: [
      { diaSemana: 1, horaInicio: '07:00', horaFin: '09:00' },
      { diaSemana: 3, horaInicio: '14:00', horaFin: '16:00' },
    ],
  };

  async function rolPorNombre(nombre: string): Promise<number> {
    const existente = await prisma.rol.findUnique({ where: { nombre } });
    if (existente) {
      return existente.id;
    }
    const rol = await prisma.rol.create({ data: { nombre, activo: true } });
    creados.roles.push(rol.id);
    return rol.id;
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

  async function crearPeriodo(
    inicio: string,
    fin: string,
    cerrado = false,
  ): Promise<number> {
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `E2E-${creados.periodos.length}-${sufijo}`,
        fecha_inicio: new Date(inicio),
        fecha_fin: new Date(fin),
        numero_semanas: 4,
        activo: false,
        cerrado,
      },
    });
    creados.periodos.push(periodo.id);
    return periodo.id;
  }

  /** Proyecto creado directamente: RF-08 ya tiene sus propias pruebas. */
  async function crearProyecto(
    idPeriodo: number,
    codigo: string,
  ): Promise<number> {
    const asignatura = await prisma.asignatura.create({
      data: {
        id_programa: programa,
        codigo_interno: `${codigo}-${sufijo}`,
        nombre: `Asignatura ${codigo}`,
        semestre: 3,
      },
    });
    creados.asignaturas.push(asignatura.id);
    const creado = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: asignatura.id,
        id_periodo: idPeriodo,
        origen: 'manual',
        proyecto_docente_docente: {
          create: [
            { id_usuario: usuarios.docente, responsable: true, orden: 1 },
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
    hash = await app.get(ContrasenasService).hashear(contrasena);

    for (const tipo of [
      {
        codigo: 'clase',
        nombre: 'Clase',
        exige_tema: true,
        cuenta_como_dictada: true,
      },
      {
        codigo: 'festivo',
        nombre: 'Festivo',
        exige_tema: false,
        cuenta_como_dictada: false,
      },
    ]) {
      if (
        !(await prisma.tipo_sesion.findUnique({
          where: { codigo: tipo.codigo },
        }))
      ) {
        creados.tiposSesion.push(
          (await prisma.tipo_sesion.create({ data: tipo })).id,
        );
      }
    }
    if (
      !(await prisma.tipo_notificacion.findUnique({
        where: { codigo: NOTIFICACION_FESTIVOS_FALTANTES },
      }))
    ) {
      const tipo = await prisma.tipo_notificacion.create({
        data: {
          codigo: NOTIFICACION_FESTIVOS_FALTANTES,
          nombre: 'Festivos faltantes',
        },
      });
      creados.tiposNotificacion.push(tipo.id);
    }
    const festivo = await prisma.dia_festivo.create({
      data: {
        fecha: new Date('2032-08-16'),
        nombre: 'Festivo E2E',
        anio: 2032,
        origen: 'ajuste_manual',
      },
    });
    creados.festivos.push(festivo.id);

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const creadoPrograma = await prisma.programa.create({
      data: { id_facultad: facultad.id, nombre: `Programa E2E ${sufijo}` },
    });
    creados.programas.push(creadoPrograma.id);
    programa = creadoPrograma.id;

    await crearUsuario('docente', ROL.docente, programa);
    await crearUsuario('otroDocente', ROL.docente, programa);
    await crearUsuario('departamento', ROL.departamento, programa);
    await crearUsuario('administrador', ROL.administrador, null);
    await crearUsuario('estudiante', ROL.estudiante, programa);

    // Lunes 2 a domingo 29 de agosto de 2032.
    periodo2032 = await crearPeriodo('2032-08-02', '2032-08-29');
    // Lunes 4 a domingo 31 de agosto de 2031.
    periodo2031 = await crearPeriodo('2031-08-04', '2031-08-31');
    periodoCerrado = await crearPeriodo('2032-08-02', '2032-08-29', true);
    proyecto = await crearProyecto(periodo2032, 'CAL');
    proyectoSinHorario = await crearProyecto(periodo2032, 'SHO');
    proyectoSinFestivos = await crearProyecto(periodo2031, 'SFE');
    proyectoCerrado = await crearProyecto(periodoCerrado, 'CER');
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.notificacion.deleteMany({
        where: { entidad: 'dia_festivo', id_entidad: ANIO_SIN_FESTIVOS },
      });
      await prisma.sesion_clase.deleteMany({ where: deProyectos });
      await prisma.horario_curso.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: creados.proyectos } },
      });
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
      await prisma.programa.deleteMany({
        where: { id: { in: creados.programas } },
      });
      await prisma.facultad.deleteMany({
        where: { id: { in: creados.facultades } },
      });
      await prisma.periodo_academico.deleteMany({
        where: { id: { in: creados.periodos } },
      });
      await prisma.dia_festivo.deleteMany({
        where: { id: { in: creados.festivos } },
      });
      await prisma.tipo_notificacion.deleteMany({
        where: { id: { in: creados.tiposNotificacion } },
      });
      await prisma.tipo_sesion.deleteMany({
        where: { id: { in: creados.tiposSesion } },
      });
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
    }
    await app?.close();
  });

  describe('horario del curso (HU-08-02)', () => {
    it('empieza vacío y el docente asignado puede editarlo', async () => {
      const respuesta = await como('docente').get(
        `/proyectos-docentes/${proyecto}/horario`,
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        idProyectoDocente: proyecto,
        bloques: [],
        puedeEditar: true,
      });
    });

    it('registra uno o varios días con hora de inicio y fin', async () => {
      const respuesta = await como('docente').put(
        `/proyectos-docentes/${proyecto}/horario`,
        { bloques: [...lunesYMiercoles.bloques].reverse() },
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.bloques).toEqual(lunesYMiercoles.bloques);
      const auditoria = await prisma.auditoria.findFirst({
        where: { tabla_afectada: 'horario_curso', id_registro: proyecto },
      });
      expect(auditoria?.id_usuario).toBe(usuarios.docente);
    });

    it.each([
      ['un domingo', [{ diaSemana: 7, horaInicio: '07:00', horaFin: '09:00' }]],
      [
        'una hora mal escrita',
        [{ diaSemana: 1, horaInicio: '7:00', horaFin: '09:00' }],
      ],
      ['ningún día', []],
      [
        'un día repetido',
        [lunesYMiercoles.bloques[0], lunesYMiercoles.bloques[0]],
      ],
      [
        'la hora de fin antes del inicio',
        [{ diaSemana: 2, horaInicio: '10:00', horaFin: '08:00' }],
      ],
    ])('rechaza %s con 400', async (_caso, bloques) => {
      const respuesta = await como('docente').put(
        `/proyectos-docentes/${proyecto}/horario`,
        { bloques },
      );

      expect(respuesta.status).toBe(400);
    });

    it('el Departamento lo consulta pero no lo cambia', async () => {
      const consulta = await como('departamento').get(
        `/proyectos-docentes/${proyecto}/horario`,
      );
      const cambio = await como('departamento').put(
        `/proyectos-docentes/${proyecto}/horario`,
        lunesYMiercoles,
      );

      expect(consulta.status).toBe(200);
      expect(consulta.body.puedeEditar).toBe(false);
      expect(cambio.status).toBe(403);
    });

    it('un docente que no está asignado no ve el proyecto (404)', async () => {
      const respuesta = await como('otroDocente').put(
        `/proyectos-docentes/${proyecto}/horario`,
        lunesYMiercoles,
      );

      expect(respuesta.status).toBe(404);
    });

    it('el estudiante no tiene acceso (403)', async () => {
      const respuesta = await como('estudiante').get(
        `/proyectos-docentes/${proyecto}/horario`,
      );

      expect(respuesta.status).toBe(403);
    });

    it('no se cambia con el período cerrado (409)', async () => {
      const respuesta = await como('docente').put(
        `/proyectos-docentes/${proyectoCerrado}/horario`,
        lunesYMiercoles,
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_PERIODO_CERRADO);
    });
  });

  describe('generación del calendario (HU-08-03)', () => {
    it('exige el horario antes de generar (409)', async () => {
      const respuesta = await como('docente').post(
        `/proyectos-docentes/${proyectoSinHorario}/calendario`,
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_SIN_HORARIO);
    });

    it('genera una sesión por encuentro, numerada por semana, con el festivo marcado, en menos de 5 s', async () => {
      const inicio = Date.now();
      const respuesta = await como('docente').post(
        `/proyectos-docentes/${proyecto}/calendario`,
      );
      const duracion = Date.now() - inicio;

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        creadas: 8,
        actualizadas: 0,
        retiradas: 0,
        conservadas: 0,
        festivos: 1,
        total: 8,
        advertencias: [],
      });
      expect(duracion).toBeLessThan(5000);

      const calendario = await como('docente').get(
        `/proyectos-docentes/${proyecto}/calendario`,
      );
      expect(calendario.status).toBe(200);
      const sesiones = calendario.body.elementos as Array<
        Record<string, unknown>
      >;
      expect(sesiones.map((sesion) => [sesion.fecha, sesion.semana])).toEqual([
        ['2032-08-02', 1],
        ['2032-08-04', 1],
        ['2032-08-09', 2],
        ['2032-08-11', 2],
        ['2032-08-16', 3],
        ['2032-08-18', 3],
        ['2032-08-23', 4],
        ['2032-08-25', 4],
      ]);
      expect(sesiones[0]).toMatchObject({
        horaInicio: '07:00',
        horaFin: '09:00',
        tipo: { codigo: 'clase', nombre: 'Clase' },
        estado: 'programada',
        festivo: null,
        diligenciada: false,
      });
      expect(sesiones[4]).toMatchObject({
        tipo: { codigo: 'festivo' },
        festivo: 'Festivo E2E',
      });
      expect(calendario.body.periodo).toMatchObject({
        fechaInicio: '2032-08-02',
        fechaFin: '2032-08-29',
        numeroSemanas: 4,
      });
    });

    it('el Departamento consulta el calendario pero no lo genera', async () => {
      const consulta = await como('departamento').get(
        `/proyectos-docentes/${proyecto}/calendario`,
      );
      const generar = await como('departamento').post(
        `/proyectos-docentes/${proyecto}/calendario`,
      );

      expect(consulta.status).toBe(200);
      expect(consulta.body.total).toBe(8);
      expect(consulta.body.puedeEditar).toBe(false);
      expect(generar.status).toBe(403);
    });

    it('al cambiar el horario recalcula las no diligenciadas y deja intactas las diligenciadas', async () => {
      // Simula RF-20: el docente diligenció la sesión del miércoles 4 de agosto.
      const diligenciada = await prisma.sesion_clase.findFirstOrThrow({
        where: { id_proyecto_docente: proyecto, fecha: new Date('2032-08-04') },
      });
      await prisma.sesion_clase.update({
        where: { id: diligenciada.id },
        data: {
          estado: 'registrada',
          fecha_registro: new Date(),
          id_registrado_por: usuarios.docente,
        },
      });
      await como('docente')
        .put(`/proyectos-docentes/${proyecto}/horario`, {
          bloques: [lunesYMiercoles.bloques[0]],
        })
        .expect(200);

      const respuesta = await como('docente').post(
        `/proyectos-docentes/${proyecto}/calendario`,
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        creadas: 0,
        retiradas: 3,
        conservadas: 1,
        total: 5,
      });
      const despues = await prisma.sesion_clase.findUniqueOrThrow({
        where: { id: diligenciada.id },
      });
      expect(despues).toMatchObject({ estado: 'registrada', semana: 1 });
    });

    it('el administrador también puede generarlo', async () => {
      const respuesta = await como('administrador').post(
        `/proyectos-docentes/${proyecto}/calendario`,
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        creadas: 0,
        retiradas: 0,
        total: 5,
      });
    });

    it('un docente que no está asignado no lo genera (404)', async () => {
      const respuesta = await como('otroDocente').post(
        `/proyectos-docentes/${proyecto}/calendario`,
      );

      expect(respuesta.status).toBe(404);
    });

    it('sin festivos del año, genera sin marcas, advierte y avisa al administrador (p3)', async () => {
      await como('docente')
        .put(
          `/proyectos-docentes/${proyectoSinFestivos}/horario`,
          lunesYMiercoles,
        )
        .expect(200);

      const respuesta = await como('docente').post(
        `/proyectos-docentes/${proyectoSinFestivos}/calendario`,
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ creadas: 8, festivos: 0 });
      expect(respuesta.body.advertencias).toEqual([
        mensajeSinFestivos(ANIO_SIN_FESTIVOS),
      ]);
      const avisos = await prisma.notificacion.findMany({
        where: {
          id_usuario: usuarios.administrador,
          entidad: 'dia_festivo',
          id_entidad: ANIO_SIN_FESTIVOS,
        },
      });
      expect(avisos).toHaveLength(1);

      // La consulta del calendario repite la advertencia, sin volver a avisar.
      const calendario = await como('docente').get(
        `/proyectos-docentes/${proyectoSinFestivos}/calendario`,
      );
      expect(calendario.body.advertencias).toEqual([
        mensajeSinFestivos(ANIO_SIN_FESTIVOS),
      ]);
      await como('docente')
        .post(`/proyectos-docentes/${proyectoSinFestivos}/calendario`)
        .expect(200);
      expect(
        await prisma.notificacion.count({
          where: {
            id_usuario: usuarios.administrador,
            entidad: 'dia_festivo',
            id_entidad: ANIO_SIN_FESTIVOS,
          },
        }),
      ).toBe(1);
    });

    it('quien es Docente y Departamento ve el proyecto ajeno, pero no lo cambia (403)', async () => {
      // Pasa el decorador por su rol Docente y ve el proyecto por su rol Departamento: el
      // servicio comprueba el alcance, que no es su proyecto (`proyecto_docente_docente`).
      await prisma.usuario_rol.create({
        data: {
          id_usuario: usuarios.otroDocente,
          id_rol: await rolPorNombre(ROL.departamento),
          id_programa: programa,
          activo: true,
        },
      });

      const consulta = await como('otroDocente').get(
        `/proyectos-docentes/${proyecto}/calendario`,
      );
      const generar = await como('otroDocente').post(
        `/proyectos-docentes/${proyecto}/calendario`,
      );

      expect(consulta.status).toBe(200);
      expect(consulta.body.puedeEditar).toBe(false);
      expect(generar.status).toBe(403);
      expect(generar.body.mensaje).toBe(MENSAJE_SOLO_DOCENTE_ASIGNADO);
    });
  });
});
