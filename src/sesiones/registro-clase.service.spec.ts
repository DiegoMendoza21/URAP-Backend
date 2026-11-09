import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import { aFechaColumna, aHoraColumna } from './calendario.js';
import {
  MENSAJE_AUSENTES_INVALIDOS,
  MENSAJE_CONFIRMAR_TODO_EL_GRUPO,
  MENSAJE_FECHA_FUTURA,
  MENSAJE_PERIODO_CERRADO_REGISTRO,
  MENSAJE_PROYECTO_NO_APROBADO,
  MENSAJE_SIN_CONTENIDO,
  MENSAJE_SOLO_QUIEN_REGISTRA,
  MENSAJE_TEMAS_INVALIDOS,
  mensajeTipoSinTema,
  RegistroClaseService,
} from './registro-clase.service.js';
import type { SesionesService } from './sesiones.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas (Ley 1581).
const docente = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
  idSesion: 20,
} as UsuarioSesion;

const TIPO_CLASE = {
  id: 1,
  codigo: 'clase',
  nombre: 'Clase',
  exige_tema: true,
};
const TIPO_FESTIVO = {
  id: 3,
  codigo: 'festivo',
  nombre: 'Festivo',
  exige_tema: false,
};

function proyecto(cambios: Record<string, unknown> = {}) {
  return {
    id: 99,
    asignatura: {
      plan_estudio: { id_programa: 10 },
      nombre: 'Asignatura de prueba',
    },
    periodo_academico: {
      cerrado: false,
      fecha_inicio: aFechaColumna('2026-08-03'),
      fecha_fin: aFechaColumna('2026-11-27'),
    },
    estado_proyecto: { codigo: 'aprobado', nombre: 'Aprobado' },
    horario_curso: [
      {
        dia_semana: 3,
        hora_inicio: aHoraColumna('14:00'),
        hora_fin: aHoraColumna('16:00'),
      },
    ],
    ...cambios,
  };
}

/** La sesión del miércoles 4 de noviembre, como la lee la transacción. */
function sesionEnTransaccion(cambios: Record<string, unknown> = {}) {
  return {
    id: 500,
    fecha: aFechaColumna('2026-11-04'),
    semana: 14,
    estado: 'programada',
    fecha_registro: null,
    id_registrado_por: null,
    observaciones: null,
    tipo_sesion: TIPO_CLASE,
    sesion_tema: [] as Array<{ id_contenido: number | null }>,
    inasistencia: [] as Array<{ id_matricula: number }>,
    ...cambios,
  };
}

/** La misma sesión con lo que trae el detalle. */
function sesionDetalle(cambios: Record<string, unknown> = {}) {
  return {
    ...sesionEnTransaccion(),
    dia_semana: 3,
    descripcion: null,
    id_dia_festivo: null,
    dia_festivo: null,
    usuario: null,
    _count: { sesion_tema: 0, inasistencia: 0 },
    ...cambios,
  };
}

const CONTENIDOS = [
  { id: 10, semana: 14, tema: 'Tema de la semana 14' },
  { id: 11, semana: 15, tema: 'Tema de la semana 15' },
  { id: 12, semana: 16, tema: null },
];
const MATRICULAS = [
  { id: 101, estado: 'matriculado' },
  { id: 102, estado: 'matriculado' },
  { id: 103, estado: 'retirado' },
];

describe('RegistroClaseService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    sesion_clase: { findFirst: vi.fn(), update: vi.fn() },
    contenido_programatico: { findMany: vi.fn() },
    matricula: { findMany: vi.fn(), count: vi.fn() },
    sesion_tema: { deleteMany: vi.fn(), createMany: vi.fn() },
    inasistencia: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const prisma = {
    sesion_clase: { findFirst: vi.fn() },
    contenido_programatico: { findMany: vi.fn() },
    matricula: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(
      (trabajo: (cliente: typeof tx) => unknown, _opciones?: unknown) =>
        trabajo(tx),
    ),
  };
  const sesiones = {
    proyectoVisible: vi.fn(),
    tienePermisoEdicion: vi.fn(),
  };
  const parametros = { leerEntero: vi.fn() };
  const auditoria = { registrar: vi.fn() };
  const servicio = new RegistroClaseService(
    prisma as unknown as PrismaService,
    sesiones as unknown as SesionesService,
    parametros as unknown as ParametrosService,
    auditoria as unknown as AuditoriaService,
  );

  const registrar = (datos: Record<string, unknown>) =>
    servicio.registrar(docente, 99, 500, {
      idsContenido: [10],
      ausentes: [],
      ...datos,
    } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    // Sábado 7 de noviembre de 2026, 10 a. m. en Bogotá.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
    sesiones.proyectoVisible.mockResolvedValue(proyecto());
    sesiones.tienePermisoEdicion.mockResolvedValue(true);
    parametros.leerEntero.mockResolvedValue(2);
    tx.sesion_clase.findFirst.mockResolvedValue(sesionEnTransaccion());
    tx.contenido_programatico.findMany.mockImplementation(
      ({ where }: { where: { id: { in: number[] } } }) =>
        Promise.resolve(CONTENIDOS.filter((c) => where.id.in.includes(c.id))),
    );
    tx.matricula.findMany.mockImplementation(
      ({ where }: { where: { id: { in: number[] } } }) =>
        Promise.resolve(MATRICULAS.filter((m) => where.id.in.includes(m.id))),
    );
    tx.matricula.count.mockResolvedValue(2);
    prisma.sesion_clase.findFirst.mockResolvedValue(sesionDetalle());
    prisma.contenido_programatico.findMany.mockResolvedValue(CONTENIDOS);
    prisma.matricula.findMany.mockResolvedValue([
      {
        id: 101,
        estado: 'matriculado',
        estudiante: { nombres: 'Estudiante', apellidos: 'Ficticio Uno' },
      },
      {
        id: 102,
        estado: 'matriculado',
        estudiante: { nombres: 'Estudiante', apellidos: 'Ficticio Dos' },
      },
    ]);
    prisma.matricula.count.mockResolvedValue(3);
    auditoria.registrar.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registrar (HU-08-04 y HU-09-02)', () => {
    it('guarda temas, ausentes y observaciones, y marca la sesión diligenciada', async () => {
      await registrar({
        idsContenido: [10, 11],
        ausentes: [101],
        observaciones: '  Taller en grupos  ',
      });

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.sesion_tema.createMany).toHaveBeenCalledWith({
        data: [
          { id_sesion: 500, id_contenido: 10 },
          { id_sesion: 500, id_contenido: 11 },
        ],
      });
      expect(tx.inasistencia.createMany).toHaveBeenCalledWith({
        data: [{ id_sesion: 500, id_matricula: 101 }],
      });
      expect(tx.sesion_clase.update).toHaveBeenCalledWith({
        where: { id: 500 },
        data: expect.objectContaining({
          estado: 'registrada',
          id_registrado_por: docente.id,
          observaciones: 'Taller en grupos',
          fecha_registro: expect.any(Date),
        }),
      });
      // RF-29: solo lo que cambió. De las observaciones y los ausentes (Ley 1581), ni el
      // texto ni quiénes: que cambiaron y cuántos.
      expect(auditoria.registrar).toHaveBeenCalledTimes(2);
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'sesion_clase',
        idRegistro: 500,
        valorAnterior: {
          estado: 'programada',
          temas: [],
          observaciones: '[omitido]',
        },
        valorNuevo: {
          estado: 'registrada',
          temas: [10, 11],
          observaciones: '[omitido]',
        },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'inasistencia',
        idRegistro: 500,
        valorAnterior: { ausentes: 0 },
        valorNuevo: { ausentes: 1, marcados: 1, desmarcados: 0 },
      });
    });

    it('corrige un registro: quita lo desmarcado, agrega lo nuevo y conserva quién registró', async () => {
      const registrada = new Date('2026-11-04T21:00:00Z');
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({
          estado: 'registrada',
          fecha_registro: registrada,
          id_registrado_por: 7,
          sesion_tema: [{ id_contenido: 10 }, { id_contenido: null }],
          inasistencia: [{ id_matricula: 101 }, { id_matricula: 102 }],
        }),
      );

      await registrar({ idsContenido: [11], ausentes: [102] });

      // Los temas adicionales (sin `id_contenido`, HU-08-05) no se tocan.
      expect(tx.sesion_tema.deleteMany).toHaveBeenCalledWith({
        where: { id_sesion: 500, id_contenido: { not: null, notIn: [11] } },
      });
      expect(tx.sesion_tema.createMany).toHaveBeenCalledWith({
        data: [{ id_sesion: 500, id_contenido: 11 }],
      });
      expect(tx.inasistencia.deleteMany).toHaveBeenCalledWith({
        where: { id_sesion: 500, id_matricula: { notIn: [102] } },
      });
      expect(tx.inasistencia.createMany).not.toHaveBeenCalled();
      expect(tx.sesion_clase.update).toHaveBeenCalledWith({
        where: { id: 500 },
        data: expect.objectContaining({
          fecha_registro: registrada,
          id_registrado_por: 7,
        }),
      });
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'sesion_clase',
        idRegistro: 500,
        valorAnterior: { temas: [10] },
        valorNuevo: { temas: [11] },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'inasistencia',
        idRegistro: 500,
        valorAnterior: { ausentes: 2 },
        valorNuevo: { ausentes: 1, marcados: 0, desmarcados: 1 },
      });
    });

    it('no audita si se guarda el mismo registro', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({
          estado: 'registrada',
          fecha_registro: new Date('2026-11-04T21:00:00Z'),
          id_registrado_por: 7,
          sesion_tema: [{ id_contenido: 10 }],
          inasistencia: [{ id_matricula: 101 }],
          observaciones: 'Taller',
        }),
      );

      await registrar({ idsContenido: [10], ausentes: [101] });

      expect(tx.sesion_clase.update).toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('si solo cambian las observaciones, audita que cambiaron sin su texto', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({
          estado: 'registrada',
          fecha_registro: new Date('2026-11-04T21:00:00Z'),
          id_registrado_por: 7,
          sesion_tema: [{ id_contenido: 10 }],
          observaciones: 'Taller',
        }),
      );

      await registrar({
        idsContenido: [10],
        observaciones: 'Faltó Ficticio Uno',
      });

      expect(auditoria.registrar).toHaveBeenCalledTimes(1);
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'sesion_clase',
        idRegistro: 500,
        valorAnterior: { observaciones: '[omitido]' },
        valorNuevo: { observaciones: '[omitido]' },
      });
    });

    it('sin el campo de observaciones conserva las anteriores; vacío las borra', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({ observaciones: 'Faltaron dos.' }),
      );

      await registrar({});
      expect(tx.sesion_clase.update).toHaveBeenLastCalledWith({
        where: { id: 500 },
        data: expect.objectContaining({ observaciones: 'Faltaron dos.' }),
      });

      await registrar({ observaciones: '  ' });
      expect(tx.sesion_clase.update).toHaveBeenLastCalledWith({
        where: { id: 500 },
        data: expect.objectContaining({ observaciones: null }),
      });
    });

    it('no registra una sesión de fecha futura (RF-20, excepción p6)', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({ fecha: aFechaColumna('2026-11-09') }),
      );

      await expect(registrar({})).rejects.toThrow(
        new ConflictException(MENSAJE_FECHA_FUTURA),
      );
      expect(tx.sesion_clase.update).not.toHaveBeenCalled();
    });

    it('la sesión de hoy sí se registra', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({ fecha: aFechaColumna('2026-11-07') }),
      );

      await expect(registrar({})).resolves.toBeDefined();
      expect(tx.sesion_clase.update).toHaveBeenCalled();
    });

    it('una sesión de tipo festivo no se registra con temas hasta cambiarle el tipo', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({ tipo_sesion: TIPO_FESTIVO }),
      );

      await expect(registrar({})).rejects.toThrow(
        new ConflictException(mensajeTipoSinTema('Festivo')),
      );
    });

    it('rechaza temas de otro proyecto o semanas sin tema', async () => {
      await expect(registrar({ idsContenido: [10, 999] })).rejects.toThrow(
        new BadRequestException(MENSAJE_TEMAS_INVALIDOS),
      );
      await expect(registrar({ idsContenido: [12] })).rejects.toThrow(
        new BadRequestException(MENSAJE_TEMAS_INVALIDOS),
      );
    });

    it('conserva una semana que ya estaba registrada aunque luego se vaciara', async () => {
      tx.sesion_clase.findFirst.mockResolvedValue(
        sesionEnTransaccion({ sesion_tema: [{ id_contenido: 12 }] }),
      );

      await expect(registrar({ idsContenido: [12] })).resolves.toBeDefined();
    });

    it('rechaza ausentes que no están matriculados en el curso', async () => {
      await expect(registrar({ ausentes: [101, 999] })).rejects.toThrow(
        new BadRequestException(MENSAJE_AUSENTES_INVALIDOS),
      );
      // Retirado del curso y no marcado antes en esta sesión.
      await expect(registrar({ ausentes: [103] })).rejects.toThrow(
        new BadRequestException(MENSAJE_AUSENTES_INVALIDOS),
      );
    });

    it('marcar a todo el grupo pide confirmación (RF-22, excepción p6)', async () => {
      await expect(registrar({ ausentes: [101, 102] })).rejects.toThrow(
        new ConflictException(MENSAJE_CONFIRMAR_TODO_EL_GRUPO),
      );

      await expect(
        registrar({ ausentes: [101, 102], confirmarTodoElGrupo: true }),
      ).resolves.toBeDefined();
      expect(tx.inasistencia.createMany).toHaveBeenCalledWith({
        data: [
          { id_sesion: 500, id_matricula: 101 },
          { id_sesion: 500, id_matricula: 102 },
        ],
      });
    });

    it('sin lista cargada se registra con observaciones y sin ausentes (RF-22, excepción p3)', async () => {
      tx.matricula.count.mockResolvedValue(0);

      await registrar({ observaciones: 'Faltaron tres estudiantes.' });

      expect(tx.inasistencia.createMany).not.toHaveBeenCalled();
      expect(tx.sesion_clase.update).toHaveBeenCalledWith({
        where: { id: 500 },
        data: expect.objectContaining({
          observaciones: 'Faltaron tres estudiantes.',
        }),
      });
    });

    it('solo registra quien puede: el docente asignado o el administrador', async () => {
      sesiones.tienePermisoEdicion.mockResolvedValue(false);

      await expect(registrar({})).rejects.toThrow(
        new ForbiddenException(MENSAJE_SOLO_QUIEN_REGISTRA),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('responde 404 si no ve el proyecto o la sesión no es de él', async () => {
      sesiones.proyectoVisible.mockRejectedValueOnce(new NotFoundException());
      await expect(registrar({})).rejects.toThrow(NotFoundException);

      tx.sesion_clase.findFirst.mockResolvedValue(null);
      await expect(registrar({})).rejects.toThrow(NotFoundException);
    });

    it('exige el proyecto aprobado o en ejecución y el período abierto (RF-20, precondición)', async () => {
      sesiones.proyectoVisible.mockResolvedValue(
        proyecto({
          estado_proyecto: {
            codigo: 'en_diligenciamiento',
            nombre: 'En diligenciamiento',
          },
        }),
      );
      await expect(registrar({})).rejects.toThrow(
        new ConflictException(MENSAJE_PROYECTO_NO_APROBADO),
      );

      sesiones.proyectoVisible.mockResolvedValue(
        proyecto({
          periodo_academico: { ...proyecto().periodo_academico, cerrado: true },
        }),
      );
      await expect(registrar({})).rejects.toThrow(
        new ConflictException(MENSAJE_PERIODO_CERRADO_REGISTRO),
      );
    });
  });

  describe('detalle', () => {
    it('presenta los temas con el previsto de la semana y la lista del curso', async () => {
      prisma.sesion_clase.findFirst.mockResolvedValue(
        sesionDetalle({
          sesion_tema: [{ id_contenido: 11 }],
          inasistencia: [{ id_matricula: 102 }],
          _count: { sesion_tema: 1, inasistencia: 1 },
          observaciones: 'Taller',
        }),
      );

      const detalle = await servicio.detalle(docente, 99, 500);

      expect(detalle.temas).toEqual([
        {
          idContenido: 10,
          semana: 14,
          tema: 'Tema de la semana 14',
          previsto: true,
          seleccionado: false,
        },
        expect.objectContaining({ idContenido: 11, seleccionado: true }),
        expect.objectContaining({
          idContenido: 12,
          tema: 'Semana 16 (sin tema)',
        }),
      ]);
      expect(detalle).toMatchObject({
        puedeRegistrar: true,
        motivoNoRegistrable: null,
        numeroAusentes: 1,
        observaciones: 'Taller',
        asistencia: {
          listaCargada: true,
          totalMatriculados: 2,
          estudiantes: [
            expect.objectContaining({ idMatricula: 101, ausente: false }),
            expect.objectContaining({ idMatricula: 102, ausente: true }),
          ],
        },
      });
      expect(detalle.sesion).toMatchObject({
        fecha: '2026-11-04',
        horaInicio: '14:00',
        numeroAusentes: 1,
      });
      // La consulta la audita @AuditarConsulta en el controlador, no el servicio.
      expect(auditoria.registrar).not.toHaveBeenCalled();
      expect(parametros.leerEntero).toHaveBeenCalledWith(
        'alerta_dias_anticipacion',
        { minimo: 0, maximo: 365 },
      );
    });

    it('a quien solo consulta no le muestra ausentes ni observaciones (Ley 1581)', async () => {
      sesiones.tienePermisoEdicion.mockResolvedValue(false);
      prisma.sesion_clase.findFirst.mockResolvedValue(
        sesionDetalle({
          inasistencia: [{ id_matricula: 102 }],
          _count: { sesion_tema: 0, inasistencia: 1 },
          observaciones: 'Faltó un estudiante',
        }),
      );

      const detalle = await servicio.detalle(docente, 99, 500);

      expect(detalle).toMatchObject({
        puedeRegistrar: false,
        motivoNoRegistrable: null,
        asistencia: null,
        observaciones: null,
        numeroAusentes: 1,
      });
      expect(prisma.matricula.findMany).not.toHaveBeenCalled();
    });

    it('explica por qué no se puede registrar: fecha futura o sin contenido programático', async () => {
      prisma.sesion_clase.findFirst.mockResolvedValue(
        sesionDetalle({ fecha: aFechaColumna('2026-11-11') }),
      );
      await expect(servicio.detalle(docente, 99, 500)).resolves.toMatchObject({
        puedeRegistrar: false,
        motivoNoRegistrable: MENSAJE_FECHA_FUTURA,
      });

      prisma.sesion_clase.findFirst.mockResolvedValue(sesionDetalle());
      prisma.contenido_programatico.findMany.mockResolvedValue([]);
      await expect(servicio.detalle(docente, 99, 500)).resolves.toMatchObject({
        puedeRegistrar: false,
        motivoNoRegistrable: MENSAJE_SIN_CONTENIDO,
      });
    });

    it('sin lista cargada lo indica para registrar la observación en texto libre', async () => {
      prisma.matricula.findMany.mockResolvedValue([]);
      prisma.matricula.count.mockResolvedValue(0);

      const detalle = await servicio.detalle(docente, 99, 500);

      expect(detalle.asistencia).toEqual({
        listaCargada: false,
        totalMatriculados: 0,
        estudiantes: [],
      });
    });
  });
});
