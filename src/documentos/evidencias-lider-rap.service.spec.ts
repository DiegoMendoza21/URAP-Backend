import { ForbiddenException } from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { ProyectosDocentesService } from '../proyectos-docentes/proyectos-docentes.service.js';
import {
  EvidenciasLiderRapService,
  filtroProyectos,
  MENSAJE_RAP_NO_A_CARGO,
} from './evidencias-lider-rap.service.js';

// Datos ficticios: nunca datos reales de personas.
const VISIBLES = {
  asignatura: { is: { plan_estudio: { id_programa: { in: [3] } } } },
};
const RAP_2 = { id: 102, numero: 2, codigo: 'RAP 2', descripcion: 'Dos' };
const RAP_3 = { id: 103, numero: 3, codigo: 'RAP 3', descripcion: 'Tres' };

function usuario(id: number, ...roles: string[]): UsuarioSesion {
  return {
    id,
    nombres: 'Usuario',
    apellidos: 'De Prueba',
    correo: `usuario${id}@urap.local`,
    roles,
    jti: `jti-${id}`,
    idSesion: id,
    asignaciones: [],
    permisos: [],
  };
}

const lider = usuario(40, ROL.docente, ROL.liderRap);
const docente = usuario(20, ROL.docente);

describe('EvidenciasLiderRapService', () => {
  const prisma = {
    lider_rap: { findMany: vi.fn() },
    rap: { findMany: vi.fn() },
    periodo_academico: { findMany: vi.fn() },
    evidencia_rap: { count: vi.fn(), findMany: vi.fn() },
    proyecto_docente: { count: vi.fn() },
  };
  const proyectos = { filtroVisibilidad: vi.fn() };
  let servicio: EvidenciasLiderRapService;

  beforeEach(() => {
    vi.resetAllMocks();
    proyectos.filtroVisibilidad.mockResolvedValue(VISIBLES);
    prisma.evidencia_rap.count.mockResolvedValue(0);
    prisma.evidencia_rap.findMany.mockResolvedValue([]);
    prisma.proyecto_docente.count.mockResolvedValue(0);
    servicio = new EvidenciasLiderRapService(
      prisma as unknown as PrismaService,
      proyectos as unknown as ProyectosDocentesService,
    );
  });

  describe('rapsACargo', () => {
    it('sin el rol Líder RAP no consulta los liderazgos y devuelve la lista vacía', async () => {
      prisma.lider_rap.findMany.mockResolvedValue([
        { id_rap: RAP_2.id, id_periodo: 4 },
      ]);

      await expect(servicio.rapsACargo(docente)).resolves.toEqual({ raps: [] });
      expect(prisma.lider_rap.findMany).not.toHaveBeenCalled();
    });

    it('solo lee los liderazgos vigentes del usuario', async () => {
      prisma.lider_rap.findMany.mockResolvedValue([]);

      await expect(servicio.rapsACargo(lider)).resolves.toEqual({ raps: [] });
      expect(prisma.lider_rap.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_usuario: lider.id, activo: true, id_rap: { not: null } },
        }),
      );
    });

    it('agrupa los períodos de cada RAP y cuenta solo en los proyectos de esos períodos', async () => {
      prisma.lider_rap.findMany.mockResolvedValue([
        { id_rap: RAP_2.id, id_periodo: 4 },
        { id_rap: RAP_2.id, id_periodo: 5 },
        { id_rap: RAP_3.id, id_periodo: null },
      ]);
      prisma.rap.findMany.mockResolvedValue([RAP_2, RAP_3]);
      prisma.periodo_academico.findMany.mockResolvedValue([
        { id: 5, codigo: '2027-1', fecha_inicio: new Date('2027-02-01') },
        { id: 4, codigo: '2026-2', fecha_inicio: new Date('2026-08-03') },
      ]);
      prisma.evidencia_rap.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0);
      prisma.proyecto_docente.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);

      const { raps } = await servicio.rapsACargo(lider);

      expect(raps).toEqual([
        {
          ...RAP_2,
          todosLosPeriodos: false,
          periodos: [
            { id: 5, codigo: '2027-1' },
            { id: 4, codigo: '2026-2' },
          ],
          totalEvidencias: 5,
          totalProyectos: 4,
          proyectosConEvidencias: 3,
        },
        {
          ...RAP_3,
          todosLosPeriodos: true,
          periodos: [],
          totalEvidencias: 0,
          totalProyectos: 2,
          proyectosConEvidencias: 0,
        },
      ]);
      expect(prisma.evidencia_rap.count).toHaveBeenNthCalledWith(1, {
        where: {
          id_rap: RAP_2.id,
          proyecto_docente: {
            is: { AND: [VISIBLES, { id_periodo: { in: [4, 5] } }] },
          },
        },
      });
      // Sin período: todos los proyectos que ve, de cualquier período.
      expect(prisma.evidencia_rap.count).toHaveBeenNthCalledWith(2, {
        where: { id_rap: RAP_3.id, proyecto_docente: { is: VISIBLES } },
      });
    });
  });

  describe('evidenciasDeRap', () => {
    const pagina = { pagina: 2, tamano: 12 };

    it('responde 403 si el RAP no está a cargo del usuario', async () => {
      prisma.lider_rap.findMany.mockResolvedValue([
        { id_rap: RAP_2.id, id_periodo: 4 },
      ]);

      const consulta = servicio.evidenciasDeRap(lider, RAP_3.id, pagina);
      await expect(consulta).rejects.toBeInstanceOf(ForbiddenException);
      await expect(consulta).rejects.toThrow(MENSAJE_RAP_NO_A_CARGO);
      expect(prisma.evidencia_rap.findMany).not.toHaveBeenCalled();
    });

    it('responde 403 a quien no es Líder RAP, aunque tenga filas en lider_rap', async () => {
      prisma.lider_rap.findMany.mockResolvedValue([
        { id_rap: RAP_2.id, id_periodo: 4 },
      ]);

      await expect(
        servicio.evidenciasDeRap(docente, RAP_2.id, pagina),
      ).rejects.toThrow(MENSAJE_RAP_NO_A_CARGO);
    });

    it('lista las evidencias del RAP en los proyectos de sus períodos, con asignatura, grupo y docente', async () => {
      prisma.lider_rap.findMany.mockResolvedValue([
        { id_rap: RAP_2.id, id_periodo: 4 },
      ]);
      prisma.evidencia_rap.count.mockResolvedValue(13);
      prisma.evidencia_rap.findMany.mockResolvedValue([
        {
          id: 7,
          id_proyecto_docente: 12,
          id_rap: RAP_2.id,
          descripcion: 'Taller en grupos.',
          fecha: new Date('2026-09-14T00:00:00.000Z'),
          nombre_original: 'tablero.png',
          tipo: 'image/png',
          tamano_bytes: 2048,
          fecha_subida: new Date('2026-09-14T15:20:00.000Z'),
          sesion_clase: null,
          usuario: { id: 20, nombres: 'Docente', apellidos: 'Ficticio' },
          proyecto_docente: {
            id: 12,
            grupo: 'A',
            asignatura: { nombre: 'Asignatura ficticia' },
            periodo_academico: { codigo: '2026-2' },
            proyecto_docente_docente: [
              {
                usuario: { id: 20, nombres: 'Docente', apellidos: 'Ficticio' },
              },
            ],
          },
        },
      ]);

      const respuesta = await servicio.evidenciasDeRap(lider, RAP_2.id, pagina);

      expect(respuesta).toMatchObject({ pagina: 2, tamano: 12, total: 13 });
      expect(respuesta.elementos[0]).toMatchObject({
        id: 7,
        idRap: RAP_2.id,
        descripcion: 'Taller en grupos.',
        fecha: '2026-09-14',
        proyecto: {
          id: 12,
          asignatura: 'Asignatura ficticia',
          grupo: 'A',
          periodo: '2026-2',
          docenteResponsable: {
            id: 20,
            nombres: 'Docente',
            apellidos: 'Ficticio',
          },
        },
      });
      expect(prisma.evidencia_rap.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id_rap: RAP_2.id,
            proyecto_docente: {
              is: { AND: [VISIBLES, { id_periodo: { in: [4] } }] },
            },
          },
          skip: 12,
          take: 12,
        }),
      );
    });
  });

  it('filtroProyectos no restringe el período cuando lidera el RAP sin período', () => {
    expect(filtroProyectos(VISIBLES, { todos: true, periodos: [4] })).toBe(
      VISIBLES,
    );
  });
});
