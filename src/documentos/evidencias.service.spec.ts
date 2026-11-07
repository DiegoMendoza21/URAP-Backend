import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import type { ProyectosDocentesService } from '../proyectos-docentes/proyectos-docentes.service.js';
import {
  type AlmacenamientoDocumental,
  ArchivoNoEncontrado,
} from './almacenamiento/almacenamiento-documental.js';
import type { CargarEvidenciasDto } from './dto/cargar-evidencias.dto.js';
import { disposicionEnLinea } from './evidencias.controller.js';
import {
  conExtension,
  EvidenciasService,
  hoyEnColombia,
  limpiarNombre,
  MENSAJE_ARCHIVO_NO_DISPONIBLE,
  MENSAJE_FALLA_ALMACENAMIENTO,
  MENSAJE_FALLA_LECTURA,
  MENSAJE_FECHA_FUTURA,
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_RAP_AJENO,
  MENSAJE_SESION_AJENA,
  MENSAJE_SIN_ARCHIVOS,
  MENSAJE_SIN_RAP_A_CARGO,
  MENSAJE_SOLO_DOCENTES_DEL_PROYECTO,
} from './evidencias.service.js';
import { TIPOS_RECONOCIDOS } from './tipos-archivo.js';

// Datos ficticios: nunca datos reales de personas, y solo firmas de archivo, nunca fotos.
const ID_PROYECTO = 12;
const ID_PROGRAMA = 3;
const RAP_1 = { id: 101, numero: 1, codigo: 'RAP 1', descripcion: 'Uno' };
const RAP_2 = { id: 102, numero: 2, codigo: 'RAP 2', descripcion: 'Dos' };

function usuario(id: number, ...roles: string[]): UsuarioSesion {
  return {
    id,
    nombres: 'Usuario',
    apellidos: 'De Prueba',
    correo: `usuario${id}@urap.local`,
    roles,
    jti: `jti-${id}`,
  };
}

const docente = usuario(20, ROL.docente);
const departamento = usuario(30, ROL.departamento);
const lider = usuario(40, ROL.docente, ROL.liderRap);

function archivo(nombre: string, contenido: Buffer): Express.Multer.File {
  return {
    originalname: nombre,
    buffer: contenido,
    size: contenido.length,
  } as Express.Multer.File;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const PDF = Buffer.from('%PDF-1.4\n');

function datos(
  cambios: Partial<CargarEvidenciasDto> = {},
): CargarEvidenciasDto {
  return {
    idRap: RAP_1.id,
    descripcion: 'Trabajo en grupos con el tablero.',
    fecha: '2026-09-14',
    ...cambios,
  };
}

describe('EvidenciasService', () => {
  const tx = { evidencia_rap: { create: vi.fn() } };
  const prisma = {
    proyecto_docente: { findFirst: vi.fn() },
    lider_rap: { findMany: vi.fn() },
    sesion_clase: { findFirst: vi.fn(), findMany: vi.fn() },
    evidencia_rap: {
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    auditoria: { create: vi.fn() },
    $transaction: vi.fn((trabajo: (cliente: typeof tx) => unknown) =>
      trabajo(tx),
    ),
  };
  const proyectos = { filtroVisibilidad: vi.fn() };
  const alcance = { alcanzaPrograma: vi.fn() };
  const parametros = { enteroPositivo: vi.fn(), lista: vi.fn() };
  const almacenamiento = {
    guardar: vi.fn(),
    abrir: vi.fn(),
    eliminar: vi.fn(),
  };
  const servicio = new EvidenciasService(
    prisma as unknown as PrismaService,
    alcance as unknown as AlcanceService,
    proyectos as unknown as ProyectosDocentesService,
    parametros as unknown as ParametrosService,
    almacenamiento as unknown as AlmacenamientoDocumental,
  );

  /** Proyecto tal como lo consulta `acceso()`. */
  function proyecto(
    cambios: { asignado?: boolean; cerrado?: boolean; raps?: object[] } = {},
  ) {
    return {
      id: ID_PROYECTO,
      id_periodo: 7,
      asignatura: { id_programa: ID_PROGRAMA },
      periodo_academico: { cerrado: cambios.cerrado ?? false },
      proyecto_docente_rap: (cambios.raps ?? [RAP_1, RAP_2]).map((rap) => ({
        rap,
      })),
      proyecto_docente_docente:
        (cambios.asignado ?? true) ? [{ id_usuario: docente.id }] : [],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    proyectos.filtroVisibilidad.mockResolvedValue({});
    prisma.proyecto_docente.findFirst.mockResolvedValue(proyecto());
    alcance.alcanzaPrograma.mockResolvedValue(false);
    prisma.lider_rap.findMany.mockResolvedValue([]);
    parametros.enteroPositivo.mockResolvedValue(10);
    parametros.lista.mockResolvedValue(['jpg', 'png', 'pdf']);
    prisma.sesion_clase.findFirst.mockResolvedValue({ id: 31 });
    prisma.sesion_clase.findMany.mockResolvedValue([]);
    prisma.evidencia_rap.groupBy.mockResolvedValue([]);
    prisma.evidencia_rap.count.mockResolvedValue(0);
    prisma.evidencia_rap.findMany.mockResolvedValue([]);
    prisma.auditoria.create.mockResolvedValue({});
    almacenamiento.guardar.mockResolvedValue(undefined);
    almacenamiento.eliminar.mockResolvedValue(undefined);
    let siguienteId = 500;
    tx.evidencia_rap.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: siguienteId++,
        ...data,
        sesion_clase: null,
        usuario: { id: data.id_subido_por, nombres: 'D', apellidos: 'P' },
      }),
    );
  });

  describe('cargar', () => {
    it('guarda cada archivo en el almacenamiento y solo su referencia en la base (p5)', async () => {
      const resultado = await servicio.cargar(
        docente,
        ID_PROYECTO,
        datos({ idSesion: 31 }),
        [archivo('tablero.png', PNG), archivo('acta.pdf', PDF)],
      );

      expect(almacenamiento.guardar).toHaveBeenCalledTimes(2);
      const [clavePng, contenidoPng] = almacenamiento.guardar.mock.calls[0];
      expect(clavePng).toMatch(
        new RegExp(`^evidencias/proyecto-${ID_PROYECTO}/[0-9a-f-]{36}\\.png$`),
      );
      expect(contenidoPng).toBe(PNG);

      const { data } = tx.evidencia_rap.create.mock.calls[0][0];
      expect(data).toMatchObject({
        id_proyecto_docente: ID_PROYECTO,
        id_rap: RAP_1.id,
        id_sesion: 31,
        nombre_original: 'tablero.png',
        url: clavePng,
        tipo: 'image/png',
        tamano_bytes: PNG.length,
        descripcion: 'Trabajo en grupos con el tablero.',
        fecha: new Date('2026-09-14T00:00:00.000Z'),
        id_subido_por: docente.id,
      });
      expect(data).not.toHaveProperty('contenido');
      expect(resultado.evidencias.map((evidencia) => evidencia.tipo)).toEqual([
        'image/png',
        'application/pdf',
      ]);
      expect(prisma.auditoria.create).toHaveBeenCalledTimes(2);
      expect(prisma.auditoria.create.mock.calls[0][0].data).toMatchObject({
        accion: 'crear',
        tabla_afectada: 'evidencia_rap',
        id_usuario: docente.id,
      });
    });

    it('solo deja cargar a los docentes del proyecto', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ asignado: false }),
      );
      alcance.alcanzaPrograma.mockResolvedValue(true);

      await expect(
        servicio.cargar(departamento, ID_PROYECTO, datos(), [
          archivo('a.png', PNG),
        ]),
      ).rejects.toThrow(
        new ForbiddenException(MENSAJE_SOLO_DOCENTES_DEL_PROYECTO),
      );
      expect(almacenamiento.guardar).not.toHaveBeenCalled();
    });

    it('responde 404 si el usuario no ve el proyecto', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(null);
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [archivo('a.png', PNG)]),
      ).rejects.toBeInstanceOf(NotFoundException);

      proyectos.filtroVisibilidad.mockResolvedValue(null);
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [archivo('a.png', PNG)]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no carga en un período cerrado', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ cerrado: true }),
      );
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [archivo('a.png', PNG)]),
      ).rejects.toThrow(new ConflictException(MENSAJE_PERIODO_CERRADO));
    });

    it.each([
      [
        'un RAP que no es del proyecto',
        datos({ idRap: 999 }),
        MENSAJE_RAP_AJENO,
      ],
      [
        'una fecha futura',
        datos({ fecha: '2999-01-01' }),
        MENSAJE_FECHA_FUTURA,
      ],
    ])('rechaza %s', async (_, entrada, mensaje) => {
      await expect(
        servicio.cargar(docente, ID_PROYECTO, entrada, [archivo('a.png', PNG)]),
      ).rejects.toThrow(new BadRequestException(mensaje));
    });

    it('rechaza una sesión de otro calendario o retirada', async () => {
      prisma.sesion_clase.findFirst.mockResolvedValue(null);
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos({ idSesion: 77 }), [
          archivo('a.png', PNG),
        ]),
      ).rejects.toThrow(new BadRequestException(MENSAJE_SESION_AJENA));
      expect(
        prisma.sesion_clase.findFirst.mock.calls[0][0].where,
      ).toMatchObject({ id: 77, id_proyecto_docente: ID_PROYECTO });
    });

    it('exige al menos un archivo', async () => {
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), []),
      ).rejects.toThrow(new BadRequestException(MENSAJE_SIN_ARCHIVOS));
    });

    it('rechaza toda la carga si un archivo no es de un tipo permitido (p4)', async () => {
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [
          archivo('bien.png', PNG),
          archivo('mal.jpg', Buffer.from('texto')),
        ]),
      ).rejects.toThrow(
        new UnsupportedMediaTypeException(
          'El archivo «mal.jpg» no es de un tipo permitido. Puede cargar archivos JPG, PNG o PDF.',
        ),
      );
      expect(almacenamiento.guardar).not.toHaveBeenCalled();
      expect(tx.evidencia_rap.create).not.toHaveBeenCalled();
    });

    it('usa los tipos del parámetro: sin PDF en la lista, un PDF no pasa', async () => {
      parametros.lista.mockResolvedValue(['jpg', 'png']);
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [archivo('a.pdf', PDF)]),
      ).rejects.toThrow(/Puede cargar archivos JPG o PNG/);
    });

    it('falla como error de instalación si el parámetro no trae tipos reconocibles', async () => {
      parametros.lista.mockResolvedValue(['heic']);
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [archivo('a.png', PNG)]),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('si falla el almacenamiento, borra lo que alcanzó a guardar y deja reintentar (p5)', async () => {
      almacenamiento.guardar
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('disco lleno'));

      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [
          archivo('uno.png', PNG),
          archivo('dos.png', PNG),
        ]),
      ).rejects.toThrow(
        new ServiceUnavailableException(MENSAJE_FALLA_ALMACENAMIENTO),
      );
      expect(almacenamiento.eliminar).toHaveBeenCalledExactlyOnceWith(
        almacenamiento.guardar.mock.calls[0][0],
      );
      expect(tx.evidencia_rap.create).not.toHaveBeenCalled();
    });

    it('si falla la base, borra los archivos guardados para no dejar huérfanos', async () => {
      tx.evidencia_rap.create.mockRejectedValue(new Error('sin conexión'));

      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [
          archivo('uno.png', PNG),
          archivo('dos.pdf', PDF),
        ]),
      ).rejects.toThrow('sin conexión');
      expect(
        almacenamiento.eliminar.mock.calls.map(([clave]) => clave),
      ).toEqual(almacenamiento.guardar.mock.calls.map(([clave]) => clave));
    });

    it('un fallo al auditar no deshace la carga', async () => {
      prisma.auditoria.create.mockRejectedValue(new Error('auditoría caída'));
      await expect(
        servicio.cargar(docente, ID_PROYECTO, datos(), [archivo('a.png', PNG)]),
      ).resolves.toMatchObject({ evidencias: [{ nombreOriginal: 'a.png' }] });
    });
  });

  describe('alcance de la consulta', () => {
    it('el Departamento del programa ve todos los RAP del proyecto', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ asignado: false }),
      );
      alcance.alcanzaPrograma.mockResolvedValue(true);

      const opciones = await servicio.opciones(departamento, ID_PROYECTO);

      expect(opciones.raps.map((rap) => rap.id)).toEqual([RAP_1.id, RAP_2.id]);
      expect(opciones.puedeCargar).toBe(false);
      expect(opciones.motivoSinCarga).toBeNull();
      expect(alcance.alcanzaPrograma).toHaveBeenCalledWith(
        departamento.id,
        [ROL.administrador, ROL.departamento, ROL.direccion],
        ID_PROGRAMA,
      );
    });

    it('el Líder RAP solo ve los RAP que lidera en el período del proyecto', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ asignado: false }),
      );
      prisma.lider_rap.findMany.mockResolvedValue([{ id_rap: RAP_2.id }]);

      const opciones = await servicio.opciones(lider, ID_PROYECTO);

      expect(opciones.raps.map((rap) => rap.id)).toEqual([RAP_2.id]);
      expect(prisma.lider_rap.findMany.mock.calls[0][0].where).toMatchObject({
        id_usuario: lider.id,
        activo: true,
        OR: [{ id_periodo: 7 }, { id_periodo: null }],
      });

      await servicio.listar(lider, ID_PROYECTO, { pagina: 1, tamano: 20 });
      expect(prisma.evidencia_rap.findMany.mock.calls[0][0].where).toEqual({
        id_proyecto_docente: ID_PROYECTO,
        id_rap: { in: [RAP_2.id] },
      });
    });

    it('el Líder RAP sin RAP a cargo en el proyecto recibe 403', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ asignado: false }),
      );
      await expect(servicio.opciones(lider, ID_PROYECTO)).rejects.toThrow(
        new ForbiddenException(MENSAJE_SIN_RAP_A_CARGO),
      );
    });

    it('filtrar por un RAP que no puede ver devuelve la galería vacía', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ asignado: false }),
      );
      prisma.lider_rap.findMany.mockResolvedValue([{ id_rap: RAP_2.id }]);

      await servicio.listar(lider, ID_PROYECTO, {
        pagina: 1,
        tamano: 20,
        idRap: RAP_1.id,
      });
      expect(
        prisma.evidencia_rap.findMany.mock.calls[0][0].where.id_rap,
      ).toEqual({ in: [] });
    });

    it('al docente de un período cerrado le explica por qué no puede cargar', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({ cerrado: true }),
      );
      const opciones = await servicio.opciones(docente, ID_PROYECTO);
      expect(opciones).toMatchObject({
        puedeCargar: false,
        motivoSinCarga: MENSAJE_PERIODO_CERRADO,
        sesiones: [],
      });
      expect(prisma.sesion_clase.findMany).not.toHaveBeenCalled();
    });

    it('da al docente los límites del parámetro y las sesiones del calendario', async () => {
      prisma.sesion_clase.findMany.mockResolvedValue([
        { id: 31, fecha: new Date('2026-09-14T00:00:00.000Z'), semana: 6 },
      ]);
      prisma.evidencia_rap.groupBy.mockResolvedValue([
        { id_rap: RAP_1.id, _count: { _all: 3 } },
      ]);

      const opciones = await servicio.opciones(docente, ID_PROYECTO);

      expect(opciones).toMatchObject({
        puedeCargar: true,
        tamanoMaximoMb: 10,
        extensionesPermitidas: ['jpg', 'jpeg', 'png', 'pdf'],
        tiposMimePermitidos: ['image/jpeg', 'image/png', 'application/pdf'],
        sesiones: [{ id: 31, fecha: '2026-09-14', semana: 6 }],
      });
      expect(opciones.raps.map((rap) => rap.totalEvidencias)).toEqual([3, 0]);
    });
  });

  describe('descarga', () => {
    const evidencia = {
      id: 500,
      url: 'evidencias/proyecto-12/abc.png',
      nombre_original: 'tablero.png',
      tipo: 'image/png',
      tamano_bytes: 9,
    };

    it('busca la evidencia solo entre los RAP que el usuario puede ver', async () => {
      prisma.evidencia_rap.findFirst.mockResolvedValue(evidencia);
      await servicio.evidenciaParaDescarga(docente, ID_PROYECTO, 500);
      expect(prisma.evidencia_rap.findFirst.mock.calls[0][0].where).toEqual({
        id: 500,
        id_proyecto_docente: ID_PROYECTO,
        id_rap: { in: [RAP_1.id, RAP_2.id] },
      });

      prisma.evidencia_rap.findFirst.mockResolvedValue(null);
      await expect(
        servicio.evidenciaParaDescarga(docente, ID_PROYECTO, 501),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('abre el archivo y audita la consulta', async () => {
      const contenido = Readable.from(['x']);
      almacenamiento.abrir.mockResolvedValue({ contenido, tamanoBytes: 9 });

      await expect(
        servicio.abrirArchivo(docente, {
          id: 500,
          clave: evidencia.url,
          nombreOriginal: 'tablero.png',
          tipo: 'image/png',
          tamanoBytes: 9,
        }),
      ).resolves.toEqual({ contenido, tamanoBytes: 9 });
      expect(prisma.auditoria.create.mock.calls[0][0].data).toMatchObject({
        accion: 'consultar',
        tabla_afectada: 'evidencia_rap',
        id_registro: 500,
      });
    });

    it.each([
      [
        new ArchivoNoEncontrado('x'),
        new NotFoundException(MENSAJE_ARCHIVO_NO_DISPONIBLE),
      ],
      [
        new Error('disco desmontado'),
        new ServiceUnavailableException(MENSAJE_FALLA_LECTURA),
      ],
    ])('traduce la falla del almacenamiento (%s)', async (falla, esperado) => {
      almacenamiento.abrir.mockRejectedValue(falla);
      await expect(
        servicio.abrirArchivo(docente, {
          id: 500,
          clave: evidencia.url,
          nombreOriginal: 'tablero.png',
          tipo: 'image/png',
          tamanoBytes: 9,
        }),
      ).rejects.toThrow(esperado);
      expect(prisma.auditoria.create).not.toHaveBeenCalled();
    });
  });

  describe('utilidades', () => {
    const png = TIPOS_RECONOCIDOS[1];

    it('limpia carpetas y caracteres de control del nombre', () => {
      expect(limpiarNombre('C:\\fotos\\clase.png')).toBe('clase.png');
      expect(limpiarNombre('../../clase\u0000.png ')).toBe('clase.png');
    });

    it('pone la extensión del tipo y respeta los 255 caracteres', () => {
      expect(conExtension('clase.png', png)).toBe('clase.png');
      expect(conExtension('1000012345', png)).toBe('1000012345.png');
      expect(conExtension('', png)).toBe('evidencia.png');
      const largo = conExtension(`${'a'.repeat(300)}.png`, png);
      expect(largo).toHaveLength(255);
      expect(largo.endsWith('.png')).toBe(true);
    });

    it('calcula hoy con la hora de Colombia', () => {
      // 8 de noviembre a las 03:00 UTC son las 22:00 del 7 en Bogotá.
      expect(hoyEnColombia(new Date('2026-11-08T03:00:00.000Z'))).toBe(
        '2026-11-07',
      );
    });

    it('arma el Content-Disposition con el nombre en ASCII y en UTF-8', () => {
      expect(disposicionEnLinea('fotografía "1".jpg')).toBe(
        `inline; filename="fotografia _1_.jpg"; filename*=UTF-8''fotograf%C3%ADa%20%221%22.jpg`,
      );
    });
  });
});
