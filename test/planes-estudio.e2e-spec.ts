import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  asegurarCatalogoDePermisos,
  asegurarPermisosDeRol,
  borrarCatalogoDePrueba,
  borrarMatrizDePrueba,
  matrizDePrueba,
} from './utilidades/permisos.js';
import { borrarPlanesDePrueba } from './utilidades/plan-estudio.js';

interface AsignaturaOpcion {
  id: number;
  codigo: string | null;
  nombre: string;
  semestre: number | null;
  planEstudio: { id: number; codigo: string | null; nombre: string | null };
}

// Modelo v2.5 (RF-04 v1.1, HU-03-02): un programa con dos planes vigentes, el 1702 y el 2502, y
// la misma asignatura en los dos con distinto código. Es el caso real de Comportamiento
// organizacional (FP15503 en el 1702, IX24193 en el 2502), con los datos de sus formatos.
// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus propios
// datos ficticios y los borra al terminar; funciona con o sin el seed.
describe('Planes de estudio (e2e) · modelo v2.5, RF-04 y RF-08', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  const NOMBRE = 'Comportamiento organizacional';
  const FICHA = {
    semestre: 5,
    componente: 'PROFESIONAL',
    tipo_curso: 'Obligatorio',
    creditos: 2,
    horas_tde: 32,
    horas_tdp: 0,
    horas_ti: 64,
    horas_totales: 96,
  };

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
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  let idPrograma: number;
  let plan1702: number;
  let plan2502: number;
  let comportamiento1702: number;
  let comportamiento2502: number;
  let rap6: number;

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

  async function crearUsuario(clave: string, nombreRol: string): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.planes.${clave}.${sufijo}@prueba.urap.local`,
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

  async function crearPlan(codigo: string): Promise<number> {
    const plan = await prisma.plan_estudio.create({
      data: {
        id_programa: idPrograma,
        codigo,
        nombre: `Plan de estudios ${codigo}`,
      },
    });
    return plan.id;
  }

  async function crearAsignatura(
    idPlan: number,
    codigo: string,
    nombre = `Asignatura ${codigo}`,
  ): Promise<number> {
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: idPlan,
        codigo_interno: codigo,
        nombre,
        ...FICHA,
      },
    });
    creados.asignaturas.push(asignatura.id);
    return asignatura.id;
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
      data: { nombre: `Facultad E2E planes ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const programa = await prisma.programa.create({
      data: {
        id_facultad: facultad.id,
        nombre: `Programa E2E planes ${sufijo}`,
      },
    });
    idPrograma = programa.id;
    creados.programas.push(idPrograma);

    plan1702 = await crearPlan('1702');
    plan2502 = await crearPlan('2502');
    comportamiento1702 = await crearAsignatura(plan1702, 'FP15503', NOMBRE);
    comportamiento2502 = await crearAsignatura(plan2502, 'IX24193', NOMBRE);

    // Los RAP siguen siendo del programa; el mapeo a RAP solo se conoce en el 1702.
    const rap = await prisma.rap.create({
      data: {
        id_programa: idPrograma,
        numero: 6,
        codigo: 'RAP 6',
        descripcion: 'RAP ficticio 6',
      },
    });
    rap6 = rap.id;
    creados.raps.push(rap6);
    await prisma.asignatura_rap.create({
      data: { id_asignatura: comportamiento1702, id_rap: rap6 },
    });

    await crearUsuario('departamento', ROL.departamento);
    await crearUsuario('docente', ROL.docente);
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
      const deProyectos = { id_proyecto_docente: { in: idsProyectos } };
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: idsProyectos } },
      });
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
  });

  it('el asistente lista la asignatura una vez por plan, con su plan y su código', async () => {
    const respuesta = await como('departamento')
      .get(`/proyectos-docentes/asistente/programas/${idPrograma}/asignaturas`)
      .expect(200);
    const filas = (respuesta.body as AsignaturaOpcion[]).filter(
      ({ nombre }) => nombre === NOMBRE,
    );
    expect(filas).toEqual([
      {
        id: comportamiento1702,
        codigo: 'FP15503',
        nombre: NOMBRE,
        semestre: 5,
        planEstudio: {
          id: plan1702,
          codigo: '1702',
          nombre: 'Plan de estudios 1702',
        },
      },
      {
        id: comportamiento2502,
        codigo: 'IX24193',
        nombre: NOMBRE,
        semestre: 5,
        planEstudio: {
          id: plan2502,
          codigo: '2502',
          nombre: 'Plan de estudios 2502',
        },
      },
    ]);
  });

  it('cada fila trae su plan y los mismos datos; el 2502, sin mapeo, ofrece todos los RAP', async () => {
    const [de1702, de2502] = await Promise.all(
      [comportamiento1702, comportamiento2502].map((id) =>
        como('departamento')
          .get(`/proyectos-docentes/asistente/asignaturas/${id}`)
          .expect(200),
      ),
    );
    const comunes = {
      programa: `Programa E2E planes ${sufijo}`,
      asignatura: NOMBRE,
      semestre: 5,
      creditos: 2,
      horasTde: 32,
      horasTdp: 0,
      horasTi: 64,
      informacionIncompleta: false,
    };
    expect(de1702.body).toMatchObject({
      informacion: { ...comunes, planEstudio: '1702', codigo: 'FP15503' },
      raps: [{ id: rap6, mapeado: true }],
    });
    expect(de2502.body).toMatchObject({
      informacion: { ...comunes, planEstudio: '2502', codigo: 'IX24193' },
      raps: [{ id: rap6, mapeado: false }],
    });
  });

  it('crea un proyecto docente en cada una, en el mismo período y grupo', async () => {
    const crear = (idAsignatura: number) =>
      como('departamento')
        .post('/proyectos-docentes', {
          idAsignatura,
          grupo: 'A',
          idsRap: [rap6],
          docentes: [{ idUsuario: usuarios.docente, responsable: true }],
        })
        .expect(201);
    const en1702 = await crear(comportamiento1702);
    const en2502 = await crear(comportamiento2502);

    expect(en1702.body).toMatchObject({
      idAsignatura: comportamiento1702,
      codigoAsignatura: 'FP15503',
      planEstudio: '1702',
      informacion: { planEstudio: '1702', codigo: 'FP15503' },
    });
    expect(en2502.body).toMatchObject({
      idAsignatura: comportamiento2502,
      codigoAsignatura: 'IX24193',
      planEstudio: '2502',
      informacion: { planEstudio: '2502', codigo: 'IX24193' },
    });

    const filas = await prisma.proyecto_docente.findMany({
      where: { id_asignatura: { in: creados.asignaturas } },
      select: {
        grupo: true,
        asignatura: {
          select: {
            codigo_interno: true,
            plan_estudio: { select: { codigo: true, id_programa: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    expect(filas).toEqual([
      {
        grupo: 'A',
        asignatura: {
          codigo_interno: 'FP15503',
          plan_estudio: { codigo: '1702', id_programa: idPrograma },
        },
      },
      {
        grupo: 'A',
        asignatura: {
          codigo_interno: 'IX24193',
          plan_estudio: { codigo: '2502', id_programa: idPrograma },
        },
      },
    ]);
  });

  it('la bandeja muestra el plan de cada proyecto', async () => {
    const respuesta = await como('departamento')
      .get('/proyectos-docentes?tamano=50')
      .expect(200);
    const delCaso = (
      respuesta.body as {
        elementos: { idAsignatura: number; planEstudio: string | null }[];
      }
    ).elementos
      .filter(({ idAsignatura }) =>
        [comportamiento1702, comportamiento2502].includes(idAsignatura),
      )
      .map(({ planEstudio }) => planEstudio)
      .sort();
    expect(delCaso).toEqual(['1702', '2502']);
  });

  it('admite el mismo código en dos planes, pero no dos veces en el mismo plan', async () => {
    const codigo = `COMUN-${sufijo}`;
    await crearAsignatura(plan1702, codigo);
    await crearAsignatura(plan2502, codigo);
    await expect(crearAsignatura(plan1702, codigo)).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(
      await prisma.asignatura.count({ where: { codigo_interno: codigo } }),
    ).toBe(2);
  });
});
