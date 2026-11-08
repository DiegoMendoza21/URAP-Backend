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
  MENSAJE_FUERA_DE_ALCANCE,
  MENSAJE_OBSERVACION_NO_EXISTE,
  MENSAJE_OBSERVACIONES_SOLO_DEVUELTO,
  MENSAJE_PERIODO_CERRADO_ENVIO,
  MENSAJE_SECCIONES_INCOMPLETAS,
  MENSAJE_SOLO_RESPONSABLE,
} from '../src/proyectos-docentes/revision.service.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios (programas, una asignatura, un RAP, períodos, usuarios y proyectos
// con sus secciones) y los borra al terminar. Funciona con o sin el seed.
describe('Revisión y aprobación del proyecto docente (e2e) · RF-17, RF-18, HU-07-01 a 06', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const SEMANAS = 2;

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const matriz = matrizDePrueba();
  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    tiposNotificacion: [] as number[],
    periodos: [] as number[],
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
  let programa: number;
  let asignatura: number;
  let rap: number;
  let periodoAbierto: number;
  let periodoCerrado: number;
  let proyecto: number;
  let proyectoIncompleto: number;
  let proyectoCerrado: number;
  let proyectoResponsableInactivo: number;

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => {
    const autorizar = (prueba: request.Test) =>
      prueba.set('Authorization', `Bearer ${tokens[quien]}`);
    return {
      get: (ruta: string) => autorizar(http().get(`/api${ruta}`)),
      post: (ruta: string, cuerpo: object = {}) =>
        autorizar(http().post(`/api${ruta}`)).send(cuerpo),
      put: (ruta: string, cuerpo: object) =>
        autorizar(http().put(`/api${ruta}`)).send(cuerpo),
      patch: (ruta: string, cuerpo: object) =>
        autorizar(http().patch(`/api${ruta}`)).send(cuerpo),
    };
  };
  const ruta = (id: number, sufijoRuta: string) =>
    `/proyectos-docentes/${id}/${sufijoRuta}`;

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

  async function tipoNotificacion(codigo: string): Promise<void> {
    const existente = await prisma.tipo_notificacion.findUnique({
      where: { codigo },
    });
    if (!existente) {
      const creado = await prisma.tipo_notificacion.create({
        data: { codigo, nombre: codigo, activo: true },
      });
      creados.tiposNotificacion.push(creado.id);
    }
  }

  async function crearUsuario(
    clave: string,
    roles: string[],
    idPrograma: number | null,
    { activo = true, iniciarSesion = true } = {},
  ): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.rev.${clave}.${sufijo}@prueba.urap.local`,
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
    if (iniciarSesion) {
      const inicio = await http()
        .post('/api/auth/iniciar-sesion')
        .send({ correo: usuario.email, contrasena })
        .expect(200);
      tokens[clave] = (inicio.body as { token: string }).token;
    }
    if (!activo) {
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { activo: false },
      });
    }
  }

  async function crearProyecto(
    grupo: string,
    idPeriodo: number,
    responsable: number = usuarios.docente,
    idEstado: number = estados.diligenciamiento,
  ): Promise<number> {
    const creado = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: asignatura,
        id_periodo: idPeriodo,
        id_estado: idEstado,
        grupo,
        origen: 'manual',
        fecha_creacion: new Date(),
        proyecto_docente_rap: { create: [{ id_rap: rap }] },
        proyecto_docente_docente: {
          create: [
            { id_usuario: responsable, responsable: true, orden: 1 },
            { id_usuario: usuarios.codocente, responsable: false, orden: 2 },
          ],
        },
      },
    });
    creados.proyectos.push(creado.id);
    return creado.id;
  }

  /** Llena las seis secciones obligatorias (puntos 2 a 7) con datos ficticios. */
  async function completar(idProyecto: number): Promise<void> {
    await prisma.proyecto_docente.update({
      where: { id: idProyecto },
      data: { descripcion: 'Descripción ficticia del curso.' },
    });
    const rac = await prisma.rac.create({
      data: {
        id_proyecto_docente: idProyecto,
        codigo: 'RAC 1',
        descripcion: 'Enunciado ficticio del RAC 1',
        orden: 1,
        rac_rap: { create: [{ id_rap: rap }] },
      },
    });
    await prisma.evaluacion_rac.create({
      data: {
        id_rac: rac.id,
        instrumento: 'Taller',
        descripcion: 'Taller ficticio',
      },
    });
    await prisma.estrategia_metodologica.create({
      data: {
        id_proyecto_docente: idProyecto,
        descripcion: 'Aprendizaje basado en problemas',
        orden: 1,
      },
    });
    await prisma.contenido_programatico.createMany({
      data: Array.from({ length: SEMANAS }, (_, i) => ({
        id_proyecto_docente: idProyecto,
        semana: i + 1,
        tema: `Tema ficticio ${i + 1}`,
      })),
    });
    await prisma.bibliografia.create({
      data: {
        id_proyecto_docente: idProyecto,
        referencia: 'Autor ficticio (2020). Libro ficticio.',
        orden: 1,
      },
    });
  }

  async function estadoDe(idProyecto: number): Promise<string | null> {
    const fila = await prisma.proyecto_docente.findUniqueOrThrow({
      where: { id: idProyecto },
      select: { estado_proyecto: { select: { codigo: true } } },
    });
    return fila.estado_proyecto?.codigo ?? null;
  }

  async function notificacionesDe(idUsuario: number, tipo: string) {
    return prisma.notificacion.findMany({
      where: {
        id_usuario: idUsuario,
        tipo_notificacion: { is: { codigo: tipo } },
        entidad: 'proyecto_docente',
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
    await asegurarCatalogoDePermisos(prisma, matriz);
    hash = await app.get(ContrasenasService).hashear(contrasena);

    estados.diligenciamiento = await estado(
      'en_diligenciamiento',
      'En diligenciamiento',
      true,
    );
    estados.enviado = await estado('enviado', 'Enviado a revisión', false);
    estados.devuelto = await estado(
      'devuelto',
      'Devuelto con observaciones',
      true,
    );
    estados.aprobado = await estado('aprobado', 'Aprobado', false);
    for (const tipo of Object.values(NOTIFICACION)) {
      await tipoNotificacion(tipo);
    }

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E rev ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    programa = (
      await prisma.programa.create({
        data: {
          id_facultad: facultad.id,
          nombre: `Programa E2E rev ${sufijo}`,
        },
      })
    ).id;
    creados.programas.push(programa);
    const otroPrograma = (
      await prisma.programa.create({
        data: { id_facultad: facultad.id, nombre: `Otro E2E rev ${sufijo}` },
      })
    ).id;
    creados.programas.push(otroPrograma);
    asignatura = (
      await prisma.asignatura.create({
        data: {
          id_programa: programa,
          codigo_interno: `REV-${sufijo}`,
          nombre: 'Asignatura ficticia de revisión',
          semestre: 4,
        },
      })
    ).id;
    creados.asignaturas.push(asignatura);
    rap = (
      await prisma.rap.create({
        data: {
          id_programa: programa,
          numero: 1,
          codigo: 'RAP 1',
          descripcion: 'Enunciado ficticio del RAP 1',
        },
      })
    ).id;
    creados.raps.push(rap);
    for (const [clave, cerrado] of [
      ['A', false],
      ['C', true],
    ] as const) {
      const periodo = await prisma.periodo_academico.create({
        data: {
          codigo: `E2E-REV-${clave}-${sufijo}`,
          fecha_inicio: new Date('2026-08-03'),
          fecha_fin: new Date('2026-08-14'),
          numero_semanas: SEMANAS,
          activo: !cerrado,
          cerrado,
        },
      });
      creados.periodos.push(periodo.id);
      if (cerrado) {
        periodoCerrado = periodo.id;
      } else {
        periodoAbierto = periodo.id;
      }
    }

    await crearUsuario('docente', [ROL.docente], programa);
    await crearUsuario('codocente', [ROL.docente], programa);
    await crearUsuario('departamento', [ROL.departamento], programa);
    await crearUsuario('departamentoOtro', [ROL.departamento], otroPrograma);
    await crearUsuario('administrador', [ROL.administrador], null);
    await crearUsuario('estudiante', [ROL.estudiante], programa);
    // Ve el proyecto como Líder RAP del programa, pero aprueba solo en el otro programa.
    await crearUsuario('mixto', [ROL.departamento], otroPrograma);
    await prisma.usuario_rol.create({
      data: {
        id_usuario: usuarios.mixto,
        id_rol: await rolPorNombre(ROL.liderRap),
        id_programa: programa,
        activo: true,
      },
    });
    await crearUsuario('inactivo', [ROL.docente], programa, {
      activo: false,
      iniciarSesion: false,
    });

    proyecto = await crearProyecto('R1', periodoAbierto);
    await completar(proyecto);
    proyectoIncompleto = await crearProyecto('R2', periodoAbierto);
    proyectoCerrado = await crearProyecto('R3', periodoCerrado);
    await completar(proyectoCerrado);
    proyectoResponsableInactivo = await crearProyecto(
      'R4',
      periodoAbierto,
      usuarios.inactivo,
      estados.enviado,
    );
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      const racs = await prisma.rac.findMany({
        where: deProyectos,
        select: { id: true },
      });
      const idsRac = racs.map((fila) => fila.id);
      const revisiones = await prisma.revision_proyecto.findMany({
        where: deProyectos,
        select: { id: true },
      });
      await prisma.notificacion.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            {
              entidad: 'proyecto_docente',
              id_entidad: { in: creados.proyectos },
            },
          ],
        },
      });
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.observacion_revision.deleteMany({
        where: { id_revision: { in: revisiones.map((fila) => fila.id) } },
      });
      await prisma.revision_proyecto.deleteMany({ where: deProyectos });
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
      await prisma.programa.deleteMany({
        where: { id: { in: creados.programas } },
      });
      await prisma.facultad.deleteMany({
        where: { id: { in: creados.facultades } },
      });
      await prisma.tipo_notificacion.deleteMany({
        where: { id: { in: creados.tiposNotificacion } },
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

  describe('envío a revisión (RF-17, HU-07-01)', () => {
    it('la verificación lista las secciones incompletas y no deja enviar (excepción de p2), en menos de 4 s', async () => {
      const inicio = Date.now();
      const { body } = await como('docente')
        .get(ruta(proyectoIncompleto, 'envio'))
        .expect(200);
      expect(Date.now() - inicio).toBeLessThan(4000);
      expect(body).toMatchObject({
        puedeEnviar: false,
        motivo: MENSAJE_SECCIONES_INCOMPLETAS,
        observacionesSinResolver: 0,
      });
      expect(
        (
          body as { seccionesIncompletas: { clave: string }[] }
        ).seccionesIncompletas.map((s) => s.clave),
      ).toEqual([
        'descripcion',
        'rac',
        'estrategias',
        'evaluacion',
        'contenidos',
        'bibliografia',
      ]);

      const rechazo = await como('docente')
        .post(ruta(proyectoIncompleto, 'envio'))
        .expect(409);
      expect(rechazo.body).toMatchObject({
        mensaje: MENSAJE_SECCIONES_INCOMPLETAS,
      });
      expect((rechazo.body as { detalles: string[] }).detalles).toHaveLength(6);
      expect(await estadoDe(proyectoIncompleto)).toBe('en_diligenciamiento');
    });

    it('solo envía el docente responsable (RF-17, precondición)', async () => {
      const { body } = await como('codocente')
        .get(ruta(proyecto, 'envio'))
        .expect(200);
      expect(body).toMatchObject({
        puedeEnviar: false,
        motivo: MENSAJE_SOLO_RESPONSABLE,
      });
      await como('codocente').post(ruta(proyecto, 'envio')).expect(403);
      await como('departamento').post(ruta(proyecto, 'envio')).expect(403);
    });

    it('un período cerrado impide el envío (excepción de p4)', async () => {
      const { body } = await como('docente')
        .post(ruta(proyectoCerrado, 'envio'))
        .expect(409);
      expect(body).toMatchObject({ mensaje: MENSAJE_PERIODO_CERRADO_ENVIO });
    });

    it('envía, registra fecha y usuario, bloquea la edición y notifica a quien revisa (p5)', async () => {
      const { body: verificacion } = await como('docente')
        .get(ruta(proyecto, 'envio'))
        .expect(200);
      expect(verificacion).toMatchObject({
        puedeEnviar: true,
        motivo: null,
        seccionesIncompletas: [],
      });

      const { body } = await como('docente')
        .post(ruta(proyecto, 'envio'))
        .expect(200);
      expect(body).toMatchObject({
        idProyecto: proyecto,
        estado: { codigo: 'enviado' },
      });
      const guardado = await prisma.proyecto_docente.findUniqueOrThrow({
        where: { id: proyecto },
      });
      expect(guardado.fecha_envio).not.toBeNull();
      const eventos = await prisma.revision_proyecto.findMany({
        where: { id_proyecto_docente: proyecto },
      });
      expect(eventos).toEqual([
        expect.objectContaining({
          id_usuario: usuarios.docente,
          tipo: 'elaboracion',
          resultado: 'enviado',
          id_estado_anterior: estados.diligenciamiento,
          id_estado_nuevo: estados.enviado,
        }),
      ]);

      // Bloquea la edición: el estado «enviado» no permite editar (RF-17, poscondición).
      await como('docente')
        .put(ruta(proyecto, 'descripcion'), { texto: 'Cambio' })
        .expect(409);
      // Notifica al departamento del programa, no al de otro programa.
      expect(
        await notificacionesDe(
          usuarios.departamento,
          NOTIFICACION.proyectoEnviado,
        ),
      ).toEqual([
        expect.objectContaining({
          id_entidad: proyecto,
          url_destino: `/proyectos-docentes/${proyecto}/revision`,
          leida: false,
        }),
      ]);
      expect(
        await notificacionesDe(
          usuarios.departamentoOtro,
          NOTIFICACION.proyectoEnviado,
        ),
      ).toEqual([]);
      // Ni dos veces: ya está enviado.
      await como('docente').post(ruta(proyecto, 'envio')).expect(409);
    });
  });

  describe('bandeja de revisión (RF-18, HU-07-02)', () => {
    it('lista los enviados del programa con la fecha de envío, paginada y con filtros', async () => {
      const { body } = await como('departamento')
        .get('/revisiones/pendientes')
        .expect(200);
      const ids = (body as { elementos: { id: number }[] }).elementos.map(
        (e) => e.id,
      );
      expect(ids).toEqual(
        expect.arrayContaining([proyecto, proyectoResponsableInactivo]),
      );
      expect(ids).not.toContain(proyectoIncompleto);
      const enviado = (
        body as { elementos: { id: number; fechaEnvio: string | null }[] }
      ).elementos.find((e) => e.id === proyecto);
      expect(enviado?.fechaEnvio).toEqual(expect.any(String));

      const filtrado = await como('departamento')
        .get(`/revisiones/pendientes?idDocente=${usuarios.inactivo}&tamano=1`)
        .expect(200);
      expect(filtrado.body).toMatchObject({
        total: 1,
        tamano: 1,
        elementos: [{ id: proyectoResponsableInactivo }],
      });
    });

    it('otro programa no ve los pendientes; Docente y Administrador no aprueban (403)', async () => {
      const otro = await como('departamentoOtro')
        .get('/revisiones/pendientes')
        .expect(200);
      expect(
        (otro.body as { elementos: { id: number }[] }).elementos.map(
          (e) => e.id,
        ),
      ).not.toContain(proyecto);
      await como('docente').get('/revisiones/pendientes').expect(403);
      await como('administrador').get('/revisiones/pendientes').expect(403);
    });
  });

  describe('devolución con observaciones (RF-18, HU-07-04)', () => {
    it('exige al menos una observación con su sección (excepción de p4)', async () => {
      await como('departamento')
        .post(ruta(proyecto, 'devolucion'), { observaciones: [] })
        .expect(400);
      await como('departamento')
        .post(ruta(proyecto, 'devolucion'), {
          observaciones: [{ seccion: 'portada', observacion: 'x' }],
        })
        .expect(400);
      await como('departamento')
        .post(ruta(proyecto, 'devolucion'), {
          observaciones: [{ seccion: 'rac', observacion: '   ' }],
        })
        .expect(400);
      expect(await estadoDe(proyecto)).toBe('enviado');
    });

    it('otro programa no ve el proyecto (404)', async () => {
      await como('departamentoOtro')
        .post(ruta(proyecto, 'devolucion'), {
          observaciones: [{ seccion: 'rac', observacion: 'x' }],
        })
        .expect(404);
    });

    it('quien ve el proyecto pero no aprueba en su programa recibe 403', async () => {
      const { body } = await como('mixto')
        .post(ruta(proyecto, 'devolucion'), {
          observaciones: [{ seccion: 'rac', observacion: 'x' }],
        })
        .expect(403);
      expect(body).toMatchObject({ mensaje: MENSAJE_FUERA_DE_ALCANCE });
    });

    it('devuelve, reabre la edición y notifica a los docentes', async () => {
      const { body } = await como('departamento')
        .post(ruta(proyecto, 'devolucion'), {
          observacionGeneral: 'Revise los puntos señalados.',
          observaciones: [
            {
              seccion: 'bibliografia',
              observacion: 'Actualice las referencias.',
            },
            {
              seccion: 'rac',
              observacion: 'Precise la contribución al RAP 1.',
            },
          ],
        })
        .expect(200);
      expect(body).toMatchObject({ estado: { codigo: 'devuelto' } });

      await como('docente')
        .put(ruta(proyecto, 'descripcion'), {
          texto: 'Descripción corregida del curso.',
        })
        .expect(200);
      for (const docente of [usuarios.docente, usuarios.codocente]) {
        expect(
          await notificacionesDe(docente, NOTIFICACION.proyectoDevuelto),
        ).toHaveLength(1);
      }
    });

    it('aprobar exige que esté enviado (precondición de RF-18)', async () => {
      await como('departamento').post(ruta(proyecto, 'aprobacion')).expect(409);
    });
  });

  describe('observaciones de la devolución (HU-07-05)', () => {
    let idRac: number;
    let idBibliografia: number;

    it('las muestra en el orden del formato, con su sección', async () => {
      const { body } = await como('docente')
        .get(ruta(proyecto, 'observaciones'))
        .expect(200);
      expect(body).toMatchObject({
        vigentes: true,
        devolucion: {
          observacionGeneral: 'Revise los puntos señalados.',
          sinResolver: 2,
          revisor: { id: usuarios.departamento },
          observaciones: [
            { seccion: 'rac', numeroSeccion: 3, resuelta: false },
            { seccion: 'bibliografia', numeroSeccion: 7, resuelta: false },
          ],
        },
      });
      const observaciones = (
        body as { devolucion: { observaciones: { id: number }[] } }
      ).devolucion.observaciones;
      idRac = observaciones[0].id;
      idBibliografia = observaciones[1].id;
    });

    it('un docente asignado las marca; los demás no', async () => {
      const { body } = await como('codocente')
        .patch(ruta(proyecto, `observaciones/${idRac}`), { resuelta: true })
        .expect(200);
      expect(body).toMatchObject({ id: idRac, resuelta: true });
      await como('departamento')
        .patch(ruta(proyecto, `observaciones/${idBibliografia}`), {
          resuelta: true,
        })
        .expect(403);
      const inexistente = await como('docente')
        .patch(ruta(proyecto, 'observaciones/999999999'), { resuelta: true })
        .expect(404);
      expect(inexistente.body).toMatchObject({
        mensaje: MENSAJE_OBSERVACION_NO_EXISTE,
      });
    });

    it('al reenviar advierte las que siguen sin resolver, pero no lo impide', async () => {
      const { body } = await como('docente')
        .get(ruta(proyecto, 'envio'))
        .expect(200);
      expect(body).toMatchObject({
        puedeEnviar: true,
        observacionesSinResolver: 1,
      });
      await como('docente').post(ruta(proyecto, 'envio')).expect(200);
      const marcar = await como('docente')
        .patch(ruta(proyecto, `observaciones/${idBibliografia}`), {
          resuelta: true,
        })
        .expect(409);
      expect(marcar.body).toMatchObject({
        mensaje: MENSAJE_OBSERVACIONES_SOLO_DEVUELTO,
      });
    });
  });

  describe('aprobación (RF-18, HU-07-03)', () => {
    it('otro programa no aprueba: no ve el proyecto (404)', async () => {
      await como('departamentoOtro')
        .post(ruta(proyecto, 'aprobacion'))
        .expect(404);
    });

    it('aprueba en menos de 3 s, registra usuario y fecha, notifica y deja de permitir editar', async () => {
      const inicio = Date.now();
      const { body } = await como('departamento')
        .post(ruta(proyecto, 'aprobacion'), {
          observacionGeneral: 'Proyecto completo.',
        })
        .expect(200);
      expect(Date.now() - inicio).toBeLessThan(3000);
      expect(body).toMatchObject({ estado: { codigo: 'aprobado' } });
      const guardado = await prisma.proyecto_docente.findUniqueOrThrow({
        where: { id: proyecto },
      });
      expect(guardado.fecha_aprobacion).not.toBeNull();
      expect(
        await notificacionesDe(usuarios.docente, NOTIFICACION.proyectoAprobado),
      ).toHaveLength(1);
      const auditoria = await prisma.auditoria.findFirst({
        where: {
          id_usuario: usuarios.departamento,
          accion: 'aprobar',
          tabla_afectada: 'proyecto_docente',
          id_registro: proyecto,
        },
      });
      expect(auditoria).not.toBeNull();
      await como('docente')
        .put(ruta(proyecto, 'descripcion'), { texto: 'Otro cambio' })
        .expect(409);
      // Ya no está enviado: ni aprobar ni devolver otra vez.
      await como('departamento').post(ruta(proyecto, 'aprobacion')).expect(409);
    });

    it('si el responsable está inactivo, avisa también a quien revisa (excepción de p5)', async () => {
      await como('departamento')
        .post(ruta(proyectoResponsableInactivo, 'devolucion'), {
          observaciones: [{ seccion: 'descripcion', observacion: 'Complete.' }],
        })
        .expect(200);
      const avisos = await notificacionesDe(
        usuarios.departamento,
        NOTIFICACION.proyectoDevuelto,
      );
      expect(avisos).toEqual([
        expect.objectContaining({
          id_entidad: proyectoResponsableInactivo,
          titulo: expect.stringContaining('inactivo'),
        }),
      ]);
      // El inactivo no recibe el aviso; el codocente activo, sí.
      expect(
        await notificacionesDe(
          usuarios.inactivo,
          NOTIFICACION.proyectoDevuelto,
        ),
      ).toEqual([]);
    });
  });

  describe('historial de revisiones (HU-07-06)', () => {
    it('lista envío, devolución, reenvío y aprobación con usuario y estados', async () => {
      const { body } = await como('departamento')
        .get(ruta(proyecto, 'historial'))
        .expect(200);
      expect(body).toMatchObject([
        {
          tipo: 'elaboracion',
          resultado: 'enviado',
          usuario: { id: usuarios.docente },
          estadoAnterior: { codigo: 'en_diligenciamiento' },
          estadoNuevo: { codigo: 'enviado' },
        },
        {
          tipo: 'revision',
          resultado: 'devuelto',
          usuario: { id: usuarios.departamento },
          observaciones: 2,
        },
        {
          tipo: 'elaboracion',
          resultado: 'enviado',
          estadoAnterior: { codigo: 'devuelto' },
        },
        {
          tipo: 'aprobacion',
          resultado: 'aprobado',
          observacionGeneral: 'Proyecto completo.',
          estadoNuevo: { codigo: 'aprobado' },
        },
      ]);
      await como('docente').get(ruta(proyecto, 'historial')).expect(200);
    });

    it('el Estudiante no lo ve: el proyecto no está publicado (404)', async () => {
      await como('estudiante').get(ruta(proyecto, 'historial')).expect(404);
    });
  });
});
