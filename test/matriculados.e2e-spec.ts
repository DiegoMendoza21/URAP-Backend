import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import writeXlsxFile from 'write-excel-file/node';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { ROL } from '../src/auth/roles.js';
import { PARAMETRO } from '../src/common/parametros/parametros.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import {
  borrarPlanesDePrueba,
  planDePrueba,
} from './utilidades/plan-estudio.js';

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed.
// Estudiantes ficticios: nunca nombres ni documentos reales (Ley 1581 de 2012).
describe('Estudiantes matriculados (e2e) · RF-22, HU-09-01', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';
  /** Documento ficticio y único por ejecución: E2E-<9 dígitos>-<n>. */
  const documento = (n: number) => `E2E-${sufijo.slice(-9)}-${n}`;

  let app: INestApplication;
  let prisma: PrismaService;
  let hash: string;
  let idProyecto: number;
  let idProyectoOtroPrograma: number;

  const creados = {
    roles: [] as number[],
    parametros: [] as number[],
    facultades: [] as number[],
    programas: [] as number[],
    asignaturas: [] as number[],
    usuarios: [] as number[],
    proyectos: [] as number[],
  };
  const tokens: Record<string, string> = {};
  const usuarios: Record<string, number> = {};

  const http = () => request(app.getHttpServer());
  const ruta = (id = idProyecto) =>
    `/api/proyectos-docentes/${id}/matriculados`;
  const consultar = (quien: string, consulta = '', id = idProyecto) =>
    http()
      .get(`${ruta(id)}${consulta}`)
      .set('Authorization', `Bearer ${tokens[quien]}`);
  const cargar = (
    quien: string,
    archivo: Buffer,
    nombre = 'lista.xlsx',
    id = idProyecto,
  ) =>
    http()
      .post(ruta(id))
      .set('Authorization', `Bearer ${tokens[quien]}`)
      .attach('archivo', archivo, nombre);

  type Fila = [string, string, string, string?];
  const libro = (filas: Fila[]) =>
    writeXlsxFile([
      ['Documento', 'Nombres', 'Apellidos', 'Correo'].map((value) => ({
        value,
      })),
      ...filas.map((fila) =>
        [0, 1, 2, 3].map((i) => (fila[i] ? { value: fila[i] } : null)),
      ),
    ]).toBuffer();

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

  async function asegurarParametro(clave: string, valor: string) {
    if (!(await prisma.parametro_sistema.findUnique({ where: { clave } }))) {
      const parametro = await prisma.parametro_sistema.create({
        data: { clave, valor, tipo_dato: 'texto' },
      });
      creados.parametros.push(parametro.id);
    }
  }

  async function crearProyecto(idPrograma: number, codigo: string) {
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, idPrograma),
        codigo_interno: `${codigo}-${sufijo}`,
        nombre: `Asignatura ${codigo}`,
      },
    });
    creados.asignaturas.push(asignatura.id);
    const proyecto = await prisma.proyecto_docente.create({
      data: { id_asignatura: asignatura.id, grupo: 'E2E' },
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

    await asegurarParametro(PARAMETRO.archivoTamanoMaximoMb, '10');
    await asegurarParametro(
      PARAMETRO.archivoTiposPermitidos,
      'jpg,png,pdf,xlsx,docx',
    );

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E RF-22 ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const [programaA, programaB] = await Promise.all(
      ['A', 'B'].map((letra) =>
        prisma.programa.create({
          data: {
            id_facultad: facultad.id,
            nombre: `Programa E2E RF-22 ${letra} ${sufijo}`,
          },
        }),
      ),
    );
    creados.programas.push(programaA.id, programaB.id);

    idProyecto = await crearProyecto(programaA.id, 'MAT');
    idProyectoOtroPrograma = await crearProyecto(programaB.id, 'OTR');

    await crearUsuario('administrador', ROL.administrador, null);
    await crearUsuario('administradorOtro', ROL.administrador, programaB.id);
    await crearUsuario('departamento', ROL.departamento, programaA.id);
    await crearUsuario('docenteAsignado', ROL.docente, programaA.id);
    await crearUsuario('docenteAjeno', ROL.docente, programaA.id);
    await crearUsuario('estudiante', ROL.estudiante, programaA.id);
    await prisma.proyecto_docente_docente.create({
      data: {
        id_proyecto_docente: idProyecto,
        id_usuario: usuarios.docenteAsignado,
        responsable: true,
        orden: 1,
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.auditoria.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
      });
      await prisma.matricula.deleteMany({ where: deProyectos });
      await prisma.estudiante.deleteMany({
        where: { identificacion: { startsWith: `E2E-${sufijo.slice(-9)}-` } },
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
      await borrarPlanesDePrueba(prisma, creados.programas);
      await prisma.programa.deleteMany({
        where: { id: { in: creados.programas } },
      });
      await prisma.facultad.deleteMany({
        where: { id: { in: creados.facultades } },
      });
      await prisma.parametro_sistema.deleteMany({
        where: { id: { in: creados.parametros } },
      });
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
    }
    await app?.close();
  });

  describe('acceso', () => {
    it('exige sesión', async () => {
      await http().get(ruta()).expect(401);
    });

    it('solo el Administrador carga la lista', async () => {
      const archivo = await libro([[documento(1), 'Uno', 'Ficticio']]);
      for (const quien of ['docenteAsignado', 'departamento', 'estudiante']) {
        await cargar(quien, archivo).expect(403);
      }
    });

    it('consultan el Administrador y el docente asignado; nadie más ve datos personales', async () => {
      await consultar('administrador').expect(200);
      await consultar('docenteAsignado').expect(200);
      await consultar('departamento').expect(403);
      await consultar('estudiante').expect(403);
      await consultar('docenteAjeno').expect(404);
    });

    it('el administrador de otro programa no alcanza el proyecto', async () => {
      await consultar('administradorOtro').expect(404);
      await cargar(
        'administradorOtro',
        await libro([[documento(1), 'Uno', 'Ficticio']]),
      ).expect(404);
      await consultar('administradorOtro', '', idProyectoOtroPrograma).expect(
        200,
      );
    });

    it('responde 404 si el proyecto no existe', async () => {
      await consultar('administrador', '', 999_999_999).expect(404);
    });
  });

  describe('carga', () => {
    it('sin lista cargada, la consulta lo dice con ultimaCarga nula (RF-22, p3)', async () => {
      const { body } = await consultar('docenteAsignado').expect(200);
      expect(body).toMatchObject({
        elementos: [],
        total: 0,
        ultimaCarga: null,
      });
    });

    it('carga el archivo y registra quién y cuándo', async () => {
      const antes = Date.now();
      const { body } = await cargar(
        'administrador',
        await libro([
          [
            documento(1),
            'Estudiante Uno',
            'Zeta Ficticio',
            'uno@ejemplo.edu.co',
          ],
          [documento(2), 'Estudiante Dos', 'Alfa Ficticio'],
          [documento(3), 'Estudiante Tres', 'Beta Ficticio'],
        ]),
      ).expect(200);

      expect(body).toMatchObject({
        matriculados: 3,
        nuevos: 3,
        reincorporados: 0,
        retirados: 0,
        actualizados: 0,
        carga: { cargadoPor: 'Usuario administrador E2E' },
      });
      const matriculas = await prisma.matricula.findMany({
        where: { id_proyecto_docente: idProyecto },
      });
      expect(matriculas).toHaveLength(3);
      for (const matricula of matriculas) {
        expect(matricula.estado).toBe('matriculado');
        expect(matricula.id_cargado_por).toBe(usuarios.administrador);
        expect(matricula.fecha_carga?.getTime()).toBeGreaterThanOrEqual(
          Math.floor(antes / 1000) * 1000,
        );
      }
      // RF-29: con AuditoriaService, la fila lleva usuario e IP y solo los conteos.
      const auditoria = await prisma.auditoria.findFirst({
        where: {
          id_usuario: usuarios.administrador,
          accion: 'actualizar',
          tabla_afectada: 'matricula',
          id_registro: idProyecto,
        },
      });
      expect(auditoria?.valor_nuevo).toEqual({
        matriculados: 3,
        nuevos: 3,
        reincorporados: 0,
        retirados: 0,
        actualizados: 0,
      });
      expect(auditoria?.ip).toBeTruthy();
    });

    it('el docente asignado ve la lista ordenada por apellidos', async () => {
      const antes = await prisma.auditoria.count({
        where: {
          id_usuario: usuarios.docenteAsignado,
          accion: 'consulta_sensible',
          tabla_afectada: 'matricula',
          id_registro: idProyecto,
        },
      });
      const { body } = await consultar('docenteAsignado').expect(200);
      // Ley 1581: cada consulta de la lista queda en auditoría (@AuditarConsulta).
      expect(
        await prisma.auditoria.count({
          where: {
            id_usuario: usuarios.docenteAsignado,
            accion: 'consulta_sensible',
            tabla_afectada: 'matricula',
            id_registro: idProyecto,
            ip: { not: null },
          },
        }),
      ).toBe(antes + 1);
      expect(body).toMatchObject({
        total: 3,
        totalMatriculados: 3,
        totalRetirados: 0,
        ultimaCarga: { cargadoPor: 'Usuario administrador E2E' },
      });
      expect(
        (body as { elementos: { apellidos: string }[] }).elementos.map(
          (e) => e.apellidos,
        ),
      ).toEqual(['Alfa Ficticio', 'Beta Ficticio', 'Zeta Ficticio']);
    });

    it('una nueva carga reemplaza la lista: retira sin borrar y actualiza nombres', async () => {
      const { body } = await cargar(
        'administrador',
        await libro([
          [documento(1), 'Estudiante Uno', 'Zeta Ficticio'],
          [documento(2), 'Estudiante Dos Corregido', 'Alfa Ficticio'],
          [documento(4), 'Estudiante Cuatro', 'Gama Ficticio'],
        ]),
      ).expect(200);

      expect(body).toMatchObject({
        matriculados: 3,
        nuevos: 1,
        retirados: 1,
        actualizados: 1,
      });
      // Un correo vacío en el archivo no borra el que ya tenía el estudiante.
      const uno = await prisma.estudiante.findUnique({
        where: { identificacion: documento(1) },
      });
      expect(uno?.email).toBe('uno@ejemplo.edu.co');

      const retirados = await consultar(
        'administrador',
        '?estado=retirado',
      ).expect(200);
      expect(retirados.body).toMatchObject({
        total: 1,
        totalMatriculados: 3,
        totalRetirados: 1,
        elementos: [{ documento: documento(3), estado: 'retirado' }],
      });
    });

    it('reincorpora a un retirado que vuelve a aparecer', async () => {
      const { body } = await cargar(
        'administrador',
        await libro([
          [documento(1), 'Estudiante Uno', 'Zeta Ficticio'],
          [documento(2), 'Estudiante Dos Corregido', 'Alfa Ficticio'],
          [documento(3), 'Estudiante Tres', 'Beta Ficticio'],
          [documento(4), 'Estudiante Cuatro', 'Gama Ficticio'],
        ]),
      ).expect(200);
      expect(body).toMatchObject({
        nuevos: 0,
        reincorporados: 1,
        retirados: 0,
      });
    });
  });

  describe('errores', () => {
    it('rechaza documentos repetidos, dice la fila y no cambia la lista', async () => {
      const { body } = await cargar(
        'administrador',
        await libro([
          [documento(5), 'Estudiante Cinco', 'Ficticio'],
          [documento(5), 'Estudiante Cinco Bis', 'Ficticio'],
        ]),
      ).expect(422);

      expect(body).toMatchObject({
        estado: 422,
        mensaje: expect.stringContaining(
          'no se guardó ningún estudiante',
        ) as string,
        detalles: [
          `Fila 3: el documento ${documento(5)} está repetido (ya aparece en la fila 2).`,
        ],
      });
      expect(
        await prisma.matricula.count({
          where: { id_proyecto_docente: idProyecto, estado: 'matriculado' },
        }),
      ).toBe(4);
      expect(
        await prisma.estudiante.count({
          where: { identificacion: documento(5) },
        }),
      ).toBe(0);
    });

    it('dice qué columnas faltan', async () => {
      const archivo = await writeXlsxFile([
        [{ value: 'Documento' }, { value: 'Nombre completo' }],
        [{ value: documento(6) }, { value: 'Estudiante Seis' }],
      ]).toBuffer();
      const { body } = await cargar('administrador', archivo).expect(422);
      expect((body as { detalles: string[] }).detalles).toEqual([
        'Faltan las columnas: Nombres, Apellidos.',
        'La columna «Nombre completo» junta nombres y apellidos: sepárelos en dos columnas.',
      ]);
    });

    it('pide un Excel si llega otro tipo de archivo', async () => {
      const { body } = await cargar(
        'administrador',
        Buffer.from('Documento;Nombres;Apellidos'),
        'lista.csv',
      ).expect(400);
      expect((body as { mensaje: string }).mensaje).toContain('.xlsx');
    });

    it('detecta un archivo que dice ser .xlsx y no lo es', async () => {
      await cargar('administrador', Buffer.from('texto'), 'lista.xlsx').expect(
        422,
      );
    });

    it('pide el archivo si no llega', async () => {
      const { body } = await http()
        .post(ruta())
        .set('Authorization', `Bearer ${tokens.administrador}`)
        .expect(400);
      expect((body as { mensaje: string }).mensaje).toBe(
        'Seleccione el archivo de Excel con la lista de estudiantes.',
      );
    });

    it('respeta el tamaño máximo del parámetro del sistema', async () => {
      const parametro = await prisma.parametro_sistema.findUniqueOrThrow({
        where: { clave: PARAMETRO.archivoTamanoMaximoMb },
      });
      await prisma.parametro_sistema.update({
        where: { id: parametro.id },
        data: { valor: '1' },
      });
      try {
        const { body } = await cargar(
          'administrador',
          Buffer.alloc(1024 * 1024 + 1),
        ).expect(413);
        expect((body as { mensaje: string }).mensaje).toBe(
          'El archivo supera el tamaño máximo permitido de 1 MB.',
        );
      } finally {
        await prisma.parametro_sistema.update({
          where: { id: parametro.id },
          data: { valor: parametro.valor },
        });
      }
    });

    it('valida la consulta', async () => {
      await consultar('administrador', '?estado=otro').expect(400);
      await consultar('administrador', '?tamano=1000').expect(400);
    });
  });
});
