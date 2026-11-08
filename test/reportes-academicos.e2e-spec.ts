import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { ROL } from '../src/auth/roles.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  SIN_ESTADO,
  TIPO_REPORTE,
} from '../src/reportes/academicos.service.js';
import {
  borrarPlanesDePrueba,
  planDePrueba,
} from './utilidades/plan-estudio.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed.
describe('Reportes académicos (e2e) · RF-28, HU-12-03 y HU-12-05', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;

  const creados = {
    roles: [] as number[],
    estados: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    periodos: [] as number[],
    raps: [] as number[],
    asignaturas: [] as number[],
    proyectos: [] as number[],
    usuarios: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};
  const raps = { dos: 0, cinco: 0, otroPrograma: 0 };
  const proyectos = { aprobado: 0, diligenciamiento: 0, otroPrograma: 0 };
  let idPeriodo = 0;

  const http = () => request(app.getHttpServer());
  const pedir = (quien: string, ruta: string) =>
    http()
      .get(`/api/reportes/${ruta}`)
      .set('Authorization', `Bearer ${tokens[quien]}`);
  const conPeriodo = (ruta: string, extra = '') =>
    `${ruta}?idPeriodo=${idPeriodo}${extra}`;
  const binario = (peticion: request.Test) =>
    peticion.buffer(true).parse((res, listo) => {
      const partes: Buffer[] = [];
      res.on('data', (parte: Buffer) => partes.push(parte));
      res.on('end', () => listo(null, Buffer.concat(partes)));
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

  async function estadoPorCodigo(codigo: string, orden: number) {
    const existente = await prisma.estado_proyecto.findUnique({
      where: { codigo },
    });
    if (existente) {
      return existente.id;
    }
    const estado = await prisma.estado_proyecto.create({
      data: { codigo, nombre: codigo, orden, permite_edicion: true },
    });
    creados.estados.push(estado.id);
    return estado.id;
  }

  async function crearUsuario(
    clave: string,
    rol: string,
    idPrograma: number | null,
  ) {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.rf28.${clave}.${sufijo}@prueba.urap.local`,
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
    estado: string,
    idsRap: number[],
  ) {
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
        id_estado: await estadoPorCodigo(estado, estado === 'aprobado' ? 4 : 1),
        grupo: 'E2E',
        proyecto_docente_rap: {
          create: idsRap.map((idRap) => ({ id_rap: idRap })),
        },
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
      data: { nombre: `Facultad E2E RF-28 ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const [programaA, programaB] = await Promise.all(
      ['A', 'B'].map((letra) =>
        prisma.programa.create({
          data: {
            id_facultad: facultad.id,
            nombre: `Programa E2E RF-28 ${letra} ${sufijo}`,
          },
        }),
      ),
    );
    creados.programas.push(programaA.id, programaB.id);
    const periodo = await prisma.periodo_academico.create({
      data: {
        codigo: `E2E-RF28-${sufijo}`,
        numero_semanas: 2,
        activo: true,
      },
    });
    idPeriodo = periodo.id;
    creados.periodos.push(periodo.id);
    for (const [clave, idPrograma, numero] of [
      ['dos', programaA.id, 2],
      ['cinco', programaA.id, 5],
      ['otroPrograma', programaB.id, 2],
    ] as const) {
      const rap = await prisma.rap.create({
        data: {
          id_programa: idPrograma,
          codigo: `RAP ${numero}`,
          numero,
          descripcion: `RAP ${numero} de prueba`,
        },
      });
      raps[clave] = rap.id;
      creados.raps.push(rap.id);
    }

    await crearUsuario('administrador', ROL.administrador, null);
    await crearUsuario('departamento', ROL.departamento, programaA.id);
    await crearUsuario('direccion', ROL.direccion, programaA.id);
    await crearUsuario('docente', ROL.docente, programaA.id);
    await crearUsuario('lider', ROL.liderRap, programaA.id);
    await prisma.lider_rap.create({
      data: {
        id_rap: raps.dos,
        id_usuario: usuarios.lider,
        id_periodo: idPeriodo,
      },
    });

    proyectos.aprobado = await crearProyecto(
      programaA.id,
      'Aprobado',
      'aprobado',
      [raps.dos],
    );
    await prisma.proyecto_docente.update({
      where: { id: proyectos.aprobado },
      data: {
        rac: {
          create: [
            {
              codigo: 'RAC 1',
              descripcion: 'Analiza estados financieros',
              orden: 1,
              rac_rap: {
                create: [
                  {
                    id_rap: raps.dos,
                    descripcion_contribucion: 'Aporta al análisis financiero',
                  },
                ],
              },
            },
          ],
        },
        evidencia_rap: {
          create: [
            {
              id_rap: raps.dos,
              nombre_original: 'foto-1.jpg',
              fecha_subida: new Date('2026-10-01T15:00:00.000Z'),
            },
            {
              id_rap: raps.dos,
              nombre_original: 'foto-2.jpg',
              fecha_subida: new Date('2026-10-08T15:00:00.000Z'),
            },
          ],
        },
      },
    });
    proyectos.diligenciamiento = await crearProyecto(
      programaA.id,
      'Diligenciamiento',
      'en_diligenciamiento',
      [raps.dos, raps.cinco],
    );
    proyectos.otroPrograma = await crearProyecto(
      programaB.id,
      'OtroPrograma',
      'aprobado',
      [raps.otroPrograma],
    );
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.evidencia_rap.deleteMany({ where: deProyectos });
      const racs = await prisma.rac.findMany({
        where: deProyectos,
        select: { id: true },
      });
      await prisma.rac_rap.deleteMany({
        where: { id_rac: { in: racs.map((rac) => rac.id) } },
      });
      await prisma.rac.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.reporte_academico.deleteMany({
        where: { id_generado_por: { in: creados.usuarios } },
      });
      await prisma.lider_rap.deleteMany({
        where: { id_rap: { in: creados.raps } },
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
      await prisma.estado_proyecto.deleteMany({
        where: { id: { in: creados.estados } },
      });
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
    }
    await app?.close();
  });

  describe('cumplimiento por período (HU-12-03)', () => {
    it('solo el Administrador, el Departamento y la Dirección', async () => {
      await pedir('docente', conPeriodo('cumplimiento')).expect(403);
      await pedir('lider', conPeriodo('cumplimiento')).expect(403);
      await pedir('direccion', conPeriodo('cumplimiento')).expect(200);
    });

    it('presenta los proyectos del programa, sus estados y su diligenciamiento', async () => {
      const inicio = Date.now();
      const { body } = await pedir(
        'departamento',
        conPeriodo('cumplimiento'),
      ).expect(200);
      expect(Date.now() - inicio).toBeLessThan(5_000); // RF-28, q1
      expect(
        (body.proyectos as { idProyecto: number }[]).map((p) => p.idProyecto),
      ).toEqual(
        expect.arrayContaining([
          proyectos.aprobado,
          proyectos.diligenciamiento,
        ]),
      );
      expect(body.resumen).toMatchObject({
        proyectos: 2,
        seccionesTotales: 12,
        conPendientes: 2,
      });
      expect(
        (body.resumen.porEstado as { codigo: string; cantidad: number }[])
          .map(({ codigo, cantidad }) => ({ codigo, cantidad }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      ).toEqual([
        { codigo: 'aprobado', cantidad: 1 },
        { codigo: 'en_diligenciamiento', cantidad: 1 },
      ]);
    });

    it('filtra por estado e informa cuando no hay resultados (excepción de p3)', async () => {
      const aprobados = await pedir(
        'departamento',
        conPeriodo('cumplimiento', '&estado=aprobado'),
      ).expect(200);
      expect(
        (aprobados.body.proyectos as { idProyecto: number }[]).map(
          (p) => p.idProyecto,
        ),
      ).toEqual([proyectos.aprobado]);
      const ninguno = await pedir(
        'departamento',
        conPeriodo('cumplimiento', '&estado=cerrado'),
      ).expect(200);
      expect(ninguno.body.proyectos).toEqual([]);
      expect(ninguno.body.resumen.proyectos).toBe(0);
    });

    it('cuenta aparte los proyectos sin estado, para que el resumen sume el total', async () => {
      const { id_estado: original } =
        await prisma.proyecto_docente.findUniqueOrThrow({
          where: { id: proyectos.diligenciamiento },
          select: { id_estado: true },
        });
      await prisma.proyecto_docente.update({
        where: { id: proyectos.diligenciamiento },
        data: { id_estado: null },
      });
      try {
        const { body } = await pedir(
          'departamento',
          conPeriodo('cumplimiento'),
        ).expect(200);
        const porEstado = body.resumen.porEstado as {
          codigo: string;
          cantidad: number;
        }[];
        expect(porEstado.at(-1)).toMatchObject({
          codigo: SIN_ESTADO.codigo,
          cantidad: 1,
        });
        expect(
          porEstado.reduce((total, fila) => total + fila.cantidad, 0),
        ).toBe(body.resumen.proyectos);
      } finally {
        await prisma.proyecto_docente.update({
          where: { id: proyectos.diligenciamiento },
          data: { id_estado: original },
        });
      }
    });

    it('registra cada generación con el usuario y la fecha (p6) y exporta a Excel (p5)', async () => {
      const registros = await prisma.reporte_academico.findMany({
        where: {
          id_generado_por: usuarios.departamento,
          tipo: TIPO_REPORTE.cumplimiento,
        },
      });
      expect(registros.length).toBeGreaterThanOrEqual(3);
      expect(registros[0].fecha_generacion).not.toBeNull();
      // La creación de cada registro queda en auditoría con el usuario y la IP (RF-29).
      const auditada = await prisma.auditoria.findFirst({
        where: {
          id_usuario: usuarios.departamento,
          accion: 'crear',
          tabla_afectada: 'reporte_academico',
          id_registro: registros[0].id,
        },
      });
      expect(auditada?.ip).toBeTruthy();
      expect(auditada?.valor_nuevo).toMatchObject({
        tipo: TIPO_REPORTE.cumplimiento,
      });
      const libro = await binario(
        pedir('departamento', conPeriodo('cumplimiento/excel')),
      ).expect(200);
      expect((libro.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    });
  });

  describe('contribución RAC-RAP (HU-12-05)', () => {
    type Asignatura = {
      idProyecto: number;
      racs: { codigo: string; contribucion: string | null }[];
      evidencias: number;
      ultimaEvidencia: string | null;
    };
    type Rap = { id: number; asignaturas: Asignatura[] };

    it('al líder solo le muestra los RAP que lidera', async () => {
      const { body } = await pedir(
        'lider',
        conPeriodo('contribucion-rac-rap'),
      ).expect(200);
      const lista = body.raps as Rap[];
      expect(lista.map((rap) => rap.id)).toEqual([raps.dos]);
      const porProyecto = new Map(
        lista[0].asignaturas.map((asignatura) => [
          asignatura.idProyecto,
          asignatura,
        ]),
      );
      expect(porProyecto.get(proyectos.aprobado)).toMatchObject({
        racs: [
          { codigo: 'RAC 1', contribucion: 'Aporta al análisis financiero' },
        ],
        evidencias: 2,
        ultimaEvidencia: '2026-10-08T15:00:00.000Z',
      });
      expect(porProyecto.get(proyectos.diligenciamiento)).toMatchObject({
        racs: [],
        evidencias: 0,
        ultimaEvidencia: null,
      });
      await pedir(
        'lider',
        conPeriodo('contribucion-rac-rap', `&idRap=${raps.cinco}`),
      ).expect(404);
    });

    it('a los roles del programa les muestra los RAP de su programa', async () => {
      const { body } = await pedir(
        'departamento',
        conPeriodo('contribucion-rac-rap'),
      ).expect(200);
      const lista = body.raps as Rap[];
      expect(lista.map((rap) => rap.id)).toEqual([raps.dos, raps.cinco]);
      expect(lista[1].asignaturas.map((a) => a.idProyecto)).toEqual([
        proyectos.diligenciamiento,
      ]);
      const unRap = await pedir(
        'direccion',
        conPeriodo('contribucion-rac-rap', `&idRap=${raps.cinco}`),
      ).expect(200);
      expect((unRap.body.raps as Rap[]).map((rap) => rap.id)).toEqual([
        raps.cinco,
      ]);
      await pedir(
        'departamento',
        conPeriodo('contribucion-rac-rap', `&idRap=${raps.otroPrograma}`),
      ).expect(404);
      await pedir('docente', conPeriodo('contribucion-rac-rap')).expect(403);
    });

    it('registra la generación y exporta a Excel', async () => {
      const registros = await prisma.reporte_academico.count({
        where: {
          id_generado_por: usuarios.lider,
          tipo: TIPO_REPORTE.contribucion,
        },
      });
      expect(registros).toBeGreaterThanOrEqual(1);
      const libro = await binario(
        pedir('lider', conPeriodo('contribucion-rac-rap/excel')),
      ).expect(200);
      expect(libro.headers['content-disposition']).toContain(
        'contribucion-rac-rap',
      );
    });
  });
});
