import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PARAMETRO } from '../src/common/parametros/parametros.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { NOTIFICACION } from '../src/notificaciones/notificaciones.service.js';
import {
  diasEntre,
  fechaDeHoy,
  PARAMETRO_UMBRAL_ALERTA,
  sumarDias,
} from '../src/sesiones/alertas.js';
import {
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_SIN_HORARIO,
  MENSAJE_SOLO_DOCENTE_ASIGNADO,
  mensajeSinFestivos,
  NOTIFICACION_FESTIVOS_FALTANTES,
} from '../src/sesiones/sesiones.service.js';
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
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed: usa períodos
// propios en 2031 y 2032, años que el seed no carga, y crea los catálogos que falten.
describe('Calendario de sesiones (e2e) · RF-19, HU-08-02 y HU-08-03', () => {
  const sufijo = `${Date.now()}`;
  /** Un margen de un minuto cubre la diferencia de reloj con MySQL y el redondeo a segundos. */
  const inicioPrueba = new Date(Date.now() - 60_000);
  const contrasena = 'Clave-e2e-de-prueba-1';
  /** Año sin festivos parametrizados (excepción p3). */
  const ANIO_SIN_FESTIVOS = 2031;

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const matriz = matrizDePrueba();
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
    patch: (ruta: string, cuerpo: object) =>
      http()
        .patch(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`)
        .send(cuerpo),
  });

  const lunesYMiercoles = {
    bloques: [
      { diaSemana: 1, horaInicio: '07:00', horaFin: '09:00' },
      { diaSemana: 3, horaInicio: '14:00', horaFin: '16:00' },
    ],
  };

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

  async function crearPeriodo(
    inicio: string,
    fin: string,
    cerrado = false,
    numeroSemanas: number | null = 4,
  ): Promise<number> {
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `E2E-${creados.periodos.length}-${sufijo}`,
        fecha_inicio: new Date(inicio),
        fecha_fin: new Date(fin),
        numero_semanas: numeroSemanas,
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
        id_plan_estudio: await planDePrueba(prisma, programa),
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
    await asegurarCatalogoDePermisos(prisma, matriz);
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
      // Avisos de años sin festivos (RF-19, p3) que generó esta prueba: los de sus usuarios y,
      // para los administradores que ya existían, solo los creados durante la prueba. Sin
      // festivos cargados (la CI no corre el seed), también hay avisos del año en curso.
      await prisma.notificacion.deleteMany({
        where: {
          entidad: 'dia_festivo',
          OR: [
            { id_usuario: { in: creados.usuarios } },
            { created_at: { gte: inicioPrueba } },
          ],
        },
      });
      // Recordatorios de sesiones (HU-13-02): los de sus usuarios y los que el envío de la
      // prueba dejó a otros docentes de la base, que también tenían pendientes.
      await prisma.notificacion.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            {
              created_at: { gte: inicioPrueba },
              tipo_notificacion: {
                codigo: {
                  in: [
                    NOTIFICACION.sesionVencida,
                    NOTIFICACION.sesionPorVencer,
                  ],
                },
              },
            },
          ],
        },
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
      await prisma.dia_festivo.deleteMany({
        where: { id: { in: creados.festivos } },
      });
      await prisma.tipo_notificacion.deleteMany({
        where: { id: { in: creados.tiposNotificacion } },
      });
      await prisma.tipo_sesion.deleteMany({
        where: { id: { in: creados.tiposSesion } },
      });
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
      await borrarCatalogoDePrueba(prisma, matriz);
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
      // RF-29 con AuditoriaService: el usuario y la IP salen del contexto de la petición.
      const auditoria = await prisma.auditoria.findFirst({
        where: {
          accion: 'actualizar',
          tabla_afectada: 'proyecto_docente',
          id_registro: proyecto,
        },
      });
      expect(auditoria?.id_usuario).toBe(usuarios.docente);
      expect(auditoria?.ip).toBeTruthy();
      expect(auditoria?.valor_nuevo).toEqual({
        horario: lunesYMiercoles.bloques,
      });
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

  describe('calendario con receso institucional (Acuerdo 46 de 2026)', () => {
    // Período propio en 2033, con sus propios festivos, para no depender del seed: seis
    // semanas calendario, un festivo de ley el lunes 8 de agosto y una semana de receso del 22
    // al 27 de agosto (de lunes a sábado), con 5 semanas de clase.
    let proyectoReceso: number;

    beforeAll(async () => {
      const periodo = await crearPeriodo('2033-08-01', '2033-09-10', false, 5);
      const festivos = [
        { fecha: '2033-08-08', nombre: 'Festivo de ley E2E', origen: 'ley' },
        ...[22, 23, 24, 25, 26, 27].map((dia) => ({
          fecha: `2033-08-${dia}`,
          nombre: 'Receso E2E',
          origen: 'institucional',
        })),
      ];
      for (const festivo of festivos) {
        const creado = await prisma.dia_festivo.create({
          data: {
            fecha: new Date(festivo.fecha),
            nombre: festivo.nombre,
            anio: 2033,
            origen: festivo.origen,
          },
        });
        creados.festivos.push(creado.id);
      }
      proyectoReceso = await crearProyecto(periodo, 'REC');
      await como('docente')
        .put(`/proyectos-docentes/${proyectoReceso}/horario`, {
          bloques: [lunesYMiercoles.bloques[0]],
        })
        .expect(200);
    });

    it('no genera sesiones en el receso ni lo cuenta, y marca el festivo suelto', async () => {
      const generar = await como('docente').post(
        `/proyectos-docentes/${proyectoReceso}/calendario`,
      );

      expect(generar.status).toBe(200);
      expect(generar.body).toMatchObject({
        creadas: 5,
        festivos: 1,
        total: 5,
        advertencias: [],
      });
      const calendario = await como('docente').get(
        `/proyectos-docentes/${proyectoReceso}/calendario`,
      );
      const sesiones = calendario.body.elementos as Array<{
        fecha: string;
        semana: number;
        tipo: { codigo: string } | null;
        festivo: string | null;
      }>;
      expect(
        sesiones.map((sesion) => [
          sesion.fecha,
          sesion.semana,
          sesion.tipo?.codigo,
        ]),
      ).toEqual([
        ['2033-08-01', 1, 'clase'],
        ['2033-08-08', 2, 'festivo'],
        ['2033-08-15', 3, 'clase'],
        ['2033-08-29', 4, 'clase'],
        ['2033-09-05', 5, 'clase'],
      ]);
      expect(sesiones[1].festivo).toBe('Festivo de ley E2E');
      expect(calendario.body.recesos).toEqual([
        { desde: '2033-08-22', hasta: '2033-08-27' },
      ]);
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
      // Borrado lógico: los miércoles vacíos siguen en la base, inactivos.
      expect(
        await prisma.sesion_clase.count({
          where: { id_proyecto_docente: proyecto, estado: 'retirada' },
        }),
      ).toBe(3);
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

  describe('sesiones vencidas y por vencer (RF-23, HU-08-07 y HU-08-08)', () => {
    /** Umbral que usa esta prueba, distinto del valor inicial (2) para probar que se lee. */
    // Más de una semana: aunque la base tenga una semana de receso cerca de hoy (sin
    // sesiones, Acuerdo 46), siempre quedan sesiones por vencer dentro del umbral.
    const UMBRAL = 9;
    const hoy = fechaDeHoy();
    let parametroAnterior: string | null | undefined;
    let proyectoAlertas: number;
    let proyectoAlertasCerrado: number;
    let periodoAlertasCerrado: number;
    let idFestivo: number;
    let idDiligenciada: number;

    type SesionRespuesta = {
      id: number;
      fecha: string;
      alerta: string | null;
      diasAtraso: number | null;
      diasRestantes: number | null;
    };

    const todosLosDias = {
      bloques: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaInicio: '07:00',
        horaFin: '09:00',
      })),
    };

    beforeAll(async () => {
      const parametro = await prisma.parametro_sistema.findUnique({
        where: { clave: PARAMETRO_UMBRAL_ALERTA },
      });
      parametroAnterior = parametro ? parametro.valor : undefined;
      await prisma.parametro_sistema.upsert({
        where: { clave: PARAMETRO_UMBRAL_ALERTA },
        create: {
          clave: PARAMETRO_UMBRAL_ALERTA,
          valor: String(UMBRAL),
          tipo_dato: 'entero',
        },
        update: { valor: String(UMBRAL) },
      });

      // Período abierto de tres semanas antes a tres semanas después de hoy, clase de lunes a
      // sábado. Sin tope de semanas, para que el calendario llegue hasta la fecha final.
      const periodoAbierto = await crearPeriodo(
        sumarDias(hoy, -21),
        sumarDias(hoy, 21),
        false,
        null,
      );
      proyectoAlertas = await crearProyecto(periodoAbierto, 'ALE');
      await como('docente')
        .put(`/proyectos-docentes/${proyectoAlertas}/horario`, todosLosDias)
        .expect(200);
      await como('docente')
        .post(`/proyectos-docentes/${proyectoAlertas}/calendario`)
        .expect(200);
      // Sin depender de los festivos que haya en la base: todas son clase, salvo una que se
      // marca festivo a propósito. Otra se marca diligenciada, como lo hará el registro de
      // clase (HU-08-04).
      const tipoClase = await prisma.tipo_sesion.findUniqueOrThrow({
        where: { codigo: 'clase' },
      });
      const tipoFestivo = await prisma.tipo_sesion.findUniqueOrThrow({
        where: { codigo: 'festivo' },
      });
      await prisma.sesion_clase.updateMany({
        where: { id_proyecto_docente: proyectoAlertas },
        data: { id_tipo_sesion: tipoClase.id, id_dia_festivo: null },
      });
      const pasadas = await prisma.sesion_clase.findMany({
        where: {
          id_proyecto_docente: proyectoAlertas,
          fecha: { lt: new Date(hoy) },
        },
        orderBy: { fecha: 'desc' },
        take: 2,
      });
      [idFestivo, idDiligenciada] = pasadas.map((sesion) => sesion.id);
      await prisma.sesion_clase.update({
        where: { id: idFestivo },
        data: { id_tipo_sesion: tipoFestivo.id },
      });
      await prisma.sesion_clase.update({
        where: { id: idDiligenciada },
        data: {
          estado: 'registrada',
          fecha_registro: new Date(),
          id_registrado_por: usuarios.docente,
        },
      });

      // Período ya terminado: se genera abierto y luego se cierra (excepción p4).
      periodoAlertasCerrado = await crearPeriodo(
        sumarDias(hoy, -50),
        sumarDias(hoy, -30),
        false,
        null,
      );
      proyectoAlertasCerrado = await crearProyecto(
        periodoAlertasCerrado,
        'ALC',
      );
      await como('docente')
        .put(
          `/proyectos-docentes/${proyectoAlertasCerrado}/horario`,
          lunesYMiercoles,
        )
        .expect(200);
      await como('docente')
        .post(`/proyectos-docentes/${proyectoAlertasCerrado}/calendario`)
        .expect(200);
      await prisma.sesion_clase.updateMany({
        where: { id_proyecto_docente: proyectoAlertasCerrado },
        data: { id_tipo_sesion: tipoClase.id, id_dia_festivo: null },
      });
      await prisma.periodo_academico.update({
        where: { id: periodoAlertasCerrado },
        data: { cerrado: true },
      });
    }, 60_000);

    afterAll(async () => {
      if (!prisma) {
        return;
      }
      if (parametroAnterior === undefined) {
        await prisma.parametro_sistema.deleteMany({
          where: { clave: PARAMETRO_UMBRAL_ALERTA },
        });
      } else {
        await prisma.parametro_sistema.update({
          where: { clave: PARAMETRO_UMBRAL_ALERTA },
          data: { valor: parametroAnterior },
        });
      }
    });

    it('marca vencidas con sus días de atraso y por vencer dentro del umbral, en menos de 3 s', async () => {
      const inicio = Date.now();
      const respuesta = await como('docente').get(
        `/proyectos-docentes/${proyectoAlertas}/calendario`,
      );
      const duracion = Date.now() - inicio;

      expect(respuesta.status).toBe(200);
      expect(duracion).toBeLessThan(3000);
      expect(respuesta.body).toMatchObject({ hoy, umbralDias: UMBRAL });
      const sesiones = respuesta.body.elementos as SesionRespuesta[];
      for (const sesion of sesiones) {
        if (sesion.id === idFestivo || sesion.id === idDiligenciada) {
          // Festivo (excepción p2) y diligenciada: sin alerta.
          expect(sesion.alerta).toBeNull();
        } else if (sesion.fecha < hoy) {
          expect(sesion).toMatchObject({
            alerta: 'vencida',
            diasAtraso: diasEntre(sesion.fecha, hoy),
          });
        } else if (diasEntre(hoy, sesion.fecha) <= UMBRAL) {
          expect(sesion).toMatchObject({
            alerta: 'por_vencer',
            diasRestantes: diasEntre(hoy, sesion.fecha),
          });
        } else {
          expect(sesion.alerta).toBeNull();
        }
      }
      const pasadas = sesiones.filter((sesion) => sesion.fecha < hoy).length;
      const porVencer = sesiones.filter(
        (sesion) =>
          sesion.fecha >= hoy && diasEntre(hoy, sesion.fecha) <= UMBRAL,
      ).length;
      expect(respuesta.body.resumen).toEqual({
        vencidas: pasadas - 2,
        porVencer,
        incumplidas: 0,
        mayorAtraso: Math.max(
          ...sesiones
            .filter((sesion) => sesion.alerta === 'vencida')
            .map((sesion) => sesion.diasAtraso ?? 0),
        ),
      });
      expect(respuesta.body.resumen.vencidas).toBeGreaterThan(10);
      expect(porVencer).toBeGreaterThan(0);
    });

    it('el Departamento ve las mismas alertas en el calendario', async () => {
      const docente = await como('docente').get(
        `/proyectos-docentes/${proyectoAlertas}/calendario`,
      );
      const departamento = await como('departamento').get(
        `/proyectos-docentes/${proyectoAlertas}/calendario`,
      );

      expect(departamento.status).toBe(200);
      expect(departamento.body.resumen).toEqual(docente.body.resumen);
    });

    it('con el período cerrado, las vencidas quedan incumplidas y no suman días (excepción p4)', async () => {
      const respuesta = await como('docente').get(
        `/proyectos-docentes/${proyectoAlertasCerrado}/calendario`,
      );

      expect(respuesta.status).toBe(200);
      const fin = sumarDias(hoy, -30);
      const sesiones = respuesta.body.elementos as SesionRespuesta[];
      expect(sesiones.length).toBeGreaterThan(0);
      for (const sesion of sesiones) {
        expect(sesion).toMatchObject({
          alerta: 'incumplida',
          diasAtraso: diasEntre(sesion.fecha, fin),
        });
      }
      expect(respuesta.body.resumen).toMatchObject({
        vencidas: 0,
        porVencer: 0,
        incumplidas: sesiones.length,
      });
    });

    it('el panel del docente cuenta sus vencidas y por vencer, sin los períodos cerrados (p5)', async () => {
      const calendario = await como('docente').get(
        `/proyectos-docentes/${proyectoAlertas}/calendario`,
      );
      const respuesta = await como('docente').get('/sesiones/pendientes');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        hoy,
        umbralDias: UMBRAL,
        vencidas: calendario.body.resumen.vencidas,
        porVencer: calendario.body.resumen.porVencer,
        total: 1,
      });
      expect(respuesta.body.elementos).toEqual([
        expect.objectContaining({
          idProyectoDocente: proyectoAlertas,
          vencidas: calendario.body.resumen.vencidas,
          porVencer: calendario.body.resumen.porVencer,
          mayorAtraso: calendario.body.resumen.mayorAtraso,
        }),
      ]);
    });

    it('el panel de pendientes es solo del docente (403 para Departamento y Estudiante)', async () => {
      await como('departamento').get('/sesiones/pendientes').expect(403);
      await como('estudiante').get('/sesiones/pendientes').expect(403);
    });

    describe('recordatorio de sesiones pendientes y su configuración (RF-26, HU-13-02 y HU-13-04)', () => {
      const PERIODICIDAD = 7;
      let periodicidadAnterior: string | null | undefined;
      /** Estado de cada tipo antes de la prueba, para dejarlo igual. */
      const tiposAnteriores = new Map<string, boolean | null>();

      const avisosDe = (quien: string) =>
        prisma.notificacion.findMany({
          where: {
            id_usuario: usuarios[quien],
            tipo_notificacion: {
              codigo: {
                in: [NOTIFICACION.sesionVencida, NOTIFICACION.sesionPorVencer],
              },
            },
          },
          include: { tipo_notificacion: { select: { codigo: true } } },
        });

      beforeAll(async () => {
        const parametro = await prisma.parametro_sistema.findUnique({
          where: { clave: PARAMETRO.recordatorioSesionesDias },
        });
        periodicidadAnterior = parametro ? parametro.valor : undefined;
        await prisma.parametro_sistema.upsert({
          where: { clave: PARAMETRO.recordatorioSesionesDias },
          create: {
            clave: PARAMETRO.recordatorioSesionesDias,
            valor: String(PERIODICIDAD),
            tipo_dato: 'entero',
          },
          update: { valor: String(PERIODICIDAD) },
        });
        // La CI no corre el seed: los dos tipos del recordatorio pueden faltar.
        for (const codigo of [
          NOTIFICACION.sesionVencida,
          NOTIFICACION.sesionPorVencer,
        ]) {
          const tipo = await prisma.tipo_notificacion.findUnique({
            where: { codigo },
          });
          if (tipo) {
            tiposAnteriores.set(codigo, tipo.activo);
            await prisma.tipo_notificacion.update({
              where: { id: tipo.id },
              data: { activo: true },
            });
          } else {
            creados.tiposNotificacion.push(
              (
                await prisma.tipo_notificacion.create({
                  data: { codigo, nombre: codigo, activo: true },
                })
              ).id,
            );
          }
        }
      });

      afterAll(async () => {
        if (!prisma) {
          return;
        }
        for (const [codigo, activo] of tiposAnteriores) {
          await prisma.tipo_notificacion.update({
            where: { codigo },
            data: { activo },
          });
        }
        if (periodicidadAnterior === undefined) {
          await prisma.parametro_sistema.deleteMany({
            where: { clave: PARAMETRO.recordatorioSesionesDias },
          });
        } else {
          await prisma.parametro_sistema.update({
            where: { clave: PARAMETRO.recordatorioSesionesDias },
            data: { valor: periodicidadAnterior },
          });
        }
      });

      it('solo el administrador envía los recordatorios a mano y configura los tipos', async () => {
        await como('docente').post('/recordatorios/sesiones').expect(403);
        await como('departamento').post('/recordatorios/sesiones').expect(403);
        await como('docente').get('/notificaciones/tipos').expect(403);
        await como('docente')
          .patch(`/notificaciones/tipos/${NOTIFICACION.sesionVencida}`, {
            activo: false,
          })
          .expect(403);
        await http().post('/api/recordatorios/sesiones').expect(401);
      });

      it('le deja al docente un solo aviso con sus pendientes, que lleva al calendario del curso', async () => {
        const calendario = await como('docente').get(
          `/proyectos-docentes/${proyectoAlertas}/calendario`,
        );
        const { vencidas, porVencer } = calendario.body.resumen as {
          vencidas: number;
          porVencer: number;
        };

        const respuesta = await como('administrador')
          .post('/recordatorios/sesiones')
          .expect(200);

        expect(respuesta.body.periodicidadDias).toBe(PERIODICIDAD);
        expect(respuesta.body.enviados).toBeGreaterThanOrEqual(1);
        const avisos = await avisosDe('docente');
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toMatchObject({
          tipo_notificacion: { codigo: NOTIFICACION.sesionVencida },
          titulo: 'Tiene sesiones vencidas sin diligenciar',
          url_destino: `/proyectos-docentes/${proyectoAlertas}/calendario`,
          leida: false,
        });
        expect(avisos[0].mensaje).toContain(
          `Tiene ${vencidas} sesiones vencidas sin diligenciar y ${porVencer} ` +
            `${porVencer === 1 ? 'sesión' : 'sesiones'} por vencer en el curso:`,
        );
        // Sin proyectos, no hay nada que recordar.
        expect(await avisosDe('otroDocente')).toEqual([]);
      });

      it('no lo repite dentro de la periodicidad', async () => {
        const respuesta = await como('administrador')
          .post('/recordatorios/sesiones')
          .expect(200);

        expect(respuesta.body.omitidosPorPeriodicidad).toBeGreaterThanOrEqual(
          1,
        );
        expect(await avisosDe('docente')).toHaveLength(1);
      });

      it('lista los tipos con la periodicidad, y un tipo apagado deja de generar el aviso', async () => {
        const lista = await como('administrador')
          .get('/notificaciones/tipos')
          .expect(200);
        expect(lista.body.recordatorioSesionesDias).toBe(PERIODICIDAD);
        expect(lista.body.tipos).toContainEqual(
          expect.objectContaining({
            codigo: NOTIFICACION.sesionVencida,
            activo: true,
          }),
        );

        const apagado = await como('administrador')
          .patch(`/notificaciones/tipos/${NOTIFICACION.sesionVencida}`, {
            activo: false,
          })
          .expect(200);
        expect(apagado.body).toMatchObject({
          codigo: NOTIFICACION.sesionVencida,
          activo: false,
        });
        const auditado = await prisma.auditoria.findFirst({
          where: {
            tabla_afectada: 'tipo_notificacion',
            id_usuario: usuarios.administrador,
          },
        });
        expect(auditado?.valor_nuevo).toEqual({ activo: false });

        // Sin el aviso anterior, el docente volvería a recibirlo; con el tipo apagado, no.
        await prisma.notificacion.deleteMany({
          where: { id_usuario: usuarios.docente },
        });
        const respuesta = await como('administrador')
          .post('/recordatorios/sesiones')
          .expect(200);
        expect(respuesta.body.omitidosPorTipoInactivo).toBeGreaterThanOrEqual(
          1,
        );
        expect(await avisosDe('docente')).toEqual([]);

        await como('administrador')
          .patch(`/notificaciones/tipos/${NOTIFICACION.sesionVencida}`, {
            activo: true,
          })
          .expect(200);
      });

      it('rechaza un tipo que no existe o un cambio vacío', async () => {
        await como('administrador')
          .patch('/notificaciones/tipos/no_existe', { activo: false })
          .expect(404);
        await como('administrador')
          .patch(`/notificaciones/tipos/${NOTIFICACION.sesionVencida}`, {})
          .expect(400);
        await como('administrador')
          .patch(`/notificaciones/tipos/${NOTIFICACION.sesionVencida}`, {
            activo: 'tal vez',
          })
          .expect(400);
      });
    });

    it('un docente sin proyectos asignados no tiene pendientes', async () => {
      const respuesta = await como('otroDocente').get('/sesiones/pendientes');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        vencidas: 0,
        porVencer: 0,
        total: 0,
        elementos: [],
      });
    });
  });
});
