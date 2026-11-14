import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  domingoDePascua,
  festivosDeLey,
} from '../src/estructura-academica/festivos-ley.js';
import {
  mensajeConfirmarEliminar,
  mensajeFechaOcupada,
  MENSAJE_FESTIVO_NO_EXISTE,
  TABLA_FESTIVOS,
} from '../src/estructura-academica/festivos.service.js';
import { sumarDias } from '../src/sesiones/alertas.js';
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

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Trabaja en un
// año lejano (2091), que ninguna base tiene parametrizado, para no tocar los calendarios del
// seed: el recálculo alcanza a todos los períodos abiertos que tocan las fechas. Borra lo que
// crea al terminar. Funciona con o sin el seed.
describe('Días festivos (e2e) · RF-19, HU-08-01', () => {
  const ANIO = 2091;
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const inicioPrueba = new Date(Date.now() - 60_000);
  const pascua = domingoDePascua(ANIO).toISOString().slice(0, 10);
  const viernesSanto = sumarDias(pascua, -2);

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;
  const matriz = matrizDePrueba();
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
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  let programa: number;
  let proyecto: number;

  const http = () => request(app.getHttpServer());
  const como = (quien: string) => ({
    get: (ruta: string) =>
      http().get(`/api${ruta}`).set('Authorization', `Bearer ${tokens[quien]}`),
    post: (ruta: string, cuerpo: object = {}) =>
      http()
        .post(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`)
        .send(cuerpo),
    patch: (ruta: string, cuerpo: object) =>
      http()
        .patch(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`)
        .send(cuerpo),
    delete: (ruta: string) =>
      http()
        .delete(`/api${ruta}`)
        .set('Authorization', `Bearer ${tokens[quien]}`),
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

  async function tipoPorCodigo(codigo: string, hayClase: boolean) {
    const existente = await prisma.tipo_sesion.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const tipo = await prisma.tipo_sesion.create({
      data: {
        codigo,
        nombre: codigo,
        exige_tema: hayClase,
        cuenta_como_dictada: hayClase,
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
        email: `e2e.fes.${clave}.${sufijo}@prueba.urap.local`,
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

  /** La sesión del calendario de prueba en esa fecha, con su tipo. */
  async function sesionDel(fecha: string) {
    return prisma.sesion_clase.findFirstOrThrow({
      where: {
        id_proyecto_docente: proyecto,
        fecha: new Date(`${fecha}T00:00:00.000Z`),
      },
      include: { tipo_sesion: true },
    });
  }

  /** Un miércoles del período de prueba, lejos de la Semana Santa. */
  const miercoles = (semanas: number) => sumarDias(pascua, 3 + 7 * semanas);

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

    await tipoPorCodigo('clase', true);
    await tipoPorCodigo('festivo', false);

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E FES ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const creadoPrograma = await prisma.programa.create({
      data: { id_facultad: facultad.id, nombre: `Programa E2E FES ${sufijo}` },
    });
    creados.programas.push(creadoPrograma.id);
    programa = creadoPrograma.id;

    await crearUsuario('docente', ROL.docente, programa);
    await crearUsuario('administrador', ROL.administrador, null);

    // Seis semanas alrededor de la Pascua de 2091: cubre la Semana Santa.
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `E2E-FES-${sufijo}`,
        fecha_inicio: new Date(`${sumarDias(pascua, -13)}T00:00:00.000Z`),
        fecha_fin: new Date(`${sumarDias(pascua, 27)}T00:00:00.000Z`),
        numero_semanas: null,
        activo: false,
        cerrado: false,
      },
    });
    creados.periodos.push(periodo.id);
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, programa),
        codigo_interno: `FES-${sufijo}`,
        nombre: 'Asignatura FES',
        semestre: 3,
      },
    });
    creados.asignaturas.push(asignatura.id);
    proyecto = (
      await prisma.proyecto_docente.create({
        data: {
          id_asignatura: asignatura.id,
          id_periodo: periodo.id,
          id_estado: await estadoPorCodigo('aprobado'),
          origen: 'manual',
          proyecto_docente_docente: {
            create: [
              { id_usuario: usuarios.docente, responsable: true, orden: 1 },
            ],
          },
        },
      })
    ).id;
    creados.proyectos.push(proyecto);
    await http()
      .put(`/api/proyectos-docentes/${proyecto}/horario`)
      .set('Authorization', `Bearer ${tokens.docente}`)
      .send({
        bloques: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
          diaSemana,
          horaInicio: '07:00',
          horaFin: '09:00',
        })),
      })
      .expect(200);
    await como('docente')
      .post(`/proyectos-docentes/${proyecto}/calendario`)
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.notificacion.deleteMany({
        where: { entidad: 'dia_festivo', created_at: { gte: inicioPrueba } },
      });
      await prisma.sesion_clase.deleteMany({ where: deProyectos });
      await prisma.dia_festivo.deleteMany({
        where: {
          fecha: {
            gte: new Date(`${ANIO}-01-01T00:00:00.000Z`),
            lte: new Date(`${ANIO}-12-31T00:00:00.000Z`),
          },
        },
      });
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
      await prisma.estado_proyecto.deleteMany({
        where: { id: { in: creados.estados } },
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

  it('solo el administrador consulta y cambia la tabla', async () => {
    await como('docente').get(`/festivos?anio=${ANIO}`).expect(403);
    await como('docente')
      .post('/festivos', { fecha: miercoles(1), nombre: 'X' })
      .expect(403);
    await como('administrador').get('/festivos?anio=dos').expect(400);
    await como('administrador').get('/festivos?anio=1990').expect(400);
  });

  it('un año sin parametrizar dice cuántos festivos de ley le faltan', async () => {
    const lista = await como('administrador')
      .get(`/festivos?anio=${ANIO}`)
      .expect(200);
    expect(lista.body).toEqual({
      anio: ANIO,
      elementos: [],
      festivosDeLey: festivosDeLey(ANIO).length,
      faltantesDeLey: festivosDeLey(ANIO).length,
    });
    expect((await sesionDel(viernesSanto)).tipo_sesion?.codigo).toBe('clase');
  });

  it('carga los festivos de ley y marca la Semana Santa en el calendario', async () => {
    const carga = await como('administrador')
      .post('/festivos/ley', { anio: ANIO })
      .expect(200);
    expect(carga.body).toMatchObject({
      anio: ANIO,
      creados: festivosDeLey(ANIO).length,
      existentes: 0,
    });
    expect(carga.body.calendariosRecalculados).toBeGreaterThanOrEqual(1);

    const viernes = await sesionDel(viernesSanto);
    expect(viernes.tipo_sesion?.codigo).toBe('festivo');
    expect(viernes.id_dia_festivo).not.toBeNull();

    // Otra vez: no repite ni pisa lo que ya está.
    const repetida = await como('administrador')
      .post('/festivos/ley', { anio: ANIO })
      .expect(200);
    expect(repetida.body).toMatchObject({
      creados: 0,
      existentes: festivosDeLey(ANIO).length,
    });
    const lista = await como('administrador')
      .get(`/festivos?anio=${ANIO}`)
      .expect(200);
    expect(lista.body.faltantesDeLey).toBe(0);
    expect(
      lista.body.elementos.find(
        (festivo: { fecha: string }) => festivo.fecha === viernesSanto,
      ),
    ).toMatchObject({ nombre: 'Viernes Santo', origen: 'ley', sesiones: 1 });
  });

  it('agrega un día institucional, sin tocar la sesión ya diligenciada', async () => {
    const libre = miercoles(1);
    const registrada = miercoles(2);
    const sesionRegistrada = await sesionDel(registrada);
    await prisma.sesion_clase.update({
      where: { id: sesionRegistrada.id },
      data: { estado: 'registrada', fecha_registro: new Date() },
    });

    const creado = await como('administrador')
      .post('/festivos', { fecha: libre, nombre: '  Día cívico E2E  ' })
      .expect(201);
    expect(creado.body.festivo).toMatchObject({
      fecha: libre,
      nombre: 'Día cívico E2E',
      origen: 'institucional',
      sesiones: 1,
    });
    expect(creado.body.calendariosRecalculados).toBeGreaterThanOrEqual(1);
    expect((await sesionDel(libre)).tipo_sesion?.codigo).toBe('festivo');

    const repetido = await como('administrador')
      .post('/festivos', { fecha: libre, nombre: 'Otro' })
      .expect(409);
    expect(repetido.body.mensaje).toBe(
      mensajeFechaOcupada(libre, 'Día cívico E2E'),
    );
    await como('administrador')
      .post('/festivos', { fecha: '2091-02-30', nombre: 'Inválido' })
      .expect(400);

    await como('administrador')
      .post('/festivos', { fecha: registrada, nombre: 'Día tardío E2E' })
      .expect(201);
    const intacta = await sesionDel(registrada);
    expect(intacta.tipo_sesion?.codigo).toBe('clase');
    expect(intacta.estado).toBe('registrada');

    const auditado = await prisma.auditoria.findFirst({
      where: {
        tabla_afectada: TABLA_FESTIVOS,
        id_registro: creado.body.festivo.id,
        accion: 'crear',
      },
    });
    expect(auditado?.id_usuario).toBe(usuarios.administrador);
  });

  it('al cambiar la fecha, la vieja vuelve a ser de clase y la nueva se marca', async () => {
    const vieja = miercoles(1);
    const nueva = sumarDias(miercoles(1), 1);
    const { id } = await prisma.dia_festivo.findUniqueOrThrow({
      where: { fecha: new Date(`${vieja}T00:00:00.000Z`) },
    });

    const renombrado = await como('administrador')
      .patch(`/festivos/${id}`, { nombre: 'Día cívico E2E (jueves)' })
      .expect(200);
    expect(renombrado.body.calendariosRecalculados).toBe(0);

    const movido = await como('administrador')
      .patch(`/festivos/${id}`, { fecha: nueva })
      .expect(200);
    expect(movido.body.festivo).toMatchObject({ fecha: nueva, sesiones: 1 });
    expect((await sesionDel(vieja)).tipo_sesion?.codigo).toBe('clase');
    expect((await sesionDel(nueva)).tipo_sesion?.codigo).toBe('festivo');

    await como('administrador')
      .patch(`/festivos/${id}`, { fecha: viernesSanto })
      .expect(409);
  });

  it('pide confirmar antes de quitar un día que marca sesiones', async () => {
    const fecha = sumarDias(miercoles(1), 1);
    const { id } = await prisma.dia_festivo.findUniqueOrThrow({
      where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
    });

    const sinConfirmar = await como('administrador')
      .delete(`/festivos/${id}`)
      .expect(409);
    expect(sinConfirmar.body.mensaje).toBe(mensajeConfirmarEliminar(1));
    await como('administrador')
      .delete(`/festivos/${id}?confirmar=false`)
      .expect(409);

    await como('administrador')
      .delete(`/festivos/${id}?confirmar=true`)
      .expect(200);
    const sesion = await sesionDel(fecha);
    expect(sesion.tipo_sesion?.codigo).toBe('clase');
    expect(sesion.id_dia_festivo).toBeNull();

    const otraVez = await como('administrador')
      .delete(`/festivos/${id}?confirmar=true`)
      .expect(404);
    expect(otraVez.body.mensaje).toBe(MENSAJE_FESTIVO_NO_EXISTE);
  });
});
