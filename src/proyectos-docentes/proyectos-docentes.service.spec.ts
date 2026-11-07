import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { AlcanceService } from './alcance.service.js';
import type { AsistenteService } from './asistente.service.js';
import type { CrearProyectoDocenteDto } from './dto/crear-proyecto-docente.dto.js';
import {
  MENSAJE_DOCENTES_INVALIDOS,
  MENSAJE_DOCENTES_REPETIDOS,
  MENSAJE_PROYECTO_EXISTENTE,
  MENSAJE_RAP_INVALIDOS,
  MENSAJE_SIN_PERIODO,
  MENSAJE_UN_RESPONSABLE,
  ProyectosDocentesService,
} from './proyectos-docentes.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const ID_PROGRAMA = 10;

const usuarioDepartamento: UsuarioSesion = {
  id: 1,
  nombres: 'Departamento',
  apellidos: 'De Prueba',
  correo: 'departamento.prueba@urap.local',
  roles: [ROL.departamento],
  asignaciones: [{ rol: ROL.departamento, idPrograma: 10 }],
  permisos: ['proyectos.crear', 'proyectos.leer'],
  jti: 'jti-1',
  idSesion: 1,
};

const asignatura = {
  id: 5,
  id_programa: ID_PROGRAMA,
  codigo_interno: 'PRB-01',
  nombre: 'Asignatura de prueba',
  semestre: 3,
  componente: 'BASICO',
  tipo_curso: 'Obligatorio',
  creditos: null,
  horas_tde: 32,
  horas_tdp: 0,
  horas_ti: null,
  horas_totales: null,
  activo: true,
  programa: {
    id: ID_PROGRAMA,
    nombre: 'Programa de prueba',
    facultad: { nombre: 'Facultad de prueba' },
  },
  asignatura_requisito_asignatura_requisito_id_asignaturaToasignatura: [],
};

const periodo = {
  id: 7,
  codigo: '2026-2',
  fecha_inicio: new Date('2026-08-03'),
  fecha_fin: new Date('2026-11-21'),
  numero_semanas: 16,
};

function datosValidos(
  cambios: Partial<CrearProyectoDocenteDto> = {},
): CrearProyectoDocenteDto {
  return {
    idAsignatura: asignatura.id,
    idsRap: [1, 2],
    docentes: [
      { idUsuario: 21, responsable: false },
      { idUsuario: 20, responsable: true },
    ],
    ...cambios,
  };
}

/** Proyecto tal como lo devuelve Prisma con INCLUIR_DETALLE. */
function proyectoCreado(data: Record<string, any>) {
  return {
    id: 99,
    grupo: data.grupo,
    origen: data.origen,
    fecha_creacion: data.fecha_creacion,
    asignatura,
    periodo_academico: periodo,
    estado_proyecto: {
      codigo: 'en_diligenciamiento',
      nombre: 'En diligenciamiento',
    },
    proyecto_docente_docente: data.proyecto_docente_docente.create.map(
      (docente: { id_usuario: number; responsable: boolean }) => ({
        ...docente,
        usuario: {
          id: docente.id_usuario,
          nombres: 'Docente',
          apellidos: 'Ficticio',
        },
      }),
    ),
    proyecto_docente_rap: data.proyecto_docente_rap.create.map(
      (rap: { id_rap: number }) => ({
        rap: {
          id: rap.id_rap,
          codigo: `RAP ${rap.id_rap}`,
          numero: rap.id_rap,
          descripcion: null,
        },
      }),
    ),
  };
}

describe('ProyectosDocentesService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    proyecto_docente: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    asignatura: { findFirst: vi.fn() },
    estado_proyecto: { findUnique: vi.fn() },
    rap: { count: vi.fn() },
    usuario: { count: vi.fn() },
    proyecto_docente: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn((trabajo: (cliente: typeof tx) => unknown) =>
      trabajo(tx),
    ),
  };
  const alcance = { alcance: vi.fn() };
  const asistente = { exigirPrograma: vi.fn(), periodoVigente: vi.fn() };
  const auditoria = { registrar: vi.fn() };
  const servicio = new ProyectosDocentesService(
    prisma as unknown as PrismaService,
    alcance as unknown as AlcanceService,
    asistente as unknown as AsistenteService,
    auditoria as unknown as AuditoriaService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.asignatura.findFirst.mockResolvedValue(asignatura);
    asistente.exigirPrograma.mockResolvedValue(undefined);
    asistente.periodoVigente.mockResolvedValue(periodo);
    prisma.estado_proyecto.findUnique.mockResolvedValue({
      id: 1,
      codigo: 'en_diligenciamiento',
    });
    prisma.rap.count.mockResolvedValue(2);
    prisma.usuario.count.mockResolvedValue(2);
    auditoria.registrar.mockResolvedValue(undefined);
    tx.proyecto_docente.findFirst.mockResolvedValue(null);
    tx.proyecto_docente.create.mockImplementation(({ data }) =>
      Promise.resolve(proyectoCreado(data)),
    );
  });

  describe('crear', () => {
    it('crea en diligenciamiento, en el período vigente, con el responsable primero', async () => {
      const creado = await servicio.crear(usuarioDepartamento, datosValidos());

      const { data } = tx.proyecto_docente.create.mock.calls[0][0];
      expect(data).toMatchObject({
        id_asignatura: asignatura.id,
        id_periodo: periodo.id,
        id_estado: 1,
        grupo: null,
        origen: 'manual',
        id_creado_por: usuarioDepartamento.id,
        proyecto_docente_rap: { create: [{ id_rap: 1 }, { id_rap: 2 }] },
        proyecto_docente_docente: {
          create: [
            { id_usuario: 20, responsable: true, orden: 1 },
            { id_usuario: 21, responsable: false, orden: 2 },
          ],
        },
      });
      expect(creado.estado?.codigo).toBe('en_diligenciamiento');
      expect(creado.docentes[0]).toMatchObject({ id: 20, responsable: true });
    });

    it('autocompleta la información y marca la incompleta (p5, p7)', async () => {
      const creado = await servicio.crear(usuarioDepartamento, datosValidos());

      expect(creado.informacion).toMatchObject({
        facultad: 'Facultad de prueba',
        codigo: 'PRB-01',
        componente: 'BASICO',
        horasTde: 32,
        informacionIncompleta: true,
        camposFaltantes: ['créditos', 'horas TI'],
      });
      expect(creado.informacionIncompleta).toBe(true);
      expect(creado.periodoAcademico?.codigo).toBe('2026-2');
    });

    it('comprueba el alcance del Departamento sobre el programa de la asignatura', async () => {
      asistente.exigirPrograma.mockRejectedValue(new ForbiddenException());

      await expect(
        servicio.crear(usuarioDepartamento, datosValidos()),
      ).rejects.toThrow(ForbiddenException);
      expect(asistente.exigirPrograma).toHaveBeenCalledWith(1, ID_PROGRAMA);
      expect(tx.proyecto_docente.create).not.toHaveBeenCalled();
    });

    it('rechaza una asignatura inexistente o inactiva', async () => {
      prisma.asignatura.findFirst.mockResolvedValue(null);

      await expect(
        servicio.crear(usuarioDepartamento, datosValidos()),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza RAP que no son del programa', async () => {
      prisma.rap.count.mockResolvedValue(1);

      await expect(
        servicio.crear(usuarioDepartamento, datosValidos()),
      ).rejects.toThrow(MENSAJE_RAP_INVALIDOS);
    });

    it('exige exactamente un responsable', async () => {
      for (const responsables of [
        [false, false],
        [true, true],
      ]) {
        const docentes = responsables.map((responsable, indice) => ({
          idUsuario: 20 + indice,
          responsable,
        }));
        await expect(
          servicio.crear(usuarioDepartamento, datosValidos({ docentes })),
        ).rejects.toThrow(MENSAJE_UN_RESPONSABLE);
      }
    });

    it('rechaza el mismo docente dos veces', async () => {
      const docentes = [
        { idUsuario: 20, responsable: true },
        { idUsuario: 20, responsable: false },
      ];
      await expect(
        servicio.crear(usuarioDepartamento, datosValidos({ docentes })),
      ).rejects.toThrow(MENSAJE_DOCENTES_REPETIDOS);
    });

    it('rechaza usuarios que no son docentes del programa', async () => {
      prisma.usuario.count.mockResolvedValue(1);

      await expect(
        servicio.crear(usuarioDepartamento, datosValidos()),
      ).rejects.toThrow(MENSAJE_DOCENTES_INVALIDOS);
    });

    it('no crea sin un período académico activo', async () => {
      asistente.periodoVigente.mockResolvedValue(null);

      const intento = servicio.crear(usuarioDepartamento, datosValidos());
      await expect(intento).rejects.toThrow(ConflictException);
      await expect(intento).rejects.toThrow(MENSAJE_SIN_PERIODO);
    });

    it('advierte si ya existe el curso, también sin grupo (p6)', async () => {
      tx.proyecto_docente.findFirst.mockResolvedValue({ id: 3 });

      await expect(
        servicio.crear(usuarioDepartamento, datosValidos()),
      ).rejects.toThrow(MENSAJE_PROYECTO_EXISTENTE);
      expect(tx.proyecto_docente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id_asignatura: asignatura.id,
            id_periodo: periodo.id,
            grupo: null,
          },
        }),
      );
      expect(tx.proyecto_docente.create).not.toHaveBeenCalled();
    });

    it('bloquea la asignatura antes de comprobar el duplicado, para atender de a una', async () => {
      const orden: string[] = [];
      tx.$queryRaw.mockImplementation(() => {
        orden.push('bloqueo');
        return Promise.resolve([]);
      });
      tx.proyecto_docente.findFirst.mockImplementation(() => {
        orden.push('comprobación');
        return Promise.resolve(null);
      });

      await servicio.crear(usuarioDepartamento, datosValidos());

      expect(orden).toEqual(['bloqueo', 'comprobación']);
      const [sql, idAsignatura] = tx.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        number,
      ];
      expect(sql.join('?')).toMatch(/FROM asignatura WHERE id = \? FOR UPDATE/);
      expect(idAsignatura).toBe(asignatura.id);
    });

    it('registra la creación en auditoría, después de confirmar la transacción', async () => {
      await servicio.crear(usuarioDepartamento, datosValidos({ grupo: 'A' }));

      // El usuario y la IP los pone AuditoriaService desde el contexto de la petición.
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'crear',
          tablaAfectada: 'proyecto_docente',
          idRegistro: 99,
          valorNuevo: expect.objectContaining({ grupo: 'A' }),
        }),
      );
      expect(auditoria.registrar.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });
  });

  describe('listar', () => {
    const pagina = { pagina: 2, tamano: 10 };

    beforeEach(() => {
      prisma.proyecto_docente.count.mockResolvedValue(0);
      prisma.proyecto_docente.findMany.mockResolvedValue([]);
    });

    it('al Docente le muestra solo los proyectos donde está asignado', async () => {
      alcance.alcance.mockResolvedValue({ global: false, programas: [] });
      const docente = { ...usuarioDepartamento, id: 20, roles: [ROL.docente] };

      await servicio.listar(docente, pagina);

      expect(prisma.proyecto_docente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ proyecto_docente_docente: { some: { id_usuario: 20 } } }],
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('a un docente que también es Líder RAP le suma los de su programa', async () => {
      alcance.alcance.mockResolvedValue({
        global: false,
        programas: [ID_PROGRAMA],
      });
      const lider = {
        ...usuarioDepartamento,
        id: 20,
        roles: [ROL.docente, ROL.liderRap],
      };

      await servicio.listar(lider, pagina);

      expect(prisma.proyecto_docente.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { asignatura: { is: { id_programa: { in: [ID_PROGRAMA] } } } },
            { proyecto_docente_docente: { some: { id_usuario: 20 } } },
          ],
        },
      });
    });

    it('al administrador, de alcance global, le muestra todos', async () => {
      alcance.alcance.mockResolvedValue({ global: true, programas: [] });

      await servicio.listar(
        { ...usuarioDepartamento, roles: [ROL.administrador] },
        pagina,
      );

      expect(prisma.proyecto_docente.count).toHaveBeenCalledWith({ where: {} });
    });

    it('sin alcance no consulta y devuelve la página vacía', async () => {
      alcance.alcance.mockResolvedValue({ global: false, programas: [] });

      await expect(
        servicio.listar(
          { ...usuarioDepartamento, roles: [ROL.departamento] },
          pagina,
        ),
      ).resolves.toEqual({ elementos: [], pagina: 2, tamano: 10, total: 0 });
      expect(prisma.proyecto_docente.findMany).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('responde 404 si el proyecto no es visible para el usuario', async () => {
      alcance.alcance.mockResolvedValue({ global: false, programas: [] });
      prisma.proyecto_docente.findFirst.mockResolvedValue(null);
      const docente = { ...usuarioDepartamento, id: 20, roles: [ROL.docente] };

      await expect(servicio.obtener(docente, 3)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.proyecto_docente.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { id: 3 },
              {
                OR: [
                  { proyecto_docente_docente: { some: { id_usuario: 20 } } },
                ],
              },
            ],
          },
        }),
      );
    });
  });
});
