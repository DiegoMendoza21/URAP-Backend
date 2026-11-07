import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { AlcanceService } from '../proyectos-docentes/alcance.service.js';
import type { ProyectosDocentesService } from '../proyectos-docentes/proyectos-docentes.service.js';
import { aFechaColumna, aHoraColumna } from './calendario.js';
import {
  MENSAJE_DIA_REPETIDO,
  MENSAJE_HORAS_INVERTIDAS,
  MENSAJE_PERIODO_CERRADO,
  MENSAJE_PERIODO_SIN_FECHAS,
  MENSAJE_SIN_HORARIO,
  MENSAJE_SOLO_DOCENTE_ASIGNADO,
  mensajeSinFestivos,
  SesionesService,
} from './sesiones.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const docente: UsuarioSesion = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
};
const departamento: UsuarioSesion = {
  ...docente,
  id: 1,
  roles: [ROL.departamento],
};
const administrador: UsuarioSesion = {
  ...docente,
  id: 2,
  roles: [ROL.administrador],
};

const TIPO_CLASE = { id: 1, codigo: 'clase', nombre: 'Clase' };
const TIPO_FESTIVO = { id: 3, codigo: 'festivo', nombre: 'Festivo' };
const TIPO_PARCIAL = { id: 2, codigo: 'parcial', nombre: 'Parcial' };

function proyecto(cambios: Record<string, unknown> = {}) {
  return {
    id: 99,
    asignatura: { id_programa: 10 },
    periodo_academico: {
      id: 7,
      codigo: '2026-2',
      fecha_inicio: aFechaColumna('2026-08-03'),
      fecha_fin: aFechaColumna('2026-08-23'), // tres semanas
      numero_semanas: 3,
      cerrado: false,
    },
    horario_curso: [
      {
        id: 1,
        dia_semana: 1,
        hora_inicio: aHoraColumna('07:00'),
        hora_fin: aHoraColumna('09:00'),
      },
    ],
    ...cambios,
  };
}

function sesion(
  id: number,
  fecha: string,
  cambios: Record<string, unknown> = {},
) {
  return {
    id,
    fecha: aFechaColumna(fecha),
    semana: 1,
    dia_semana: 1,
    estado: 'programada',
    id_tipo_sesion: TIPO_CLASE.id,
    id_dia_festivo: null,
    fecha_registro: null,
    id_registrado_por: null,
    _count: { sesion_tema: 0, inasistencia: 0, evidencia_rap: 0 },
    ...cambios,
  };
}

describe('SesionesService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    horario_curso: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    sesion_clase: {
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const prisma = {
    proyecto_docente: { findUnique: vi.fn() },
    proyecto_docente_docente: { findFirst: vi.fn() },
    dia_festivo: { findMany: vi.fn() },
    tipo_sesion: { findMany: vi.fn() },
    tipo_notificacion: { findUnique: vi.fn() },
    usuario: { findMany: vi.fn() },
    notificacion: { findMany: vi.fn(), createMany: vi.fn() },
    auditoria: { create: vi.fn() },
    $transaction: vi.fn((trabajo: (cliente: typeof tx) => unknown) =>
      trabajo(tx),
    ),
  };
  const alcance = { alcanzaPrograma: vi.fn() };
  const proyectos = { obtener: vi.fn() };
  const servicio = new SesionesService(
    prisma as unknown as PrismaService,
    alcance as unknown as AlcanceService,
    proyectos as unknown as ProyectosDocentesService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    proyectos.obtener.mockResolvedValue({});
    prisma.proyecto_docente.findUnique.mockResolvedValue(proyecto());
    prisma.proyecto_docente_docente.findFirst.mockResolvedValue({
      id_usuario: docente.id,
    });
    alcance.alcanzaPrograma.mockResolvedValue(false);
    prisma.tipo_sesion.findMany.mockResolvedValue([TIPO_CLASE, TIPO_FESTIVO]);
    // El 2026 tiene festivos; el 10 de agosto no lo es, pero se simula como tal.
    prisma.dia_festivo.findMany.mockImplementation(
      ({ distinct }: { distinct?: unknown }) =>
        Promise.resolve(
          distinct
            ? [{ anio: 2026 }]
            : [
                {
                  id: 50,
                  fecha: aFechaColumna('2026-08-10'),
                  nombre: 'Festivo de prueba',
                },
              ],
        ),
    );
    prisma.auditoria.create.mockResolvedValue({});
    tx.sesion_clase.findMany.mockResolvedValue([]);
    tx.sesion_clase.count.mockResolvedValue(3);
    tx.horario_curso.findMany.mockResolvedValue([]);
  });

  describe('guardarHorario (HU-08-02)', () => {
    const bloques = [
      { diaSemana: 3, horaInicio: '14:00', horaFin: '16:00' },
      { diaSemana: 1, horaInicio: '07:00', horaFin: '09:00' },
    ];

    it('reemplaza el horario, ordenado por día, y lo audita', async () => {
      await servicio.guardarHorario(docente, 99, { bloques });

      expect(tx.horario_curso.deleteMany).toHaveBeenCalledWith({
        where: { id_proyecto_docente: 99 },
      });
      const { data } = tx.horario_curso.createMany.mock.calls[0][0];
      expect(
        data.map((fila: { dia_semana: number }) => fila.dia_semana),
      ).toEqual([1, 3]);
      expect(data[0].hora_inicio).toEqual(aHoraColumna('07:00'));
      expect(prisma.auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accion: 'actualizar',
          tabla_afectada: 'horario_curso',
          id_registro: 99,
        }),
      });
    });

    it('rechaza un día repetido', async () => {
      await expect(
        servicio.guardarHorario(docente, 99, {
          bloques: [bloques[1], bloques[1]],
        }),
      ).rejects.toThrow(new BadRequestException(MENSAJE_DIA_REPETIDO));
    });

    it('rechaza una hora de fin que no es posterior a la de inicio', async () => {
      await expect(
        servicio.guardarHorario(docente, 99, {
          bloques: [{ diaSemana: 2, horaInicio: '09:00', horaFin: '09:00' }],
        }),
      ).rejects.toThrow(new BadRequestException(MENSAJE_HORAS_INVERTIDAS));
    });

    it('no deja a un docente que no está asignado al proyecto', async () => {
      prisma.proyecto_docente_docente.findFirst.mockResolvedValue(null);

      await expect(
        servicio.guardarHorario(docente, 99, { bloques }),
      ).rejects.toThrow(new ForbiddenException(MENSAJE_SOLO_DOCENTE_ASIGNADO));
      expect(tx.horario_curso.createMany).not.toHaveBeenCalled();
    });

    it('responde 404 si el usuario no ve el proyecto', async () => {
      proyectos.obtener.mockRejectedValue(new NotFoundException());

      await expect(
        servicio.guardarHorario(docente, 99, { bloques }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deja al administrador del programa', async () => {
      alcance.alcanzaPrograma.mockResolvedValue(true);

      await servicio.guardarHorario(administrador, 99, { bloques });

      expect(alcance.alcanzaPrograma).toHaveBeenCalledWith(
        2,
        [ROL.administrador],
        10,
      );
      expect(tx.horario_curso.createMany).toHaveBeenCalled();
    });

    it('no deja cambiar el horario con el período cerrado', async () => {
      prisma.proyecto_docente.findUnique.mockResolvedValue(
        proyecto({
          periodo_academico: { ...proyecto().periodo_academico, cerrado: true },
        }),
      );

      await expect(
        servicio.guardarHorario(docente, 99, { bloques }),
      ).rejects.toThrow(new ConflictException(MENSAJE_PERIODO_CERRADO));
    });
  });

  describe('generarCalendario (HU-08-03)', () => {
    it('crea una sesión por lunes, numerada por semana, y marca el festivo (p2 a p4)', async () => {
      const resultado = await servicio.generarCalendario(docente, 99);

      const { data } = tx.sesion_clase.createMany.mock.calls[0][0];
      expect(data).toEqual([
        expect.objectContaining({
          fecha: aFechaColumna('2026-08-03'),
          semana: 1,
          id_tipo_sesion: TIPO_CLASE.id,
          id_dia_festivo: null,
          estado: 'programada',
        }),
        expect.objectContaining({
          fecha: aFechaColumna('2026-08-10'),
          semana: 2,
          id_tipo_sesion: TIPO_FESTIVO.id,
          id_dia_festivo: 50,
        }),
        expect.objectContaining({
          fecha: aFechaColumna('2026-08-17'),
          semana: 3,
        }),
      ]);
      expect(resultado).toMatchObject({
        creadas: 3,
        retiradas: 0,
        advertencias: [],
      });
      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it('sin festivos del año, genera sin marcas, advierte y avisa al administrador (p3)', async () => {
      prisma.dia_festivo.findMany.mockResolvedValue([]);
      prisma.tipo_notificacion.findUnique.mockResolvedValue({ id: 9 });
      prisma.usuario.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      prisma.notificacion.findMany.mockResolvedValue([{ id_usuario: 3 }]);

      const resultado = await servicio.generarCalendario(docente, 99);

      const { data } = tx.sesion_clase.createMany.mock.calls[0][0];
      expect(
        data.every(
          (fila: { id_dia_festivo: unknown }) => fila.id_dia_festivo === null,
        ),
      ).toBe(true);
      expect(resultado.advertencias).toEqual([mensajeSinFestivos(2026)]);
      // El administrador 3 ya tiene el aviso sin leer: solo se avisa al 2.
      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            id_usuario: 2,
            id_tipo_notificacion: 9,
            entidad: 'dia_festivo',
            id_entidad: 2026,
          }),
        ],
      });
    });

    it('si el aviso al administrador falla, el calendario se genera igual', async () => {
      prisma.dia_festivo.findMany.mockResolvedValue([]);
      prisma.tipo_notificacion.findUnique.mockRejectedValue(new Error('caída'));

      await expect(
        servicio.generarCalendario(docente, 99),
      ).resolves.toMatchObject({
        creadas: 3,
      });
    });

    it('al recalcular no toca las diligenciadas y retira las vacías que salen del horario', async () => {
      tx.sesion_clase.findMany.mockResolvedValue([
        // Diligenciada en una fecha que ya no está en el horario: se conserva.
        sesion(1, '2026-08-04', {
          estado: 'registrada',
          fecha_registro: new Date(),
        }),
        // Vacía fuera del horario: se retira.
        sesion(2, '2026-08-05'),
        // Vacía con una inasistencia (no debería pasar): se conserva.
        sesion(3, '2026-08-06', {
          _count: { sesion_tema: 0, inasistencia: 1, evidencia_rap: 0 },
        }),
        // Vacía en el horario, que ahora coincide con un festivo: se actualiza.
        sesion(4, '2026-08-10'),
        // Vacía en el horario, sin cambios.
        sesion(5, '2026-08-03'),
      ]);

      const resultado = await servicio.generarCalendario(docente, 99);

      expect(tx.sesion_clase.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
      });
      expect(tx.sesion_clase.update).toHaveBeenCalledTimes(1);
      expect(tx.sesion_clase.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: {
          semana: 2,
          dia_semana: 1,
          id_dia_festivo: 50,
          id_tipo_sesion: TIPO_FESTIVO.id,
        },
      });
      const { data } = tx.sesion_clase.createMany.mock.calls[0][0];
      expect(data.map((fila: { fecha: Date }) => fila.fecha)).toEqual([
        aFechaColumna('2026-08-17'),
      ]);
      expect(resultado).toMatchObject({
        creadas: 1,
        actualizadas: 1,
        retiradas: 1,
        conservadas: 2,
      });
    });

    it('marca el festivo sin cambiar el tipo que el docente ya eligió', async () => {
      tx.sesion_clase.findMany.mockResolvedValue([
        sesion(4, '2026-08-10', { semana: 2, id_tipo_sesion: TIPO_PARCIAL.id }),
      ]);

      await servicio.generarCalendario(docente, 99);

      expect(tx.sesion_clase.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: expect.objectContaining({
          id_dia_festivo: 50,
          id_tipo_sesion: TIPO_PARCIAL.id,
        }),
      });
    });

    it('exige el horario del curso (precondición)', async () => {
      prisma.proyecto_docente.findUnique.mockResolvedValue(
        proyecto({ horario_curso: [] }),
      );

      await expect(servicio.generarCalendario(docente, 99)).rejects.toThrow(
        new ConflictException(MENSAJE_SIN_HORARIO),
      );
    });

    it('exige las fechas del período (precondición)', async () => {
      prisma.proyecto_docente.findUnique.mockResolvedValue(
        proyecto({
          periodo_academico: {
            ...proyecto().periodo_academico,
            fecha_fin: null,
          },
        }),
      );

      await expect(servicio.generarCalendario(docente, 99)).rejects.toThrow(
        new ConflictException(MENSAJE_PERIODO_SIN_FECHAS),
      );
    });

    it('no deja generar a quien solo consulta, como el Departamento', async () => {
      await expect(
        servicio.generarCalendario(departamento, 99),
      ).rejects.toThrow(new ForbiddenException(MENSAJE_SOLO_DOCENTE_ASIGNADO));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
