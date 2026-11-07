import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  MENSAJE_FALTAN_ACCIONES_PROPUESTAS,
  MENSAJE_MEDICION_CERRADA,
  MENSAJE_MEDICION_EXISTENTE,
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_PROYECTO_NO_APROBADO,
  MENSAJE_SIN_LISTA,
  MENSAJE_SIN_RUBRICA,
  MENSAJE_SIN_VALORACIONES,
} from '../src/mediciones/constantes.js';
import {
  ADVERTENCIA_SIN_COHORTE,
  ADVERTENCIA_SIN_META,
} from '../src/mediciones/consolidado.js';
import { MOTIVO_SIN_PERIODOS_ANTERIORES } from '../src/reportes/reportes.service.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios (programa, escala, RAP, rúbrica, curso y 34 estudiantes) y los borra
// al terminar. Funciona con o sin el seed. Nunca nombres ni documentos reales (Ley 1581 de
// 2012): la medición real del RAP 2 de 2024-1 solo aporta sus conteos.
describe('Medición de RAP (e2e) · RF-30, HU-11-01 a HU-11-03', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const prefijoDocumento = `E2E30-${sufijo.slice(-9)}-`;

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  /** Ids de lo que crea la prueba, para borrarlo al final. */
  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    escalas: [] as number[],
    periodos: [] as number[],
    raps: [] as number[],
    asignaturas: [] as number[],
    proyectos: [] as number[],
    usuarios: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  /** Proyectos: aprobado con lista, sin aprobar, aprobado sin lista. */
  const proyectos = { aprobado: 0, sinAprobar: 0, sinLista: 0 };
  /** RAP con rúbrica vigente, RAP del curso sin rúbrica y RAP de otro curso. */
  const raps = { conRubrica: 0, sinRubrica: 0, ajeno: 0 };
  const idsIndicador: number[] = [];
  const idsMatricula: number[] = [];
  let idPrograma = 0;
  let idEscala = 0;
  let idPeriodo = 0;

  const http = () => request(app.getHttpServer());
  const conToken = (quien: string, peticion: request.Test) =>
    peticion.set('Authorization', `Bearer ${tokens[quien]}`);
  const rutaProyecto = (id = proyectos.aprobado) =>
    `/api/proyectos-docentes/${id}/mediciones`;
  const iniciar = (quien: string, datos: object, id = proyectos.aprobado) =>
    conToken(quien, http().post(rutaProyecto(id)).send(datos));
  const datosInicio = (idRap = raps.conRubrica) => ({
    idRap,
    tipoValoracion: 'formativa',
    periodoToma: 'primer',
    anioToma: 2024,
  });

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
      data: { codigo, nombre: codigo, permite_edicion: false },
    });
    creados.estados.push(estado.id);
    return estado.id;
  }

  async function crearUsuario(clave: string, roles: string[]): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.rf30.${clave}.${sufijo}@prueba.urap.local`,
        password_hash: hash,
        activo: true,
      },
    });
    creados.usuarios.push(usuario.id);
    usuarios[clave] = usuario.id;
    for (const rol of roles) {
      await prisma.usuario_rol.create({
        data: {
          id_usuario: usuario.id,
          id_rol: await rolPorNombre(rol),
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

  async function crearProyecto(
    codigo: string,
    estado: string,
    idsRap: number[],
  ): Promise<number> {
    const asignatura = await prisma.asignatura.create({
      data: {
        id_programa: idPrograma,
        codigo_interno: `${codigo}-${sufijo}`,
        nombre: `Asignatura ${codigo} E2E`,
      },
    });
    creados.asignaturas.push(asignatura.id);
    const proyecto = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: asignatura.id,
        id_periodo: idPeriodo,
        id_estado: await estadoPorCodigo(estado),
        grupo: 'E2E',
        proyecto_docente_rap: {
          create: idsRap.map((idRap) => ({ id_rap: idRap })),
        },
      },
    });
    creados.proyectos.push(proyecto.id);
    return proyecto.id;
  }

  /** Rúbrica vigente con cuatro indicadores y sus dieciséis descriptores (RF-06). */
  async function crearRubrica(idRap: number, version: number) {
    const niveles = await prisma.nivel_escala.findMany({
      where: { id_escala: idEscala },
      orderBy: { valor: 'asc' },
    });
    if (idsIndicador.length === 0) {
      for (const numero of [1, 2, 3, 4]) {
        const indicador = await prisma.indicador_rap.create({
          data: {
            id_rap: idRap,
            numero,
            descripcion: `Indicador ${numero} de prueba E2E`,
          },
        });
        idsIndicador.push(indicador.id);
      }
    }
    return prisma.rubrica.create({
      data: {
        id_rap: idRap,
        id_escala: idEscala,
        version,
        estado: 'vigente',
        rubrica_descriptor: {
          create: idsIndicador.flatMap((idIndicador) =>
            niveles.map((nivel) => ({
              id_indicador: idIndicador,
              id_nivel: nivel.id,
              descripcion: `Descriptor del nivel ${nivel.valor} (versión ${version})`,
            })),
          ),
        },
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
      data: { nombre: `Facultad E2E RF-30 ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const programa = await prisma.programa.create({
      data: {
        id_facultad: facultad.id,
        nombre: `Programa E2E RF-30 ${sufijo}`,
      },
    });
    idPrograma = programa.id;
    creados.programas.push(programa.id);

    // Escala del programa (RF-07): cuatro niveles, umbral 3 y sin porcentaje esperado, como
    // la de Administración Industrial mientras el programa no fije la meta.
    const escala = await prisma.escala_valoracion.create({
      data: {
        id_programa: idPrograma,
        nombre: 'Escala E2E',
        numero_niveles: 4,
        umbral_cumplimiento: 3,
        porcentaje_esperado: null,
        nivel_escala: {
          create: [
            { valor: 1, etiqueta: 'Principiante' },
            { valor: 2, etiqueta: 'En Desarrollo' },
            { valor: 3, etiqueta: 'Competente' },
            { valor: 4, etiqueta: 'Ejemplar' },
          ],
        },
      },
    });
    idEscala = escala.id;
    creados.escalas.push(escala.id);
    await prisma.programa.update({
      where: { id: idPrograma },
      data: { id_escala_activa: idEscala },
    });

    const periodo = await prisma.periodo_academico.create({
      data: { codigo: `E2E-RF30-${sufijo}`, numero_semanas: 16 },
    });
    idPeriodo = periodo.id;
    creados.periodos.push(periodo.id);

    for (const clave of ['conRubrica', 'sinRubrica', 'ajeno'] as const) {
      const rap = await prisma.rap.create({
        data: {
          id_programa: idPrograma,
          codigo: `RAP E2E ${clave}`,
          numero: { conRubrica: 2, sinRubrica: 5, ajeno: 6 }[clave],
          descripcion: `RAP de prueba ${clave}`,
        },
      });
      raps[clave] = rap.id;
      creados.raps.push(rap.id);
    }
    await crearRubrica(raps.conRubrica, 1);

    proyectos.aprobado = await crearProyecto('FCP', 'aprobado', [
      raps.conRubrica,
      raps.sinRubrica,
    ]);
    proyectos.sinAprobar = await crearProyecto('SIN', 'en_diligenciamiento', [
      raps.conRubrica,
    ]);
    proyectos.sinLista = await crearProyecto('LIS', 'aprobado', [
      raps.conRubrica,
    ]);

    // 34 estudiantes ficticios matriculados en el curso aprobado y uno retirado.
    for (let n = 1; n <= 35; n += 1) {
      const estudiante = await prisma.estudiante.create({
        data: {
          identificacion: `${prefijoDocumento}${n}`,
          nombres: `Estudiante ${String(n).padStart(2, '0')}`,
          apellidos: 'Ficticio E2E',
          id_programa: idPrograma,
        },
      });
      const matricula = await prisma.matricula.create({
        data: {
          id_proyecto_docente: proyectos.aprobado,
          id_estudiante: estudiante.id,
          estado: n <= 34 ? 'matriculado' : 'retirado',
        },
      });
      if (n <= 34) {
        idsMatricula.push(matricula.id);
      }
    }

    await crearUsuario('docente', [ROL.docente]);
    await crearUsuario('docenteAjeno', [ROL.docente]);
    await crearUsuario('lider', [ROL.docente, ROL.liderRap]);
    await crearUsuario('liderOtroRap', [ROL.liderRap]);
    await crearUsuario('departamento', [ROL.departamento]);
    await crearUsuario('direccion', [ROL.direccion]);
    await crearUsuario('estudiante', [ROL.estudiante]);
    for (const idProyecto of Object.values(proyectos)) {
      await prisma.proyecto_docente_docente.create({
        data: {
          id_proyecto_docente: idProyecto,
          id_usuario: usuarios.docente,
          responsable: true,
          orden: 1,
        },
      });
    }
    await prisma.lider_rap.createMany({
      data: [
        {
          id_rap: raps.conRubrica,
          id_usuario: usuarios.lider,
          id_periodo: idPeriodo,
        },
        {
          id_rap: raps.ajeno,
          id_usuario: usuarios.liderOtroRap,
          id_periodo: idPeriodo,
        },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      const mediciones = await prisma.medicion_rap.findMany({
        where: deProyectos,
        select: { id: true },
      });
      const deMediciones = { id_medicion: { in: mediciones.map((m) => m.id) } };
      await prisma.valoracion_estudiante.deleteMany({
        where: { medicion_indicador: deMediciones },
      });
      await prisma.medicion_indicador.deleteMany({ where: deMediciones });
      await prisma.medicion_rap.deleteMany({ where: deProyectos });
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.lider_rap.deleteMany({
        where: { id_rap: { in: creados.raps } },
      });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.matricula.deleteMany({ where: deProyectos });
      await prisma.estudiante.deleteMany({
        where: { identificacion: { startsWith: prefijoDocumento } },
      });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: creados.proyectos } },
      });
      await prisma.asignatura.deleteMany({
        where: { id: { in: creados.asignaturas } },
      });
      const deRaps = { id_rap: { in: creados.raps } };
      await prisma.rubrica_descriptor.deleteMany({
        where: { rubrica: { is: deRaps } },
      });
      await prisma.rubrica.deleteMany({ where: deRaps });
      await prisma.indicador_rap.deleteMany({ where: deRaps });
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
      await prisma.programa.updateMany({
        where: { id: { in: creados.programas } },
        data: { id_escala_activa: null },
      });
      await prisma.nivel_escala.deleteMany({
        where: { id_escala: { in: creados.escalas } },
      });
      await prisma.escala_valoracion.deleteMany({
        where: { id: { in: creados.escalas } },
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
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
    }
    await app?.close();
  });

  describe('precondiciones del curso (RF-30, p1 a p3)', () => {
    it('exige sesión y uno de los roles de la medición', async () => {
      await http().get(rutaProyecto()).expect(401);
      await conToken('direccion', http().get(rutaProyecto())).expect(403);
      await conToken('estudiante', http().get(rutaProyecto())).expect(403);
    });

    it('presenta al docente las precondiciones y los RAP medibles', async () => {
      const { body } = await conToken(
        'docente',
        http().get(rutaProyecto()),
      ).expect(200);
      expect(body.requisitos).toEqual({
        proyectoAprobado: true,
        periodoAbierto: true,
        listaCargada: true,
        matriculados: 34,
      });
      expect(body.puedeRegistrar).toBe(true);
      const porId = new Map(
        (body.raps as { id: number; rubricaVigente: unknown }[]).map((rap) => [
          rap.id,
          rap.rubricaVigente,
        ]),
      );
      expect(porId.get(raps.conRubrica)).toMatchObject({
        version: 1,
        indicadores: 4,
      });
      expect(porId.get(raps.sinRubrica)).toBeNull();
    });

    it('los alcances son filtros: docente ajeno 404, líder solo su RAP', async () => {
      await conToken('docenteAjeno', http().get(rutaProyecto())).expect(404);
      await conToken('liderOtroRap', http().get(rutaProyecto())).expect(404);
      const { body } = await conToken(
        'lider',
        http().get(rutaProyecto()),
      ).expect(200);
      expect(body.puedeRegistrar).toBe(false);
      expect((body.raps as { id: number }[]).map((rap) => rap.id)).toEqual([
        raps.conRubrica,
      ]);
      await conToken('departamento', http().get(rutaProyecto())).expect(200);
    });

    it('impide iniciar si el proyecto no está aprobado', async () => {
      const { body } = await iniciar(
        'docente',
        datosInicio(),
        proyectos.sinAprobar,
      ).expect(409);
      expect(body.mensaje).toBe(MENSAJE_PROYECTO_NO_APROBADO);
    });

    it('impide iniciar en un período cerrado (RF-17)', async () => {
      await prisma.periodo_academico.update({
        where: { id: idPeriodo },
        data: { cerrado: true },
      });
      try {
        const { body } = await iniciar('docente', datosInicio()).expect(409);
        expect(body.mensaje).toBe(MENSAJE_PERIODO_CERRADO);
        const consulta = await conToken(
          'docente',
          http().get(rutaProyecto()),
        ).expect(200);
        expect(consulta.body.requisitos.periodoAbierto).toBe(false);
      } finally {
        await prisma.periodo_academico.update({
          where: { id: idPeriodo },
          data: { cerrado: false },
        });
      }
    });

    it('impide iniciar si el curso no tiene lista de estudiantes (excepción de p1)', async () => {
      const { body } = await iniciar(
        'docente',
        datosInicio(),
        proyectos.sinLista,
      ).expect(409);
      expect(body.mensaje).toBe(MENSAJE_SIN_LISTA);
    });

    it('impide iniciar si el RAP no tiene rúbrica vigente (excepción de p3)', async () => {
      const { body } = await iniciar(
        'docente',
        datosInicio(raps.sinRubrica),
      ).expect(409);
      expect(body.mensaje).toBe(MENSAJE_SIN_RUBRICA);
    });

    it('rechaza un RAP que no es del curso y datos inválidos', async () => {
      await iniciar('docente', datosInicio(raps.ajeno)).expect(400);
      await iniciar('docente', {
        ...datosInicio(),
        tipoValoracion: 'diagnostica',
      }).expect(400);
      await iniciar('docente', { ...datosInicio(), anioToma: 226 }).expect(400);
    });

    it('solo el docente asignado inicia la medición', async () => {
      await iniciar('departamento', datosInicio()).expect(403);
      await iniciar('liderOtroRap', datosInicio()).expect(403);
      await iniciar('docenteAjeno', datosInicio()).expect(404);
    });
  });

  describe('registro de la medición (HU-11-01 a HU-11-03)', () => {
    let idMedicion = 0;
    const rutaMedicion = () => `/api/mediciones/${idMedicion}`;
    const valorar = (quien: string, valoraciones: object[]) =>
      conToken(
        quien,
        http().put(`${rutaMedicion()}/valoraciones`).send({ valoraciones }),
      );

    it('inicia la medición en borrador con la rúbrica vigente', async () => {
      const { body } = await iniciar('docente', {
        ...datosInicio(),
        tamanoCohorte: null,
      }).expect(201);
      idMedicion = body.id as number;
      expect(body).toMatchObject({
        estado: 'borrador',
        tipoValoracion: 'formativa',
        periodoToma: 'primer',
        anioToma: 2024,
        versionRubrica: 1,
        tamanoCohorte: null,
        porcentajeEsperado: null,
        puedeEditar: true,
        escala: { umbralCumplimiento: 3 },
      });
      expect(body.indicadores).toHaveLength(4);
      expect(body.indicadores[0].descriptores).toHaveLength(4);
      // El retirado sin valoraciones no aparece en la hoja.
      expect(body.estudiantes).toHaveLength(34);
    });

    it('no permite una segunda medición del mismo RAP, tipo y año', async () => {
      const { body } = await iniciar('docente', datosInicio()).expect(409);
      expect(body.mensaje).toBe(MENSAJE_MEDICION_EXISTENTE);
    });

    it('editar la rúbrica después no altera la medición ya iniciada', async () => {
      await prisma.rubrica.updateMany({
        where: { id_rap: raps.conRubrica, version: 1 },
        data: { estado: 'historica' },
      });
      await crearRubrica(raps.conRubrica, 2);
      const { body } = await conToken(
        'docente',
        http().get(rutaMedicion()),
      ).expect(200);
      expect(body.versionRubrica).toBe(1);
      expect(body.indicadores[0].descriptores[0].descripcion).toContain(
        'versión 1',
      );
    });

    it('registra el instrumento de cada indicador (HU-11-02)', async () => {
      const { body } = await conToken(
        'docente',
        http()
          .put(`${rutaMedicion()}/instrumentos`)
          .send({
            indicadores: idsIndicador.map((idIndicador, i) => ({
              idIndicador,
              instrumento: `  Instrumento ${i + 1}  `,
              descripcionInstrumento: i === 0 ? 'Caso práctico' : '',
            })),
          }),
      ).expect(200);
      expect(body.indicadores[0]).toMatchObject({
        instrumento: 'Instrumento 1',
        descripcionInstrumento: 'Caso práctico',
      });
      expect(body.indicadores[1].descripcionInstrumento).toBeNull();
      await conToken(
        'docente',
        http()
          .put(`${rutaMedicion()}/instrumentos`)
          .send({
            indicadores: [{ idIndicador: 999_999_999, instrumento: 'X' }],
          }),
      ).expect(400);
    });

    it('valora a los 34 estudiantes en los cuatro indicadores (HU-11-03)', async () => {
      // Conteos de la medición real del RAP 2 en Finanzas a corto plazo, 2024-1: cuántos
      // quedan en En Desarrollo (2); el resto, en Competente (3). Asignación arbitraria.
      const enDesarrollo = [5, 10, 17, 17];
      const valoraciones = idsIndicador.flatMap((idIndicador, k) =>
        idsMatricula.map((idMatricula, i) => ({
          idMatricula,
          idIndicador,
          valor: (i * 7 + k) % 34 < enDesarrollo[k] ? 2 : 3,
        })),
      );
      const inicio = Date.now();
      const { body } = await valorar('docente', valoraciones).expect(200);
      expect(Date.now() - inicio).toBeLessThan(10_000); // RF-30, q2
      expect(body).toEqual({ registradas: 136, borradas: 0 });

      const lectura = Date.now();
      const detalle = await conToken(
        'docente',
        http().get(rutaMedicion()),
      ).expect(200);
      expect(Date.now() - lectura).toBeLessThan(5_000); // RF-30, q1
      const porNivel = idsIndicador.map(
        (idIndicador) =>
          (
            detalle.body.estudiantes as {
              valoraciones: { idIndicador: number; valor: number }[];
            }[]
          ).filter((estudiante) =>
            estudiante.valoraciones.some(
              (v) => v.idIndicador === idIndicador && v.valor === 2,
            ),
          ).length,
      );
      expect(porNivel).toEqual(enDesarrollo);
    });

    it('un nivel nulo deja al estudiante sin valorar (excepción de p6)', async () => {
      const { body } = await valorar('docente', [
        {
          idMatricula: idsMatricula[0],
          idIndicador: idsIndicador[0],
          valor: null,
        },
      ]).expect(200);
      expect(body).toEqual({ registradas: 0, borradas: 1 });
      const detalle = await conToken('docente', http().get(rutaMedicion()));
      const primero = (
        detalle.body.estudiantes as {
          idMatricula: number;
          valoraciones: { idIndicador: number }[];
        }[]
      ).find((e) => e.idMatricula === idsMatricula[0]);
      expect(primero?.valoraciones.map((v) => v.idIndicador)).not.toContain(
        idsIndicador[0],
      );
    });

    it('rechaza niveles fuera de la escala, celdas repetidas y estudiantes ajenos', async () => {
      const celda = {
        idMatricula: idsMatricula[1],
        idIndicador: idsIndicador[0],
      };
      await valorar('docente', [{ ...celda, valor: 5 }]).expect(400);
      await valorar('docente', [
        { ...celda, valor: 3 },
        { ...celda, valor: 2 },
      ]).expect(400);
      await valorar('docente', [
        { idMatricula: 999_999_999, idIndicador: idsIndicador[0], valor: 3 },
      ]).expect(400);
    });

    it('consultan el líder del RAP y el departamento, sin poder editar', async () => {
      for (const quien of ['lider', 'departamento']) {
        const { body } = await conToken(
          quien,
          http().get(rutaMedicion()),
        ).expect(200);
        expect(body.puedeEditar).toBe(false);
      }
      await conToken('liderOtroRap', http().get(rutaMedicion())).expect(404);
      await conToken('docenteAjeno', http().get(rutaMedicion())).expect(404);
      await conToken('direccion', http().get(rutaMedicion())).expect(403);
      await valorar('departamento', [
        {
          idMatricula: idsMatricula[1],
          idIndicador: idsIndicador[0],
          valor: 3,
        },
      ]).expect(403);
      await valorar('lider', [
        {
          idMatricula: idsMatricula[1],
          idIndicador: idsIndicador[0],
          valor: 3,
        },
      ]).expect(403);
    });

    it('una medición cerrada no se puede modificar (excepción de p7)', async () => {
      await prisma.medicion_rap.update({
        where: { id: idMedicion },
        data: { estado: 'cerrada' },
      });
      const { body } = await valorar('docente', [
        {
          idMatricula: idsMatricula[1],
          idIndicador: idsIndicador[0],
          valor: 4,
        },
      ]).expect(409);
      expect(body.mensaje).toBe(MENSAJE_MEDICION_CERRADA);
      await conToken(
        'docente',
        http()
          .put(`${rutaMedicion()}/instrumentos`)
          .send({
            indicadores: [
              { idIndicador: idsIndicador[0], instrumento: 'Otro' },
            ],
          }),
      ).expect(409);
      const detalle = await conToken('docente', http().get(rutaMedicion()));
      expect(detalle.body.puedeEditar).toBe(false);
      await prisma.medicion_rap.update({
        where: { id: idMedicion },
        data: { estado: 'borrador' },
      });
    });
  });
  describe('consolidado, análisis y cierre (RF-31, HU-11-04 a HU-11-07)', () => {
    let idMedicion = 0;
    const rutaMedicion = () => `/api/mediciones/${idMedicion}`;
    const valorar = (valoraciones: object[]) =>
      conToken(
        'docente',
        http().put(`${rutaMedicion()}/valoraciones`).send({ valoraciones }),
      );
    const cerrar = (quien: string) =>
      conToken(quien, http().post(`${rutaMedicion()}/cerrar`));
    const analizar = (quien: string, datos: object) =>
      conToken(quien, http().put(`${rutaMedicion()}/analisis`).send(datos));
    const porcentajes = (consolidado: {
      indicadores: { porcentajeCumplimiento: number | null }[];
    }) => consolidado.indicadores.map((i) => i.porcentajeCumplimiento);

    it('no cierra una medición sin valoraciones', async () => {
      const { body } = await iniciar('docente', {
        ...datosInicio(),
        tipoValoracion: 'sumativa',
      }).expect(201);
      idMedicion = body.id as number;
      const respuesta = await cerrar('docente').expect(409);
      expect(respuesta.body.mensaje).toBe(MENSAJE_SIN_VALORACIONES);
    });

    it('prueba de aceptación: 34 estudiantes del RAP 2 dan 85,29 %, 70,59 %, 50 % y 50 %', async () => {
      // Conteos reales de Finanzas a corto plazo, 2024-1 (Principiante, En Desarrollo,
      // Competente, Ejemplar). Los niveles se reparten de forma arbitraria entre estudiantes
      // ficticios; nunca los nombres de la medición original (Ley 1581 de 2012).
      const conteos = [
        [0, 5, 29, 0],
        [0, 10, 24, 0],
        [0, 17, 17, 0],
        [0, 17, 17, 0],
      ];
      const valoraciones = idsIndicador.flatMap((idIndicador, k) => {
        const niveles = conteos[k].flatMap((cantidad, j) =>
          Array.from({ length: cantidad }, () => j + 1),
        );
        return idsMatricula.map((idMatricula, i) => ({
          idMatricula,
          idIndicador,
          valor: niveles[(i * 11 + k * 5) % 34],
        }));
      });
      await valorar(valoraciones).expect(200);

      const inicio = Date.now();
      const { body } = await conToken(
        'lider',
        http().get(`${rutaMedicion()}/consolidado`),
      ).expect(200);
      expect(Date.now() - inicio).toBeLessThan(5_000); // RF-31, q1
      expect(porcentajes(body)).toEqual([85.29, 70.59, 50, 50]);
      expect(
        body.indicadores[0].conteos.map(
          (c: { cantidad: number }) => c.cantidad,
        ),
      ).toEqual([0, 5, 29, 0]);
      expect(body).toMatchObject({
        tamanoMuestra: 34,
        tamanoCohorte: 34,
        cohorteRegistrada: false,
        porcentajeCumplimiento: 63.97,
        metaDefinida: false,
        alcanzado: null,
        nivelesCumplimiento: ['Competente', 'Ejemplar'],
      });
      // Excepciones de p3 y p4: sin cohorte y sin meta se advierte, sin juicio.
      expect(body.advertencias).toEqual(
        expect.arrayContaining([ADVERTENCIA_SIN_COHORTE, ADVERTENCIA_SIN_META]),
      );
    });

    it('corregir una valoración actualiza el consolidado sin recalcular a mano', async () => {
      const { body: hoja } = await conToken(
        'docente',
        http().get(rutaMedicion()),
      ).expect(200);
      const enDesarrollo = (
        hoja.estudiantes as {
          idMatricula: number;
          valoraciones: { idIndicador: number; valor: number }[];
        }[]
      ).find((e) =>
        e.valoraciones.some(
          (v) => v.idIndicador === idsIndicador[0] && v.valor === 2,
        ),
      );
      const celda = {
        idMatricula: enDesarrollo?.idMatricula,
        idIndicador: idsIndicador[0],
      };
      await valorar([{ ...celda, valor: 3 }]).expect(200);
      const corregido = await conToken(
        'docente',
        http().get(`${rutaMedicion()}/consolidado`),
      );
      expect(corregido.body.indicadores[0].porcentajeCumplimiento).toBe(88.24);
      await valorar([{ ...celda, valor: 2 }]).expect(200);
      const restaurado = await conToken(
        'docente',
        http().get(`${rutaMedicion()}/consolidado`),
      );
      expect(porcentajes(restaurado.body)).toEqual([85.29, 70.59, 50, 50]);
    });

    it('el líder del RAP registra el análisis; otros roles no (HU-11-06)', async () => {
      const { body } = await analizar('lider', {
        accionesImplementadas: 'Talleres de refuerzo',
        resultadosObtenidos: '  ',
      }).expect(200);
      expect(body).toMatchObject({
        accionesImplementadas: 'Talleres de refuerzo',
        resultadosObtenidos: null,
        accionesPropuestas: null,
        puedeAnalizar: true,
      });
      await analizar('departamento', { accionesPropuestas: 'X' }).expect(403);
      await analizar('liderOtroRap', { accionesPropuestas: 'X' }).expect(404);
    });

    it('no cierra por debajo de la meta sin acciones propuestas (excepción de p6)', async () => {
      await prisma.medicion_rap.update({
        where: { id: idMedicion },
        data: { porcentaje_esperado: 70 },
      });
      const consolidado = await conToken(
        'docente',
        http().get(`${rutaMedicion()}/consolidado`),
      );
      expect(consolidado.body).toMatchObject({
        metaDefinida: true,
        porcentajeEsperado: 70,
        alcanzado: false,
      });
      expect(
        consolidado.body.indicadores.map(
          (i: { alcanzado: boolean }) => i.alcanzado,
        ),
      ).toEqual([true, true, false, false]);

      const { body } = await cerrar('lider').expect(409);
      expect(body.mensaje).toBe(MENSAJE_FALTAN_ACCIONES_PROPUESTAS);
      await analizar('docente', {
        accionesPropuestas: 'Guía de casos sobre decisiones financieras',
      }).expect(200);
    });

    it('cierra con usuario y fecha y bloquea las valoraciones (HU-11-07)', async () => {
      await cerrar('departamento').expect(403);
      const { body } = await cerrar('lider').expect(200);
      expect(body).toMatchObject({
        estado: 'cerrada',
        cerradoPor: 'Usuario lider E2E',
        puedeEditar: false,
        puedeAnalizar: false,
      });
      expect(body.fechaCierre).not.toBeNull();
      await valorar([
        {
          idMatricula: idsMatricula[0],
          idIndicador: idsIndicador[0],
          valor: 4,
        },
      ]).expect(409);
      await analizar('lider', { accionesPropuestas: 'Otra' }).expect(409);
      await cerrar('lider').expect(409);
    });

    it('solo el departamento reabre una medición cerrada (RF-30, excepción de p7)', async () => {
      const reabrir = (quien: string) =>
        conToken(quien, http().post(`${rutaMedicion()}/reabrir`));
      await reabrir('docente').expect(403);
      await reabrir('lider').expect(403);
      const departamento = await conToken(
        'departamento',
        http().get(rutaMedicion()),
      ).expect(200);
      expect(departamento.body.puedeReabrir).toBe(true);

      const { body } = await reabrir('departamento').expect(200);
      expect(body).toMatchObject({
        estado: 'borrador',
        cerradoPor: null,
        fechaCierre: null,
      });
      await reabrir('departamento').expect(409);
      await cerrar('docente').expect(200);
    });

    it('lista las mediciones visibles con su resultado', async () => {
      const lider = await conToken(
        'lider',
        http().get('/api/mediciones?estado=cerrada'),
      ).expect(200);
      expect(
        (lider.body.elementos as { id: number }[]).map((m) => m.id),
      ).toContain(idMedicion);
      const fila = (
        lider.body.elementos as { id: number; porcentajeCumplimiento: number }[]
      ).find((m) => m.id === idMedicion);
      expect(fila?.porcentajeCumplimiento).toBe(63.97);
      const otro = await conToken(
        'liderOtroRap',
        http().get('/api/mediciones'),
      ).expect(200);
      expect(otro.body.total).toBe(0);
      await conToken('direccion', http().get('/api/mediciones')).expect(403);
    });
  });

  describe('reporte de logro de los RAP (RF-32, HU-11-08)', () => {
    const consulta = (extra = '') =>
      `/api/reportes/logro-rap?idPrograma=${idPrograma}&idPeriodo=${idPeriodo}${extra}`;
    let idPeriodoAnterior = 0;

    beforeAll(async () => {
      // Un período anterior con una medición cerrada del mismo RAP, para la comparación.
      await prisma.periodo_academico.update({
        where: { id: idPeriodo },
        data: { fecha_inicio: new Date('2099-08-03T00:00:00.000Z') },
      });
      const anterior = await prisma.periodo_academico.create({
        data: {
          codigo: `E2E-RF32-ANT-${sufijo}`,
          fecha_inicio: new Date('2099-02-02T00:00:00.000Z'),
          numero_semanas: 16,
        },
      });
      idPeriodoAnterior = anterior.id;
      creados.periodos.push(anterior.id);
      const asignatura = await prisma.asignatura.create({
        data: {
          id_programa: idPrograma,
          codigo_interno: `ANT-${sufijo}`,
          nombre: 'Asignatura ANT E2E',
        },
      });
      creados.asignaturas.push(asignatura.id);
      const proyecto = await prisma.proyecto_docente.create({
        data: {
          id_asignatura: asignatura.id,
          id_periodo: idPeriodoAnterior,
          id_estado: await estadoPorCodigo('cerrado'),
          grupo: 'E2E',
        },
      });
      creados.proyectos.push(proyecto.id);
      const rubrica = await prisma.rubrica.findFirstOrThrow({
        where: { id_rap: raps.conRubrica, version: 1 },
      });
      const niveles = await prisma.nivel_escala.findMany({
        where: { id_escala: idEscala },
      });
      const nivel = (valor: number) =>
        niveles.find((fila) => fila.valor === valor)?.id;
      const medicion = await prisma.medicion_rap.create({
        data: {
          id_proyecto_docente: proyecto.id,
          id_rap: raps.conRubrica,
          id_rubrica: rubrica.id,
          tipo_valoracion: 'formativa',
          periodo_toma: 'primer',
          anio_toma: 2099,
          estado: 'cerrada',
          medicion_indicador: {
            create: idsIndicador.map((idIndicador) => ({
              id_indicador: idIndicador,
            })),
          },
        },
        include: { medicion_indicador: true },
      });
      // Cuatro estudiantes: 3 de 4 en Competente o Ejemplar en cada indicador = 75 %.
      for (let n = 1; n <= 4; n += 1) {
        const estudiante = await prisma.estudiante.create({
          data: {
            identificacion: `${prefijoDocumento}ant-${n}`,
            nombres: `Estudiante anterior ${n}`,
            apellidos: 'Ficticio E2E',
          },
        });
        const matricula = await prisma.matricula.create({
          data: {
            id_proyecto_docente: proyecto.id,
            id_estudiante: estudiante.id,
            estado: 'matriculado',
          },
        });
        await prisma.valoracion_estudiante.createMany({
          data: medicion.medicion_indicador.map((fila) => ({
            id_medicion_indicador: fila.id,
            id_matricula: matricula.id,
            id_nivel: nivel(n === 1 ? 2 : 3),
          })),
        });
      }
    });

    it('presenta cada RAP con sus asignaturas, el porcentaje y los no evaluados', async () => {
      const inicio = Date.now();
      const { body } = await conToken(
        'departamento',
        http().get(consulta()),
      ).expect(200);
      expect(Date.now() - inicio).toBeLessThan(10_000); // RF-32, q1
      const porId = new Map(
        (body.raps as { id: number }[]).map((rap) => [rap.id, rap]),
      );
      expect(porId.get(raps.conRubrica)).toMatchObject({
        evaluado: true,
        porcentajeCumplimiento: 63.97,
        // La meta congelada en la medición (70 %), no la vigente del programa (sin definir).
        porcentajeEsperado: 70,
        alcanzado: false,
        comparacion: [
          {
            periodo: `E2E-RF32-ANT-${sufijo}`,
            porcentajeCumplimiento: 75,
            mediciones: 1,
          },
        ],
        motivoSinComparacion: null,
      });
      const evaluado = porId.get(raps.conRubrica) as unknown as {
        asignaturas: {
          asignatura: string;
          porcentajeCumplimiento: number;
          accionesPropuestas: string;
          indicadores: { porcentajeCumplimiento: number }[];
        }[];
      };
      // Solo la medición cerrada; la formativa sigue en borrador.
      expect(evaluado.asignaturas).toHaveLength(1);
      expect(evaluado.asignaturas[0]).toMatchObject({
        asignatura: 'Asignatura FCP E2E',
        porcentajeCumplimiento: 63.97,
        accionesPropuestas: 'Guía de casos sobre decisiones financieras',
      });
      expect(
        evaluado.asignaturas[0].indicadores.map(
          (i) => i.porcentajeCumplimiento,
        ),
      ).toEqual([85.29, 70.59, 50, 50]);
      // Excepciones de p2 y p4: no evaluado, en lugar de omitirlo, y motivo sin comparación.
      expect(porId.get(raps.sinRubrica)).toMatchObject({
        evaluado: false,
        asignaturas: [],
        porcentajeCumplimiento: null,
        comparacion: [],
        motivoSinComparacion: MOTIVO_SIN_PERIODOS_ANTERIORES,
      });
      expect(body.metaDefinida).toBe(false);
    });

    it('filtra por RAP y respeta los alcances', async () => {
      const unRap = await conToken(
        'direccion',
        http().get(consulta(`&idRap=${raps.sinRubrica}`)),
      ).expect(200);
      expect((unRap.body.raps as { id: number }[]).map((r) => r.id)).toEqual([
        raps.sinRubrica,
      ]);
      // El líder solo ve el RAP que lidera.
      const lider = await conToken('lider', http().get(consulta())).expect(200);
      expect((lider.body.raps as { id: number }[]).map((r) => r.id)).toEqual([
        raps.conRubrica,
      ]);
      await conToken(
        'lider',
        http().get(consulta(`&idRap=${raps.ajeno}`)),
      ).expect(404);
      await conToken('docente', http().get(consulta())).expect(403);
      await conToken('estudiante', http().get(consulta())).expect(403);
      await conToken(
        'departamento',
        http().get(`/api/reportes/logro-rap?idPrograma=${idPrograma}`),
      ).expect(400);
    });

    it('ofrece los filtros según el alcance', async () => {
      const { body } = await conToken(
        'lider',
        http().get('/api/reportes/logro-rap/filtros'),
      ).expect(200);
      const programa = (
        body.programas as { id: number; raps: { id: number }[] }[]
      ).find((p) => p.id === idPrograma);
      expect(programa?.raps.map((r) => r.id)).toEqual([raps.conRubrica]);
      expect((body.periodos as { id: number }[]).map((p) => p.id)).toEqual(
        expect.arrayContaining([idPeriodo, idPeriodoAnterior]),
      );
    });

    it('exporta el reporte a Excel (p5)', async () => {
      const respuesta = await conToken(
        'departamento',
        http()
          .get(consulta().replace('/logro-rap?', '/logro-rap/excel?'))
          .buffer(true)
          .parse((res, listo) => {
            const partes: Buffer[] = [];
            res.on('data', (parte: Buffer) => partes.push(parte));
            res.on('end', () => listo(null, Buffer.concat(partes)));
          }),
      ).expect(200);
      expect(respuesta.headers['content-type']).toContain('spreadsheetml');
      expect(respuesta.headers['content-disposition']).toContain('.xlsx');
      const libro = respuesta.body as Buffer;
      expect(libro.subarray(0, 2).toString()).toBe('PK');
    });
  });
});
