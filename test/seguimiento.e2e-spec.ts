import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  mensajeExportacionGrande,
  PARAMETRO_EXPORTACION_MAXIMA,
} from '../src/reportes/seguimiento.service.js';
import {
  borrarPlanesDePrueba,
  planDePrueba,
} from './utilidades/plan-estudio.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed.
describe('Tablero de seguimiento (e2e) · RF-25, HU-12-01 y HU-12-02', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    tipos: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    periodos: [] as number[],
    raps: [] as number[],
    asignaturas: [] as number[],
    proyectos: [] as number[],
    usuarios: [] as number[],
  };
  let parametroAnterior: string | null | undefined;
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  const proyectos = {
    completo: 0,
    atrasado: 0,
    incompleto: 0,
    otroPrograma: 0,
  };
  let idPeriodo = 0;
  let idProgramaA = 0;
  let idAsignaturaAtrasada = 0;

  const http = () => request(app.getHttpServer());
  const pedir = (quien: string, ruta: string) =>
    http()
      .get(`/api/seguimiento/${ruta}`)
      .set('Authorization', `Bearer ${tokens[quien]}`);
  const conPeriodo = (ruta: string, extra = '') =>
    `${ruta}?idPeriodo=${idPeriodo}${extra}`;

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
      data: { codigo, nombre: codigo, permite_edicion: true },
    });
    creados.estados.push(estado.id);
    return estado.id;
  }

  async function tipoPorCodigo(codigo: string): Promise<number> {
    const existente = await prisma.tipo_sesion.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const tipo = await prisma.tipo_sesion.create({
      data: { codigo, nombre: codigo },
    });
    creados.tipos.push(tipo.id);
    return tipo.id;
  }

  async function crearUsuario(
    clave: string,
    rol: string,
    idPrograma: number | null,
  ): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.rf25.${clave}.${sufijo}@prueba.urap.local`,
        password_hash: hash,
        activo: true,
      },
    });
    creados.usuarios.push(usuario.id);
    usuarios[clave] = usuario.id;
    await prisma.usuario_rol.create({
      data: {
        id_usuario: usuario.id,
        id_rol: await rolPorNombre(rol),
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

  async function crearProyecto(
    idPrograma: number,
    nombre: string,
    idRap: number,
  ): Promise<number> {
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, idPrograma),
        codigo_interno: `${nombre}-${sufijo}`,
        nombre: `${nombre} E2E`,
      },
    });
    creados.asignaturas.push(asignatura.id);
    const proyecto = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: asignatura.id,
        id_periodo: idPeriodo,
        id_estado: await estadoPorCodigo('en_diligenciamiento'),
        grupo: 'E2E',
        proyecto_docente_rap: { create: [{ id_rap: idRap }] },
        proyecto_docente_docente: {
          create: [
            { id_usuario: usuarios.docente, responsable: true, orden: 1 },
          ],
        },
      },
    });
    creados.proyectos.push(proyecto.id);
    return proyecto.id;
  }

  async function sesion(
    idProyecto: number,
    fecha: string,
    tipo: 'clase' | 'festivo',
    registrada = false,
  ) {
    await prisma.sesion_clase.create({
      data: {
        id_proyecto_docente: idProyecto,
        id_tipo_sesion: await tipoPorCodigo(tipo),
        fecha: new Date(`${fecha}T00:00:00.000Z`),
        semana: 1,
        estado: registrada ? 'registrada' : 'programada',
        fecha_registro: registrada ? new Date() : null,
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
    hash = await app.get(ContrasenasService).hashear(contrasena);

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E RF-25 ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const [programaA, programaB] = await Promise.all(
      ['A', 'B'].map((letra) =>
        prisma.programa.create({
          data: {
            id_facultad: facultad.id,
            nombre: `Programa E2E RF-25 ${letra} ${sufijo}`,
          },
        }),
      ),
    );
    idProgramaA = programaA.id;
    creados.programas.push(programaA.id, programaB.id);
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `E2E-RF25-${sufijo}`,
        numero_semanas: 2,
        fecha_inicio: new Date('2020-02-03T00:00:00.000Z'),
        fecha_fin: new Date('2099-12-18T00:00:00.000Z'),
        activo: true,
      },
    });
    idPeriodo = periodo.id;
    creados.periodos.push(periodo.id);
    const [rapA, rapB] = await Promise.all(
      [programaA, programaB].map((programa) =>
        prisma.rap.create({
          data: {
            id_programa: programa.id,
            codigo: 'RAP 2',
            numero: 2,
            descripcion: 'RAP de prueba',
          },
        }),
      ),
    );
    creados.raps.push(rapA.id, rapB.id);

    await crearUsuario('administrador', ROL.administrador, null);
    await crearUsuario('departamento', ROL.departamento, programaA.id);
    await crearUsuario('direccion', ROL.direccion, programaA.id);
    await crearUsuario('docente', ROL.docente, programaA.id);
    await crearUsuario('lider', ROL.liderRap, programaA.id);

    // Al día: todas las secciones, dos clases registradas, un festivo y dos evidencias.
    proyectos.completo = await crearProyecto(programaA.id, 'Completo', rapA.id);
    await prisma.proyecto_docente.update({
      where: { id: proyectos.completo },
      data: {
        descripcion: 'Curso de prueba',
        rac: {
          create: [
            {
              codigo: 'RAC 1',
              descripcion: 'RAC de prueba',
              orden: 1,
              rac_rap: { create: [{ id_rap: rapA.id }] },
              evaluacion_rac: {
                create: [{ instrumento: 'Taller', porcentaje: 100 }],
              },
            },
          ],
        },
        estrategia_metodologica: {
          create: [{ descripcion: 'Clase magistral', orden: 1 }],
        },
        contenido_programatico: {
          create: [
            { semana: 1, tema: 'Tema 1' },
            { semana: 2, tema: 'Tema 2' },
          ],
        },
        bibliografia: { create: [{ referencia: 'Libro de prueba', orden: 1 }] },
        evidencia_rap: {
          create: [
            { id_rap: rapA.id, nombre_original: 'foto-1.jpg' },
            { id_rap: rapA.id, nombre_original: 'foto-2.jpg' },
          ],
        },
      },
    });
    await sesion(proyectos.completo, '2020-02-04', 'clase', true);
    await sesion(proyectos.completo, '2020-02-06', 'clase', true);
    await sesion(proyectos.completo, '2020-02-11', 'festivo');

    // Atrasado: nada diligenciado y tres clases pasadas sin registrar.
    proyectos.atrasado = await crearProyecto(programaA.id, 'Atrasado', rapA.id);
    idAsignaturaAtrasada = (
      await prisma.proyecto_docente.findUniqueOrThrow({
        where: { id: proyectos.atrasado },
      })
    ).id_asignatura as number;
    for (const fecha of ['2020-02-04', '2020-02-06', '2020-02-11']) {
      await sesion(proyectos.atrasado, fecha, 'clase');
    }

    // Incompleto: sin sesiones, con las secciones vacías.
    proyectos.incompleto = await crearProyecto(
      programaA.id,
      'Incompleto',
      rapA.id,
    );
    proyectos.otroPrograma = await crearProyecto(
      programaB.id,
      'OtroPrograma',
      rapB.id,
    );
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      if (parametroAnterior !== undefined) {
        await (parametroAnterior === null
          ? prisma.parametro_sistema.deleteMany({
              where: { clave: PARAMETRO_EXPORTACION_MAXIMA },
            })
          : prisma.parametro_sistema.update({
              where: { clave: PARAMETRO_EXPORTACION_MAXIMA },
              data: { valor: parametroAnterior },
            }));
      }
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.evidencia_rap.deleteMany({ where: deProyectos });
      await prisma.sesion_clase.deleteMany({ where: deProyectos });
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
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: creados.proyectos } },
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
      await prisma.tipo_sesion.deleteMany({
        where: { id: { in: creados.tipos } },
      });
      await prisma.estado_proyecto.deleteMany({
        where: { id: { in: creados.estados } },
      });
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
    }
    await app?.close();
  });

  type Fila = {
    idProyecto: number;
    color: string;
    secciones: { completas: number; total: number; porcentaje: number };
    sesiones: Record<string, number | null>;
    evidencias: { rap: string; cantidad: number }[];
  };
  const filaDe = (elementos: Fila[], id: number) =>
    elementos.find((fila) => fila.idProyecto === id);

  it('solo el Administrador, el Departamento y la Dirección (RF-25, precondición)', async () => {
    await http().get('/api/seguimiento/tablero').expect(401);
    await pedir('docente', 'tablero').expect(403);
    await pedir('lider', 'tablero').expect(403);
    await pedir('direccion', conPeriodo('tablero')).expect(200);
  });

  it('presenta cada proyecto del programa con sus indicadores y su color (HU-12-01)', async () => {
    const inicio = Date.now();
    const { body } = await pedir('departamento', conPeriodo('tablero')).expect(
      200,
    );
    expect(Date.now() - inicio).toBeLessThan(5_000); // RF-25, q1
    expect(body.periodo.id).toBe(idPeriodo);
    // El del otro programa no aparece: los alcances son filtros.
    expect(body.total).toBe(3);
    expect(body.resumen).toEqual({
      proyectos: 3,
      rojo: 1,
      amarillo: 1,
      verde: 1,
      conPendientes: 2,
    });
    const elementos = body.elementos as Fila[];
    expect(filaDe(elementos, proyectos.completo)).toMatchObject({
      color: 'verde',
      secciones: { completas: 6, total: 6, porcentaje: 100 },
      sesiones: {
        programadas: 2,
        registradas: 2,
        vencidas: 0,
        incumplidas: 0,
      },
      evidencias: [{ rap: 'RAP 2', cantidad: 2 }],
    });
    expect(filaDe(elementos, proyectos.atrasado)).toMatchObject({
      color: 'rojo',
      secciones: { completas: 0, total: 6, porcentaje: 0 },
      sesiones: { programadas: 3, registradas: 0, vencidas: 3 },
      evidencias: [{ rap: 'RAP 2', cantidad: 0 }],
    });
    expect(filaDe(elementos, proyectos.incompleto)?.color).toBe('amarillo');
  });

  it('el Administrador ve todos los programas', async () => {
    const { body } = await pedir('administrador', conPeriodo('tablero')).expect(
      200,
    );
    const ids = (body.elementos as Fila[]).map((fila) => fila.idProyecto);
    expect(ids).toEqual(expect.arrayContaining(Object.values(proyectos)));
  });

  it('filtra por programa, asignatura y docente, e informa si no hay resultados (p3)', async () => {
    const porAsignatura = await pedir(
      'departamento',
      conPeriodo('tablero', `&idAsignatura=${idAsignaturaAtrasada}`),
    ).expect(200);
    expect(porAsignatura.body.total).toBe(1);
    const porDocente = await pedir(
      'administrador',
      conPeriodo(
        'tablero',
        `&idDocente=${usuarios.docente}&idPrograma=${idProgramaA}`,
      ),
    ).expect(200);
    expect(porDocente.body.total).toBe(3);
    const sinResultados = await pedir(
      'departamento',
      conPeriodo('tablero', `&idDocente=${usuarios.lider}`),
    ).expect(200);
    expect(sinResultados.body.total).toBe(0);
    await pedir('departamento', 'tablero?idPeriodo=999999999').expect(404);
    await pedir('departamento', 'tablero?idPrograma=abc').expect(400);
  });

  it('lista los pendientes por gravedad y deja fuera a los que están al día (HU-12-02)', async () => {
    const { body } = await pedir(
      'departamento',
      conPeriodo('pendientes'),
    ).expect(200);
    expect((body.elementos as Fila[]).map((fila) => fila.idProyecto)).toEqual([
      proyectos.atrasado,
      proyectos.incompleto,
    ]);
    expect(body.resumen.proyectos).toBe(3);
  });

  it('ofrece los filtros del alcance del usuario', async () => {
    const { body } = await pedir('departamento', 'filtros').expect(200);
    expect((body.programas as { id: number }[]).map((p) => p.id)).toEqual([
      idProgramaA,
    ]);
    expect((body.docentes as { id: number }[]).map((d) => d.id)).toContain(
      usuarios.docente,
    );
    expect((body.periodos as { id: number }[]).map((p) => p.id)).toContain(
      idPeriodo,
    );
  });

  it('exporta a Excel y pide restringir los filtros si supera el límite (p5)', async () => {
    const libro = await pedir('departamento', conPeriodo('pendientes/excel'))
      .buffer(true)
      .parse((res, listo) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => listo(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(libro.headers['content-type']).toContain('spreadsheetml');
    expect((libro.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    // La exportación queda en auditoría con el usuario y la IP (RF-29).
    const auditada = await prisma.auditoria.findFirst({
      where: {
        id_usuario: usuarios.departamento,
        accion: 'consulta_sensible',
        tabla_afectada: 'proyecto_docente',
      },
    });
    expect(auditada?.ip).toBeTruthy();

    const actual = await prisma.parametro_sistema.findUnique({
      where: { clave: PARAMETRO_EXPORTACION_MAXIMA },
    });
    parametroAnterior = actual ? (actual.valor ?? '') : null;
    await prisma.parametro_sistema.upsert({
      where: { clave: PARAMETRO_EXPORTACION_MAXIMA },
      create: {
        clave: PARAMETRO_EXPORTACION_MAXIMA,
        valor: '2',
        tipo_dato: 'entero',
      },
      update: { valor: '2' },
    });
    const { body } = await pedir(
      'departamento',
      conPeriodo('tablero/excel'),
    ).expect(422);
    expect(body.mensaje).toBe(mensajeExportacionGrande(3, 2));
  });
});
