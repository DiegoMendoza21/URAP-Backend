import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { fechaDeHoy, sumarDias } from '../src/sesiones/alertas.js';
import {
  MENSAJE_AUSENTES_INVALIDOS,
  MENSAJE_CONFIRMAR_TODO_EL_GRUPO,
  MENSAJE_FECHA_FUTURA,
  MENSAJE_PERIODO_CERRADO_REGISTRO,
  MENSAJE_PROYECTO_NO_APROBADO,
  MENSAJE_TEMAS_INVALIDOS,
  mensajeTipoSinTema,
} from '../src/sesiones/registro-clase.service.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios (período alrededor de hoy, contenido programático, estudiantes y
// matrículas) y los borra al terminar. Funciona con o sin el seed.
// Estudiantes ficticios: nunca nombres ni documentos reales (Ley 1581 de 2012).
describe('Registro de clase (e2e) · RF-20 y RF-22, HU-08-04 y HU-09-02', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  /** Un minuto de margen para la diferencia de reloj con MySQL. */
  const inicioPrueba = new Date(Date.now() - 60_000);
  const hoy = fechaDeHoy();

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    tiposSesion: [] as number[],
    periodos: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    asignaturas: [] as number[],
    usuarios: [] as number[],
    proyectos: [] as number[],
    estudiantes: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  let programa: number;
  let idTipoClase: number;
  let idTipoFestivo: number;

  /** El curso principal: aprobado, con contenido programático y lista de tres estudiantes. */
  let proyecto: number;
  let proyectoSinLista: number;
  let proyectoNoAprobado: number;
  let proyectoCerrado: number;
  let proyectoOtro: number;
  /** Filas del contenido programático del curso principal: semanas 1 a 4 con tema, 5 vacía. */
  const contenido: Record<number, number> = {};
  let contenidoOtroProyecto: number;
  const matriculas: number[] = [];
  let matriculaRetirada: number;
  let matriculaOtroProyecto: number;

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
  const rutaSesion = (idProyecto: number, idSesion: number) =>
    `/proyectos-docentes/${idProyecto}/sesiones/${idSesion}`;

  async function rolPorNombre(nombre: string): Promise<number> {
    const existente = await prisma.rol.findUnique({ where: { nombre } });
    if (existente) {
      return existente.id;
    }
    const rol = await prisma.rol.create({ data: { nombre, activo: true } });
    creados.roles.push(rol.id);
    return rol.id;
  }

  async function estadoPorCodigo(codigo: string): Promise<number> {
    const existente = await prisma.estado_proyecto.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const estado = await prisma.estado_proyecto.create({
      data: { codigo, nombre: codigo },
    });
    creados.estados.push(estado.id);
    return estado.id;
  }

  async function tipoPorCodigo(
    codigo: string,
    exigeTema: boolean,
  ): Promise<number> {
    const existente = await prisma.tipo_sesion.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const tipo = await prisma.tipo_sesion.create({
      data: {
        codigo,
        nombre: codigo === 'festivo' ? 'Festivo' : 'Clase',
        exige_tema: exigeTema,
        cuenta_como_dictada: exigeTema,
      },
    });
    creados.tiposSesion.push(tipo.id);
    return tipo.id;
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
        codigo: `E2E-RC-${creados.periodos.length}-${sufijo}`,
        fecha_inicio: new Date(inicio),
        fecha_fin: new Date(fin),
        numero_semanas: null,
        activo: false,
        cerrado,
      },
    });
    creados.periodos.push(periodo.id);
    return periodo.id;
  }

  /** Proyecto con su calendario de lunes a sábado, generado por la API (RF-19). */
  async function crearProyecto(
    idPeriodo: number,
    codigo: string,
    codigoEstado: string,
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
        id_estado: await estadoPorCodigo(codigoEstado),
        origen: 'manual',
        proyecto_docente_docente: {
          create: [
            { id_usuario: usuarios.docente, responsable: true, orden: 1 },
          ],
        },
      },
    });
    creados.proyectos.push(creado.id);
    await como('docente')
      .put(`/proyectos-docentes/${creado.id}/horario`, {
        bloques: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
          diaSemana,
          horaInicio: '07:00',
          horaFin: '09:00',
        })),
      })
      .expect(200);
    await como('docente')
      .post(`/proyectos-docentes/${creado.id}/calendario`)
      .expect(200);
    // Sin depender de los festivos que haya en la base: todas las sesiones son de clase.
    await prisma.sesion_clase.updateMany({
      where: { id_proyecto_docente: creado.id },
      data: { id_tipo_sesion: idTipoClase, id_dia_festivo: null },
    });
    return creado.id;
  }

  async function sesionDe(
    idProyecto: number,
    cual: 'pasada' | 'anterior' | 'futura',
  ): Promise<{ id: number; semana: number | null }> {
    const pasadas = cual !== 'futura';
    const sesiones = await prisma.sesion_clase.findMany({
      where: {
        id_proyecto_docente: idProyecto,
        estado: { not: 'retirada' },
        fecha: pasadas ? { lt: new Date(hoy) } : { gt: new Date(hoy) },
      },
      orderBy: { fecha: pasadas ? 'desc' : 'asc' },
      take: 2,
      select: { id: true, semana: true },
    });
    return cual === 'anterior' ? sesiones[1] : sesiones[0];
  }

  async function crearEstudiante(
    n: number,
    idProyecto: number,
    estado: 'matriculado' | 'retirado',
  ): Promise<number> {
    const estudiante = await prisma.estudiante.create({
      data: {
        identificacion: `E2E-RC-${sufijo.slice(-9)}-${n}`,
        nombres: 'Estudiante',
        apellidos: `Ficticio ${n}`,
        id_programa: programa,
      },
    });
    creados.estudiantes.push(estudiante.id);
    const matricula = await prisma.matricula.create({
      data: {
        id_proyecto_docente: idProyecto,
        id_estudiante: estudiante.id,
        estado,
        fecha_carga: new Date(),
      },
    });
    return matricula.id;
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

    idTipoClase = await tipoPorCodigo('clase', true);
    idTipoFestivo = await tipoPorCodigo('festivo', false);

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E RC ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const creadoPrograma = await prisma.programa.create({
      data: { id_facultad: facultad.id, nombre: `Programa E2E RC ${sufijo}` },
    });
    creados.programas.push(creadoPrograma.id);
    programa = creadoPrograma.id;

    await crearUsuario('docente', ROL.docente, programa);
    await crearUsuario('otroDocente', ROL.docente, programa);
    await crearUsuario('departamento', ROL.departamento, programa);
    await crearUsuario('administrador', ROL.administrador, null);
    await crearUsuario('estudiante', ROL.estudiante, programa);

    // Dos semanas antes y dos después de hoy: hay sesiones pasadas y futuras.
    const periodo = await crearPeriodo(sumarDias(hoy, -14), sumarDias(hoy, 14));
    proyecto = await crearProyecto(periodo, 'RC', 'aprobado');
    proyectoSinLista = await crearProyecto(periodo, 'RCS', 'en_ejecucion');
    proyectoNoAprobado = await crearProyecto(
      periodo,
      'RCN',
      'en_diligenciamiento',
    );
    proyectoOtro = await crearProyecto(periodo, 'RCO', 'aprobado');
    const periodoCerrado = await crearPeriodo(
      sumarDias(hoy, -14),
      sumarDias(hoy, 14),
    );
    proyectoCerrado = await crearProyecto(periodoCerrado, 'RCC', 'aprobado');
    await prisma.periodo_academico.update({
      where: { id: periodoCerrado },
      data: { cerrado: true },
    });

    for (const semana of [1, 2, 3, 4, 5]) {
      const fila = await prisma.contenido_programatico.create({
        data: {
          id_proyecto_docente: proyecto,
          semana,
          tema: semana === 5 ? null : `Tema E2E de la semana ${semana}`,
        },
      });
      contenido[semana] = fila.id;
    }
    for (const id of [proyectoSinLista, proyectoNoAprobado, proyectoCerrado]) {
      await prisma.contenido_programatico.create({
        data: { id_proyecto_docente: id, semana: 1, tema: 'Tema E2E' },
      });
    }
    contenidoOtroProyecto = (
      await prisma.contenido_programatico.create({
        data: {
          id_proyecto_docente: proyectoOtro,
          semana: 1,
          tema: 'Tema de otro curso',
        },
      })
    ).id;

    matriculas.push(await crearEstudiante(1, proyecto, 'matriculado'));
    matriculas.push(await crearEstudiante(2, proyecto, 'matriculado'));
    matriculaRetirada = await crearEstudiante(3, proyecto, 'retirado');
    matriculaOtroProyecto = await crearEstudiante(
      4,
      proyectoOtro,
      'matriculado',
    );
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      const sesiones = await prisma.sesion_clase.findMany({
        where: deProyectos,
        select: { id: true },
      });
      const deSesiones = { id_sesion: { in: sesiones.map(({ id }) => id) } };
      await prisma.inasistencia.deleteMany({ where: deSesiones });
      await prisma.sesion_tema.deleteMany({ where: deSesiones });
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.notificacion.deleteMany({
        where: {
          entidad: 'dia_festivo',
          OR: [
            { id_usuario: { in: creados.usuarios } },
            { created_at: { gte: inicioPrueba } },
          ],
        },
      });
      await prisma.sesion_clase.deleteMany({ where: deProyectos });
      await prisma.horario_curso.deleteMany({ where: deProyectos });
      await prisma.contenido_programatico.deleteMany({ where: deProyectos });
      await prisma.matricula.deleteMany({ where: deProyectos });
      await prisma.estudiante.deleteMany({
        where: { id: { in: creados.estudiantes } },
      });
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
      await prisma.estado_proyecto.deleteMany({
        where: { id: { in: creados.estados } },
      });
      await prisma.tipo_sesion.deleteMany({
        where: { id: { in: creados.tiposSesion } },
      });
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
    }
    await app?.close();
  });

  it('presenta los temas del contenido programático y la lista del curso, en menos de 3 s', async () => {
    const sesion = await sesionDe(proyecto, 'pasada');
    const inicio = Date.now();
    const respuesta = await como('docente').get(
      rutaSesion(proyecto, sesion.id),
    );
    const duracion = Date.now() - inicio;

    expect(respuesta.status).toBe(200);
    expect(duracion).toBeLessThan(3000);
    expect(respuesta.body).toMatchObject({
      idProyectoDocente: proyecto,
      puedeRegistrar: true,
      motivoNoRegistrable: null,
      numeroAusentes: 0,
      observaciones: null,
      registro: null,
    });
    // RF-20, p3: solo las semanas con tema.
    expect(
      (respuesta.body.temas as Array<{ idContenido: number }>).map(
        (tema) => tema.idContenido,
      ),
    ).toEqual([1, 2, 3, 4].map((semana) => contenido[semana]));
    // RF-22, p3: los matriculados, sin el retirado.
    expect(respuesta.body.asistencia).toMatchObject({
      listaCargada: true,
      totalMatriculados: 2,
    });
    expect(
      (
        respuesta.body.asistencia.estudiantes as Array<{ idMatricula: number }>
      ).map((estudiante) => estudiante.idMatricula),
    ).toEqual(matriculas);
  });

  it('registra la clase con temas, ausentes y observaciones, y deja de salir vencida (RF-23)', async () => {
    const sesion = await sesionDe(proyecto, 'pasada');
    const inicio = Date.now();
    const respuesta = await como('docente').put(
      `${rutaSesion(proyecto, sesion.id)}/registro`,
      {
        idsContenido: [contenido[1], contenido[2]],
        ausentes: [matriculas[0]],
        observaciones: 'Taller en grupos.',
      },
    );
    const duracion = Date.now() - inicio;

    expect(respuesta.status).toBe(200);
    expect(duracion).toBeLessThan(3000);
    expect(respuesta.body).toMatchObject({
      numeroAusentes: 1,
      observaciones: 'Taller en grupos.',
      registro: { registradoPor: 'Usuario docente E2E' },
      sesion: { diligenciada: true, alerta: null, numeroTemas: 2 },
    });
    expect(
      (respuesta.body.temas as Array<{ seleccionado: boolean }>).filter(
        (tema) => tema.seleccionado,
      ),
    ).toHaveLength(2);

    const calendario = await como('docente').get(
      `/proyectos-docentes/${proyecto}/calendario`,
    );
    const enCalendario = (
      calendario.body.elementos as Array<Record<string, unknown>>
    ).find((fila) => fila.id === sesion.id);
    expect(enCalendario).toMatchObject({
      diligenciada: true,
      alerta: null,
      numeroTemas: 2,
      numeroAusentes: 1,
      estado: 'registrada',
    });
  });

  it('corrige el registro sin cambiar quién ni cuándo lo registró', async () => {
    const sesion = await sesionDe(proyecto, 'pasada');
    const antes = await prisma.sesion_clase.findUniqueOrThrow({
      where: { id: sesion.id },
    });

    const respuesta = await como('docente').put(
      `${rutaSesion(proyecto, sesion.id)}/registro`,
      { idsContenido: [contenido[3]], ausentes: [], observaciones: '' },
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      numeroAusentes: 0,
      observaciones: null,
      sesion: { numeroTemas: 1 },
    });
    const despues = await prisma.sesion_clase.findUniqueOrThrow({
      where: { id: sesion.id },
    });
    expect(despues.fecha_registro).toEqual(antes.fecha_registro);
    expect(despues.id_registrado_por).toBe(usuarios.docente);
    expect(
      await prisma.auditoria.count({
        where: {
          tabla_afectada: 'sesion_clase',
          id_registro: sesion.id,
          accion: { in: ['registrar', 'actualizar'] },
        },
      }),
    ).toBe(2);
  });

  it('no registra una sesión de fecha futura (RF-20, excepción p6)', async () => {
    const sesion = await sesionDe(proyecto, 'futura');

    const detalle = await como('docente').get(rutaSesion(proyecto, sesion.id));
    const registro = await como('docente').put(
      `${rutaSesion(proyecto, sesion.id)}/registro`,
      { idsContenido: [contenido[1]] },
    );

    expect(detalle.body).toMatchObject({
      puedeRegistrar: false,
      motivoNoRegistrable: MENSAJE_FECHA_FUTURA,
    });
    expect(registro.status).toBe(409);
    expect(registro.body.mensaje).toBe(MENSAJE_FECHA_FUTURA);
  });

  it.each([
    ['sin temas', () => ({ idsContenido: [] }), 400, undefined],
    [
      'un tema de otro curso',
      () => ({ idsContenido: [contenidoOtroProyecto] }),
      400,
      MENSAJE_TEMAS_INVALIDOS,
    ],
    [
      'una semana sin tema',
      () => ({ idsContenido: [contenido[5]] }),
      400,
      MENSAJE_TEMAS_INVALIDOS,
    ],
    [
      'un estudiante de otro curso',
      () => ({
        idsContenido: [contenido[1]],
        ausentes: [matriculaOtroProyecto],
      }),
      400,
      MENSAJE_AUSENTES_INVALIDOS,
    ],
    [
      'un estudiante retirado',
      () => ({
        idsContenido: [contenido[1]],
        ausentes: [matriculaRetirada],
      }),
      400,
      MENSAJE_AUSENTES_INVALIDOS,
    ],
  ])('rechaza %s', async (_caso, cuerpo, estado, mensaje) => {
    const sesion = await sesionDe(proyecto, 'anterior');

    const respuesta = await como('docente').put(
      `${rutaSesion(proyecto, sesion.id)}/registro`,
      cuerpo(),
    );

    expect(respuesta.status).toBe(estado);
    if (mensaje) {
      expect(respuesta.body.mensaje).toBe(mensaje);
    }
  });

  it('pide confirmación si se marca a todo el grupo (RF-22, excepción p6)', async () => {
    const sesion = await sesionDe(proyecto, 'anterior');
    const ruta = `${rutaSesion(proyecto, sesion.id)}/registro`;

    const sinConfirmar = await como('docente').put(ruta, {
      idsContenido: [contenido[1]],
      ausentes: matriculas,
    });
    const confirmado = await como('docente').put(ruta, {
      idsContenido: [contenido[1]],
      ausentes: matriculas,
      confirmarTodoElGrupo: true,
    });

    expect(sinConfirmar.status).toBe(409);
    expect(sinConfirmar.body.mensaje).toBe(MENSAJE_CONFIRMAR_TODO_EL_GRUPO);
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.numeroAusentes).toBe(2);
  });

  it('sin lista cargada, registra la inasistencia en las observaciones (RF-22, excepción p3)', async () => {
    const sesion = await sesionDe(proyectoSinLista, 'pasada');
    const contenidoSinLista =
      await prisma.contenido_programatico.findFirstOrThrow({
        where: { id_proyecto_docente: proyectoSinLista },
      });

    const detalle = await como('docente').get(
      rutaSesion(proyectoSinLista, sesion.id),
    );
    const registro = await como('docente').put(
      `${rutaSesion(proyectoSinLista, sesion.id)}/registro`,
      {
        idsContenido: [contenidoSinLista.id],
        observaciones: 'No asistieron tres estudiantes.',
      },
    );

    expect(detalle.body.asistencia).toEqual({
      listaCargada: false,
      totalMatriculados: 0,
      estudiantes: [],
    });
    expect(registro.status).toBe(200);
    expect(registro.body).toMatchObject({
      observaciones: 'No asistieron tres estudiantes.',
      numeroAusentes: 0,
    });
  });

  it('exige el proyecto aprobado o en ejecución (RF-20, precondición)', async () => {
    const sesion = await sesionDe(proyectoNoAprobado, 'pasada');
    const tema = await prisma.contenido_programatico.findFirstOrThrow({
      where: { id_proyecto_docente: proyectoNoAprobado },
    });

    const detalle = await como('docente').get(
      rutaSesion(proyectoNoAprobado, sesion.id),
    );
    const registro = await como('docente').put(
      `${rutaSesion(proyectoNoAprobado, sesion.id)}/registro`,
      { idsContenido: [tema.id] },
    );

    expect(detalle.body.motivoNoRegistrable).toBe(MENSAJE_PROYECTO_NO_APROBADO);
    expect(registro.status).toBe(409);
    expect(registro.body.mensaje).toBe(MENSAJE_PROYECTO_NO_APROBADO);
  });

  it('no registra con el período cerrado', async () => {
    const sesion = await sesionDe(proyectoCerrado, 'pasada');
    const tema = await prisma.contenido_programatico.findFirstOrThrow({
      where: { id_proyecto_docente: proyectoCerrado },
    });

    const registro = await como('docente').put(
      `${rutaSesion(proyectoCerrado, sesion.id)}/registro`,
      { idsContenido: [tema.id] },
    );

    expect(registro.status).toBe(409);
    expect(registro.body.mensaje).toBe(MENSAJE_PERIODO_CERRADO_REGISTRO);
  });

  it('una sesión marcada festivo no se registra con temas hasta cambiarle el tipo', async () => {
    const sesion = await sesionDe(proyectoOtro, 'pasada');
    await prisma.sesion_clase.update({
      where: { id: sesion.id },
      data: { id_tipo_sesion: idTipoFestivo },
    });

    const registro = await como('docente').put(
      `${rutaSesion(proyectoOtro, sesion.id)}/registro`,
      { idsContenido: [contenidoOtroProyecto] },
    );

    expect(registro.status).toBe(409);
    expect(registro.body.mensaje).toBe(mensajeTipoSinTema('Festivo'));
  });

  describe('permisos y datos personales (Ley 1581)', () => {
    it('el Departamento ve los temas y el número de ausentes, pero no la lista ni las observaciones', async () => {
      const sesion = await sesionDe(proyecto, 'anterior');

      const detalle = await como('departamento').get(
        rutaSesion(proyecto, sesion.id),
      );
      const registro = await como('departamento').put(
        `${rutaSesion(proyecto, sesion.id)}/registro`,
        { idsContenido: [contenido[1]] },
      );

      expect(detalle.status).toBe(200);
      expect(detalle.body).toMatchObject({
        puedeRegistrar: false,
        motivoNoRegistrable: null,
        asistencia: null,
        observaciones: null,
        numeroAusentes: 2,
      });
      expect(registro.status).toBe(403);
    });

    it('un docente que no está asignado no ve la sesión (404)', async () => {
      const sesion = await sesionDe(proyecto, 'pasada');

      await como('otroDocente')
        .get(rutaSesion(proyecto, sesion.id))
        .expect(404);
    });

    it('la sesión de otro proyecto responde 404', async () => {
      const sesion = await sesionDe(proyectoOtro, 'anterior');

      await como('docente').get(rutaSesion(proyecto, sesion.id)).expect(404);
    });

    it('el estudiante no tiene acceso (403)', async () => {
      const sesion = await sesionDe(proyecto, 'pasada');

      await como('estudiante').get(rutaSesion(proyecto, sesion.id)).expect(403);
    });

    it('el administrador también registra', async () => {
      const sesion = await sesionDe(proyectoOtro, 'anterior');

      const registro = await como('administrador').put(
        `${rutaSesion(proyectoOtro, sesion.id)}/registro`,
        { idsContenido: [contenidoOtroProyecto] },
      );

      expect(registro.status).toBe(200);
      expect(registro.body.registro.registradoPor).toBe(
        'Usuario administrador E2E',
      );
    });
  });
});
