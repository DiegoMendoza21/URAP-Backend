import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import {
  MatriculasService,
  MENSAJE_PROYECTO_NO_EXISTE,
  MENSAJE_SIN_ARCHIVO,
  MENSAJE_TIPO_ARCHIVO,
} from './matriculas.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const ID_PROYECTO = 7;

function usuario(id: number, roles: string[]): UsuarioSesion {
  return {
    id,
    nombres: 'Usuario',
    apellidos: 'De Prueba',
    correo: `usuario${id}@urap.local`,
    roles,
    jti: `jti-${id}`,
  };
}

const administrador = usuario(1, [ROL.administrador]);
const docenteAsignado = usuario(2, [ROL.docente]);
const docenteAjeno = usuario(3, [ROL.docente]);

function crearServicio({
  esAdministrador = false,
  asignados = [docenteAsignado.id],
}: { esAdministrador?: boolean; asignados?: number[] } = {}) {
  const prisma = {
    proyecto_docente: { findUnique: vi.fn() },
    matricula: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditoria: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  // Simula el `where: { id_usuario }` de la relación: solo devuelve al docente si está asignado.
  prisma.proyecto_docente.findUnique.mockImplementation(
    (argumentos: {
      where: { id: number };
      select: {
        proyecto_docente_docente: { where: { id_usuario: number } };
      };
    }) => {
      if (argumentos.where.id !== ID_PROYECTO) {
        return Promise.resolve(null);
      }
      const idUsuario =
        argumentos.select.proyecto_docente_docente.where.id_usuario;
      return Promise.resolve({
        id: ID_PROYECTO,
        asignatura: { id_programa: 10 },
        proyecto_docente_docente: asignados.includes(idUsuario)
          ? [{ id_usuario: idUsuario }]
          : [],
      });
    },
  );
  const alcance = {
    alcanzaPrograma: vi.fn().mockResolvedValue(esAdministrador),
  };
  const parametros = {
    lista: vi.fn().mockResolvedValue(['jpg', 'png', 'pdf', 'xlsx', 'docx']),
  };
  const servicio = new MatriculasService(
    prisma as unknown as PrismaService,
    alcance as unknown as AlcanceService,
    parametros as unknown as ParametrosService,
  );
  return { servicio, prisma, alcance };
}

const consulta = { pagina: 1, tamano: 20, estado: 'matriculado' as const };

describe('MatriculasService (RF-22, HU-09-01)', () => {
  describe('cargar', () => {
    it('niega la carga a un docente aunque esté asignado: solo el Administrador carga', async () => {
      const { servicio } = crearServicio();

      await expect(
        servicio.cargar(docenteAsignado, ID_PROYECTO, {
          originalname: 'lista.xlsx',
          buffer: Buffer.from('x'),
        }),
      ).rejects.toThrow(new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE));
    });

    it('trata igual un proyecto inexistente y uno fuera del alcance del administrador', async () => {
      const { servicio, alcance } = crearServicio({ esAdministrador: false });

      await expect(
        servicio.cargar(administrador, 999, undefined),
      ).rejects.toThrow(NotFoundException);
      await expect(
        servicio.cargar(administrador, ID_PROYECTO, undefined),
      ).rejects.toThrow(NotFoundException);
      expect(alcance.alcanzaPrograma).toHaveBeenCalledWith(
        administrador.id,
        [ROL.administrador],
        10,
      );
    });

    it('pide el archivo si no llegó', async () => {
      const { servicio } = crearServicio({ esAdministrador: true });

      await expect(
        servicio.cargar(administrador, ID_PROYECTO, undefined),
      ).rejects.toThrow(new BadRequestException(MENSAJE_SIN_ARCHIVO));
    });

    it('rechaza lo que no es .xlsx, aunque sea una extensión permitida para evidencias', async () => {
      const { servicio } = crearServicio({ esAdministrador: true });

      for (const originalname of ['lista.csv', 'lista.pdf', 'lista']) {
        await expect(
          servicio.cargar(administrador, ID_PROYECTO, {
            originalname,
            buffer: Buffer.from('x'),
          }),
        ).rejects.toThrow(new BadRequestException(MENSAJE_TIPO_ARCHIVO));
      }
    });

    it('responde 422 sin tocar la base si el contenido no es un Excel', async () => {
      const { servicio, prisma } = crearServicio({ esAdministrador: true });

      await expect(
        servicio.cargar(administrador, ID_PROYECTO, {
          originalname: 'lista.xlsx',
          buffer: Buffer.from('no es un excel'),
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('muestra la lista al docente asignado al proyecto', async () => {
      const { servicio, prisma } = crearServicio();

      const pagina = await servicio.listar(
        docenteAsignado,
        ID_PROYECTO,
        consulta,
      );

      expect(pagina).toEqual({
        elementos: [],
        pagina: 1,
        tamano: 20,
        total: 0,
        totalMatriculados: 0,
        totalRetirados: 0,
        ultimaCarga: null,
      });
      expect(prisma.auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accion: 'consultar_lista',
          tabla_afectada: 'matricula',
          id_registro: ID_PROYECTO,
        }) as object,
      });
    });

    it('oculta la lista a un docente que no está asignado al proyecto', async () => {
      const { servicio, prisma } = crearServicio();

      await expect(
        servicio.listar(docenteAjeno, ID_PROYECTO, consulta),
      ).rejects.toThrow(new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE));
      expect(prisma.matricula.findMany).not.toHaveBeenCalled();
    });

    it('no basta estar en proyecto_docente_docente: hace falta el rol Docente vigente', async () => {
      const { servicio } = crearServicio();
      const exDocente = usuario(docenteAsignado.id, [ROL.liderRap]);

      await expect(
        servicio.listar(exDocente, ID_PROYECTO, consulta),
      ).rejects.toThrow(NotFoundException);
    });

    it('sigue respondiendo aunque falle la auditoría', async () => {
      const { servicio, prisma } = crearServicio({ esAdministrador: true });
      prisma.auditoria.create.mockRejectedValue(new Error('sin base'));

      await expect(
        servicio.listar(administrador, ID_PROYECTO, consulta),
      ).resolves.toMatchObject({ total: 0 });
    });
  });
});
