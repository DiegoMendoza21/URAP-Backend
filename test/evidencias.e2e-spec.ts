import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ContrasenasService } from '../src/auth/contrasenas.service.js';
import { type NombreRol, ROL } from '../src/auth/roles.js';
import { PARAMETRO } from '../src/common/parametros/parametros.service.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { ALMACENAMIENTO_DOCUMENTAL } from '../src/documentos/almacenamiento/almacenamiento-documental.js';
import { AlmacenamientoLocal } from '../src/documentos/almacenamiento/almacenamiento-local.js';
import {
  MENSAJE_FALLA_ALMACENAMIENTO,
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_SESION_AJENA,
  MENSAJE_SIN_RAP_A_CARGO,
  MENSAJE_SOLO_DOCENTES_DEL_PROYECTO,
} from '../src/documentos/evidencias.service.js';
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

/**
 * Almacenamiento de disco en una carpeta temporal, con un interruptor para simular que el
 * servicio de almacenamiento falla (RF-24, p5).
 */
class AlmacenamientoDePrueba extends AlmacenamientoLocal {
  fallar = false;

  override async guardar(clave: string, contenido: Buffer): Promise<void> {
    if (this.fallar) {
      throw new Error('Almacenamiento no disponible (simulado)');
    }
    return super.guardar(clave, contenido);
  }
}

// Solo imágenes sintéticas: la firma de cada formato y bytes de relleno, nunca fotos de personas.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(2048, 7),
]);
const JPG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(1024, 3),
]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

// Requiere el .env configurado y la base local levantada (npm run db:levantar). Crea sus
// propios datos ficticios y los borra al terminar. Funciona con o sin el seed.
describe('Evidencias (e2e) · RF-24, HU-10-01', () => {
  const sufijo = `${Date.now()}`;
  const contrasena = 'Clave-e2e-de-prueba-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let carpeta: string;
  let almacenamiento: AlmacenamientoDePrueba;
  let tamanoMaximoMb: number;

  const matriz = matrizDePrueba();
  const creados = {
    roles: [] as number[],
    parametros: [] as number[],
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
  let rap1: number;
  let rap2: number;
  let proyecto: number;
  let proyectoCerrado: number;
  let proyectoAjeno: number;
  let sesion: number;
  let sesionAjena: number;

  const http = () => request(app.getHttpServer());
  const autorizar = (quien: string) => `Bearer ${tokens[quien]}`;
  const ruta = (idProyecto: number, resto = '') =>
    `/api/proyectos-docentes/${idProyecto}/evidencias${resto}`;

  /** Carga multipart; `archivos` son pares [nombre, contenido]. */
  function cargar(
    quien: string,
    idProyecto: number,
    campos: Record<string, string | number>,
    archivos: [string, Buffer][],
  ) {
    let peticion = http()
      .post(ruta(idProyecto))
      .set('Authorization', autorizar(quien));
    for (const [campo, valor] of Object.entries(campos)) {
      peticion = peticion.field(campo, String(valor));
    }
    for (const [nombre, contenido] of archivos) {
      peticion = peticion.attach('archivos', contenido, nombre);
    }
    return peticion;
  }

  const camposValidos = () => ({
    idRap: rap1,
    descripcion: 'Taller en grupos: diagrama de flujo del proceso.',
    fecha: '2026-09-14',
  });

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

  async function asegurarParametro(clave: string, valor: string) {
    const existente = await prisma.parametro_sistema.findUnique({
      where: { clave },
    });
    if (existente?.valor) {
      return existente.valor;
    }
    const creado = await prisma.parametro_sistema.create({
      data: { clave, valor, tipo_dato: 'texto', descripcion: 'Prueba e2e' },
    });
    creados.parametros.push(creado.id);
    return valor;
  }

  async function crearUsuario(
    clave: string,
    roles: string[],
    idPrograma: number,
    hash: string,
  ): Promise<void> {
    const usuario = await prisma.usuario.create({
      data: {
        nombres: `Usuario ${clave}`,
        apellidos: 'E2E',
        email: `e2e.evid.${clave}.${sufijo}@prueba.urap.local`,
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
    const inicio = await http()
      .post('/api/auth/iniciar-sesion')
      .send({ correo: usuario.email, contrasena })
      .expect(200);
    tokens[clave] = (inicio.body as { token: string }).token;
  }

  async function crearProyecto(
    idAsignatura: number,
    idPeriodo: number,
    grupo: string,
    docentes: number[],
  ): Promise<number> {
    const creado = await prisma.proyecto_docente.create({
      data: {
        id_asignatura: idAsignatura,
        id_periodo: idPeriodo,
        grupo,
        origen: 'manual',
        fecha_creacion: new Date(),
        proyecto_docente_rap: {
          create: [{ id_rap: rap1 }, { id_rap: rap2 }],
        },
        proyecto_docente_docente: {
          create: docentes.map((idUsuario, indice) => ({
            id_usuario: idUsuario,
            responsable: indice === 0,
            orden: indice + 1,
          })),
        },
      },
    });
    creados.proyectos.push(creado.id);
    return creado.id;
  }

  async function archivosGuardados(): Promise<string[]> {
    const raiz = path.join(carpeta, 'evidencias');
    const proyectos = await readdir(raiz).catch(() => [] as string[]);
    const archivos = await Promise.all(
      proyectos.map((nombre) => readdir(path.join(raiz, nombre))),
    );
    return archivos.flat();
  }

  beforeAll(async () => {
    carpeta = await mkdtemp(path.join(tmpdir(), 'urap-evidencias-e2e-'));
    almacenamiento = new AlmacenamientoDePrueba(carpeta);
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ALMACENAMIENTO_DOCUMENTAL)
      .useValue(almacenamiento)
      .compile();
    app = modulo.createNestApplication();
    configurarAplicacion(app);
    await app.init();
    prisma = app.get(PrismaService);
    await asegurarCatalogoDePermisos(prisma, matriz);
    const hash = await app.get(ContrasenasService).hashear(contrasena);

    tamanoMaximoMb = Number(
      await asegurarParametro(PARAMETRO.archivoTamanoMaximoMb, '10'),
    );
    await asegurarParametro(PARAMETRO.evidenciaTiposPermitidos, 'jpg,png,pdf');

    const [abierto, cerrado] = await Promise.all(
      [false, true].map((esCerrado) =>
        prisma.periodo_academico.create({
          data: {
            codigo: `E2E-EVID-${esCerrado ? 'C' : 'A'}-${sufijo}`,
            fecha_inicio: new Date('2026-08-03'),
            fecha_fin: new Date('2026-11-21'),
            numero_semanas: 16,
            activo: !esCerrado,
            cerrado: esCerrado,
          },
        }),
      ),
    );
    creados.periodos.push(abierto.id, cerrado.id);

    const facultad = await prisma.facultad.create({
      data: { nombre: `Facultad E2E Evidencias ${sufijo}` },
    });
    creados.facultades.push(facultad.id);
    const programa = await prisma.programa.create({
      data: {
        id_facultad: facultad.id,
        nombre: `Programa E2E Evidencias ${sufijo}`,
      },
    });
    creados.programas.push(programa.id);
    const asignatura = await prisma.asignatura.create({
      data: {
        id_plan_estudio: await planDePrueba(prisma, programa.id),
        codigo_interno: `EVID-${sufijo}`,
        nombre: 'Asignatura de evidencias',
        semestre: 4,
      },
    });
    creados.asignaturas.push(asignatura.id);
    for (const numero of [1, 2]) {
      const rap = await prisma.rap.create({
        data: {
          id_programa: programa.id,
          numero,
          codigo: `RAP ${numero}`,
          descripcion: `RAP ficticio ${numero}`,
        },
      });
      creados.raps.push(rap.id);
    }
    [rap1, rap2] = creados.raps;

    await crearUsuario('docente', [ROL.docente], programa.id, hash);
    await crearUsuario('docenteAjeno', [ROL.docente], programa.id, hash);
    await crearUsuario('departamento', [ROL.departamento], programa.id, hash);
    await crearUsuario('direccion', [ROL.direccion], programa.id, hash);
    await crearUsuario('lider', [ROL.docente, ROL.liderRap], programa.id, hash);
    await crearUsuario('estudiante', [ROL.estudiante], programa.id, hash);
    await prisma.lider_rap.create({
      data: {
        id_rap: rap2,
        id_usuario: usuarios.lider,
        id_periodo: abierto.id,
      },
    });

    proyecto = await crearProyecto(asignatura.id, abierto.id, 'A', [
      usuarios.docente,
    ]);
    proyectoCerrado = await crearProyecto(asignatura.id, cerrado.id, 'A', [
      usuarios.docente,
    ]);
    proyectoAjeno = await crearProyecto(asignatura.id, abierto.id, 'B', [
      usuarios.docenteAjeno,
    ]);
    sesion = (
      await prisma.sesion_clase.create({
        data: {
          id_proyecto_docente: proyecto,
          fecha: new Date('2026-09-14T00:00:00.000Z'),
          semana: 6,
          estado: 'pendiente',
        },
      })
    ).id;
    sesionAjena = (
      await prisma.sesion_clase.create({
        data: {
          id_proyecto_docente: proyectoAjeno,
          fecha: new Date('2026-09-15T00:00:00.000Z'),
          semana: 6,
          estado: 'pendiente',
        },
      })
    ).id;
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      const evidencias = await prisma.evidencia_rap.findMany({
        where: { id_proyecto_docente: { in: creados.proyectos } },
        select: { id: true },
      });
      await prisma.auditoria.deleteMany({
        where: {
          OR: [
            { id_usuario: { in: creados.usuarios } },
            {
              tabla_afectada: 'evidencia_rap',
              id_registro: { in: evidencias.map(({ id }) => id) },
            },
          ],
        },
      });
      const deProyectos = { id_proyecto_docente: { in: creados.proyectos } };
      await prisma.evidencia_rap.deleteMany({ where: deProyectos });
      await prisma.sesion_clase.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_docente.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente_rap.deleteMany({ where: deProyectos });
      await prisma.proyecto_docente.deleteMany({
        where: { id: { in: creados.proyectos } },
      });
      await prisma.lider_rap.deleteMany({
        where: { id_usuario: { in: creados.usuarios } },
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
      await prisma.parametro_sistema.deleteMany({
        where: { id: { in: creados.parametros } },
      });
      await borrarMatrizDePrueba(prisma, matriz);
      await prisma.rol.deleteMany({ where: { id: { in: creados.roles } } });
      await borrarCatalogoDePrueba(prisma, matriz);
    }
    await app?.close();
    if (carpeta) {
      await rm(carpeta, { recursive: true, force: true });
    }
  });

  describe('carga (p1 a p6)', () => {
    it('da al docente los RAP, las sesiones y los límites del parámetro', async () => {
      const { body } = await http()
        .get(ruta(proyecto, '/opciones'))
        .set('Authorization', autorizar('docente'))
        .expect(200);

      expect(body).toMatchObject({
        idProyectoDocente: proyecto,
        puedeCargar: true,
        motivoSinCarga: null,
        tamanoMaximoMb,
        sesiones: [{ id: sesion, fecha: '2026-09-14', semana: 6 }],
      });
      expect(body.raps.map((rap: { id: number }) => rap.id)).toEqual([
        rap1,
        rap2,
      ]);
    });

    it('guarda los archivos fuera de la base, solo con su referencia, y los muestra en la galería', async () => {
      const { body } = await cargar(
        'docente',
        proyecto,
        { ...camposValidos(), idSesion: sesion },
        [
          ['tablero del taller.png', PNG],
          ['acta firmada.pdf', PDF],
        ],
      ).expect(201);

      expect(body.evidencias).toHaveLength(2);
      expect(body.evidencias[0]).toMatchObject({
        idProyectoDocente: proyecto,
        idRap: rap1,
        sesion: { id: sesion, fecha: '2026-09-14' },
        descripcion: 'Taller en grupos: diagrama de flujo del proceso.',
        fecha: '2026-09-14',
        nombreOriginal: 'tablero del taller.png',
        tipo: 'image/png',
        tamanoBytes: PNG.length,
        subidoPor: { id: usuarios.docente },
      });

      // p5: la base guarda nombre, tipo, tamaño, usuario, fecha y ubicación, no el contenido.
      const fila = await prisma.evidencia_rap.findUniqueOrThrow({
        where: { id: body.evidencias[0].id },
      });
      expect(fila.url).toMatch(
        new RegExp(`^evidencias/proyecto-${proyecto}/[0-9a-f-]{36}\\.png$`),
      );
      expect(fila.id_subido_por).toBe(usuarios.docente);
      expect(fila.fecha_subida).toBeInstanceOf(Date);
      expect(
        await readFile(path.join(carpeta, ...(fila.url ?? '').split('/'))),
      ).toEqual(PNG);

      // p6: la galería del RAP.
      const galeria = await http()
        .get(ruta(proyecto))
        .query({ idRap: rap1 })
        .set('Authorization', autorizar('docente'))
        .expect(200);
      expect(galeria.body.total).toBe(2);
      expect(
        galeria.body.elementos.map(
          (e: { nombreOriginal: string }) => e.nombreOriginal,
        ),
      ).toEqual(
        expect.arrayContaining(['tablero del taller.png', 'acta firmada.pdf']),
      );

      // Si la auditoría tarda más de 1 s, la carga no la espera (RF-29, q1): se da margen.
      await expect
        .poll(
          () =>
            prisma.auditoria.count({
              where: {
                accion: 'crear',
                tabla_afectada: 'evidencia_rap',
                id_usuario: usuarios.docente,
                ip: { not: null },
              },
            }),
          { timeout: 5000 },
        )
        .toBe(2);
    });

    it('rechaza la carga si un archivo supera el tamaño máximo e informa el límite (p4)', async () => {
      const antes = await prisma.evidencia_rap.count({
        where: { id_proyecto_docente: proyecto },
      });
      const grande = Buffer.concat([
        PNG,
        Buffer.alloc(tamanoMaximoMb * 1024 * 1024),
      ]);

      const { body } = await cargar('docente', proyecto, camposValidos(), [
        ['grande.png', grande],
      ]).expect(413);

      expect(body.mensaje).toContain(`${tamanoMaximoMb} MB`);
      expect(
        await prisma.evidencia_rap.count({
          where: { id_proyecto_docente: proyecto },
        }),
      ).toBe(antes);
    });

    it.each([
      ['un texto con extensión de imagen', 'notas.jpg', Buffer.from('hola')],
      ['una imagen con extensión de otro tipo', 'tablero.pdf', PNG],
      [
        'un tipo que el parámetro no permite',
        'hoja.xlsx',
        Buffer.from('PK\x03\x04'),
      ],
    ])('rechaza %s (p4)', async (_, nombre, contenido) => {
      const { body } = await cargar('docente', proyecto, camposValidos(), [
        ['bien.jpg', JPG],
        [nombre, contenido],
      ]).expect(415);

      expect(body).toMatchObject({
        error: 'Tipo de archivo no permitido',
        mensaje: `El archivo «${nombre}» no es de un tipo permitido. Puede cargar archivos JPG, PNG o PDF.`,
      });
    });

    it('si falla el almacenamiento, informa el error, no deja nada y permite reintentar (p5)', async () => {
      const antes = await prisma.evidencia_rap.count({
        where: { id_proyecto_docente: proyecto },
      });
      const archivosAntes = await archivosGuardados();
      almacenamiento.fallar = true;
      try {
        const { body } = await cargar('docente', proyecto, camposValidos(), [
          ['reintento.jpg', JPG],
        ]).expect(503);
        expect(body.mensaje).toBe(MENSAJE_FALLA_ALMACENAMIENTO);
      } finally {
        almacenamiento.fallar = false;
      }
      expect(
        await prisma.evidencia_rap.count({
          where: { id_proyecto_docente: proyecto },
        }),
      ).toBe(antes);
      expect(await archivosGuardados()).toEqual(archivosAntes);

      // El mismo envío, con la misma descripción, funciona al reintentar.
      await cargar('docente', proyecto, camposValidos(), [
        ['reintento.jpg', JPG],
      ]).expect(201);
    });

    it.each([
      [
        'sin archivos',
        {},
        [] as [string, Buffer][],
        'Seleccione al menos un archivo.',
      ],
      [
        'sin descripción',
        { descripcion: '   ' },
        [['a.jpg', JPG]] as [string, Buffer][],
        'Los datos enviados no son válidos.',
      ],
      [
        'con fecha futura',
        { fecha: '2999-01-01' },
        [['a.jpg', JPG]] as [string, Buffer][],
        'La fecha de la evidencia no puede ser posterior a hoy.',
      ],
      [
        'con fecha inválida',
        { fecha: '2026-02-30' },
        [['a.jpg', JPG]] as [string, Buffer][],
        'Los datos enviados no son válidos.',
      ],
      [
        'con una sesión de otro proyecto',
        { idSesion: 0 },
        [['a.jpg', JPG]] as [string, Buffer][],
        MENSAJE_SESION_AJENA,
      ],
      [
        'con más archivos de los permitidos por carga',
        {},
        Array.from({ length: 6 }, (_, i) => [`f${i}.jpg`, JPG]) as [
          string,
          Buffer,
        ][],
        'Envíe de 1 a 5 archivos en el campo «archivos».',
      ],
    ])('rechaza la carga %s', async (_, cambios, archivos, mensaje) => {
      const campos: Record<string, string | number> = {
        ...camposValidos(),
        ...cambios,
      };
      if (campos.idSesion === 0) {
        campos.idSesion = sesionAjena;
      }
      const { body } = await cargar(
        'docente',
        proyecto,
        campos,
        archivos,
      ).expect(400);
      expect(body.mensaje).toBe(mensaje);
    });

    it('no carga en un período cerrado', async () => {
      const { body } = await cargar(
        'docente',
        proyectoCerrado,
        camposValidos(),
        [['a.jpg', JPG]],
      ).expect(409);
      expect(body.mensaje).toBe(MENSAJE_PERIODO_CERRADO);
    });
  });

  describe('permisos y datos personales', () => {
    let idEvidenciaRap1: number;

    beforeAll(async () => {
      const evidencia = await prisma.evidencia_rap.findFirstOrThrow({
        where: {
          id_proyecto_docente: proyecto,
          id_rap: rap1,
          tipo: 'image/png',
        },
      });
      idEvidenciaRap1 = evidencia.id;
    });

    it('solo carga el Docente, y solo en sus proyectos', async () => {
      await cargar('departamento', proyecto, camposValidos(), [
        ['a.jpg', JPG],
      ]).expect(403);
      // El docente de otro proyecto ni siquiera lo ve.
      await cargar('docenteAjeno', proyecto, camposValidos(), [
        ['a.jpg', JPG],
      ]).expect(404);
      // Un Líder RAP que también es docente, pero no de este proyecto.
      const { body } = await cargar('lider', proyecto, camposValidos(), [
        ['a.jpg', JPG],
      ]).expect(403);
      expect(body.mensaje).toBe(MENSAJE_SOLO_DOCENTES_DEL_PROYECTO);
    });

    it('descarga el archivo solo con sesión, sin publicarlo, y audita la consulta', async () => {
      await http()
        .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
        .expect(401);

      const respuesta = await http()
        .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
        .set('Authorization', autorizar('direccion'))
        .buffer(true)
        .parse((res, listo) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => listo(null, Buffer.concat(partes)));
        })
        .expect(200);

      expect(respuesta.body).toEqual(PNG);
      expect(respuesta.headers).toMatchObject({
        'content-type': 'image/png',
        'cache-control': 'private, no-cache',
        'x-content-type-options': 'nosniff',
      });
      expect(respuesta.headers['content-disposition']).toContain(
        "filename*=UTF-8''tablero%20del%20taller.png",
      );
      // RF-29: @AuditarConsulta registra la descarga con usuario e IP.
      const consultas = {
        accion: 'consulta_sensible',
        tabla_afectada: 'evidencia_rap',
        id_registro: idEvidenciaRap1,
        id_usuario: usuarios.direccion,
      };
      // Con @Res() la respuesta sale antes de que el interceptor termine de auditar: se espera.
      await expect
        // La auditoría puede tardar hasta 1 s por diseño (RF-29, q1): se da margen.
        .poll(
          () =>
            prisma.auditoria.count({
              where: { ...consultas, ip: { not: null } },
            }),
          { timeout: 5000 },
        )
        .toBe(1);

      // Revalidación: el archivo no se vuelve a enviar, pero el usuario vuelve a ver la foto
      // (dato personal, Ley 1581) con su acceso comprobado de nuevo: también queda auditada.
      await http()
        .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
        .set('Authorization', autorizar('direccion'))
        .set('If-None-Match', respuesta.headers.etag)
        .expect(304);
      await expect
        .poll(() => prisma.auditoria.count({ where: consultas }), {
          timeout: 5000,
        })
        .toBe(2);
    });

    it('si el archivo ya no está, responde 404 sin dejar la versión en caché', async () => {
      const fila = await prisma.evidencia_rap.findUniqueOrThrow({
        where: { id: idEvidenciaRap1 },
      });
      const rutaArchivo = path.join(carpeta, ...(fila.url ?? '').split('/'));
      const original = await readFile(rutaArchivo);
      await rm(rutaArchivo);
      try {
        const respuesta = await http()
          .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
          .set('Authorization', autorizar('docente'))
          .expect(404);
        // Express puede poner el ETag del cuerpo JSON, nunca el de la versión de la foto.
        expect(respuesta.headers.etag ?? '').not.toContain('evidencia-');
        expect(respuesta.headers['cache-control']).toBe('no-store');
        expect(respuesta.headers['content-disposition']).toBeUndefined();
      } finally {
        await almacenamiento.guardar(fila.url ?? '', original);
      }
    });

    it('el Departamento y la Dirección consultan la galería', async () => {
      for (const quien of ['departamento', 'direccion']) {
        const { body } = await http()
          .get(ruta(proyecto))
          .set('Authorization', autorizar(quien))
          .expect(200);
        expect(body.total).toBeGreaterThan(0);
      }
    });

    it('el Líder RAP solo ve las evidencias de los RAP que lidera', async () => {
      const opciones = await http()
        .get(ruta(proyecto, '/opciones'))
        .set('Authorization', autorizar('lider'))
        .expect(200);
      expect(opciones.body).toMatchObject({ puedeCargar: false, sesiones: [] });
      expect(opciones.body.raps.map((rap: { id: number }) => rap.id)).toEqual([
        rap2,
      ]);

      const galeria = await http()
        .get(ruta(proyecto))
        .set('Authorization', autorizar('lider'))
        .expect(200);
      expect(galeria.body.total).toBe(0);

      await http()
        .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
        .set('Authorization', autorizar('lider'))
        .expect(404);
    });

    it('el Líder RAP sin RAP a cargo en el proyecto recibe 403', async () => {
      await prisma.lider_rap.updateMany({
        where: { id_usuario: usuarios.lider },
        data: { activo: false },
      });
      try {
        const { body } = await http()
          .get(ruta(proyecto))
          .set('Authorization', autorizar('lider'))
          .expect(403);
        expect(body.mensaje).toBe(MENSAJE_SIN_RAP_A_CARGO);
      } finally {
        await prisma.lider_rap.updateMany({
          where: { id_usuario: usuarios.lider },
          data: { activo: true },
        });
      }
    });

    it('el docente no ve las evidencias de proyectos ajenos', async () => {
      await http()
        .get(ruta(proyecto))
        .set('Authorization', autorizar('docenteAjeno'))
        .expect(404);
      await http()
        .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
        .set('Authorization', autorizar('docenteAjeno'))
        .expect(404);
      // Ni pidiendo una evidencia de otro proyecto por el suyo.
      await http()
        .get(ruta(proyectoAjeno, `/${idEvidenciaRap1}/archivo`))
        .set('Authorization', autorizar('docenteAjeno'))
        .expect(404);
    });

    it('el Estudiante no consulta evidencias: no ve el proyecto (404)', async () => {
      await http()
        .get(ruta(proyecto))
        .set('Authorization', autorizar('estudiante'))
        .expect(404);
      await http()
        .get(ruta(proyecto, `/${idEvidenciaRap1}/archivo`))
        .set('Authorization', autorizar('estudiante'))
        .expect(404);
    });
  });
});
