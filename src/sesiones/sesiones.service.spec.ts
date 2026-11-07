import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
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
  mensajeSemanasDeMas,
  mensajeSinFestivos,
  SesionesService,
} from './sesiones.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas. `idSesion` llega con
// HU-01-04 (#6); con la aserción, el objeto sirve antes y después de integrarla.
const docente = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
  idSesion: 20,
} as UsuarioSesion;
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
    descripcion: null,
    observaciones: null,
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
      updateMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const prisma = {
    proyecto_docente: { findFirst: vi.fn(), findMany: vi.fn() },
    sesion_clase: { findMany: vi.fn() },
    proyecto_docente_docente: { findFirst: vi.fn() },
    dia_festivo: { findMany: vi.fn() },
    tipo_sesion: { findMany: vi.fn() },
    tipo_notificacion: { findUnique: vi.fn() },
    usuario: { findMany: vi.fn() },
    notificacion: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(
      (trabajo: (cliente: typeof tx) => unknown, _opciones?: unknown) =>
        trabajo(tx),
    ),
  };
  const alcance = { alcanzaPrograma: vi.fn() };
  const proyectos = { filtroVisibilidad: vi.fn() };
  const parametros = { leerEntero: vi.fn() };
  const auditoria = { registrar: vi.fn() };
  const servicio = new SesionesService(
    prisma as unknown as PrismaService,
    alcance as unknown as AlcanceService,
    proyectos as unknown as ProyectosDocentesService,
    parametros as unknown as ParametrosService,
    auditoria as unknown as AuditoriaService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    proyectos.filtroVisibilidad.mockResolvedValue({});
    // Umbral de «Por vencer» del parámetro alerta_dias_anticipacion (seed: 2 días).
    parametros.leerEntero.mockResolvedValue(2);
    prisma.proyecto_docente.findFirst.mockResolvedValue(proyecto());
    prisma.proyecto_docente_docente.findFirst.mockResolvedValue({
      id_usuario: docente.id,
    });
    alcance.alcanzaPrograma.mockResolvedValue(false);
    prisma.tipo_sesion.findMany.mockResolvedValue([TIPO_CLASE, TIPO_FESTIVO]);
    // El 2026 tiene festivos; el 10 de agosto no lo es, pero se simula como tal.
    prisma.dia_festivo.findMany.mockResolvedValue([
      {
        id: 50,
        fecha: aFechaColumna('2026-08-10'),
        nombre: 'Festivo de prueba',
      },
    ]);
    auditoria.registrar.mockResolvedValue(undefined);
    tx.sesion_clase.findMany.mockResolvedValue([]);
    tx.sesion_clase.count.mockResolvedValue(3);
    // El horario vigente que la generación lee después del bloqueo: solo lunes.
    tx.horario_curso.findMany.mockResolvedValue([{ dia_semana: 1 }]);
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
      // RF-29 con AuditoriaService: después de confirmar y solo con lo que cambió.
      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'proyecto_docente',
        idRegistro: 99,
        valorAnterior: {
          horario: [{ diaSemana: 1, horaInicio: '07:00', horaFin: '09:00' }],
        },
        valorNuevo: { horario: expect.any(Array) },
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
      prisma.proyecto_docente.findFirst.mockResolvedValue(null);

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
      prisma.proyecto_docente.findFirst.mockResolvedValue(
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

      // Borrado lógico: se inactiva, no se elimina.
      expect(tx.sesion_clase.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
        data: { estado: 'retirada' },
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

    it('conserva una sesión sin diligenciar que tiene descripción (RF-21)', async () => {
      tx.sesion_clase.findMany.mockResolvedValue([
        sesion(6, '2026-08-05', {
          id_tipo_sesion: TIPO_FESTIVO.id,
          descripcion: 'Jornada sin clase',
        }),
      ]);

      const resultado = await servicio.generarCalendario(docente, 99);

      expect(tx.sesion_clase.update).not.toHaveBeenCalled();
      expect(tx.sesion_clase.updateMany).not.toHaveBeenCalled();
      expect(resultado).toMatchObject({ conservadas: 1, retiradas: 0 });
    });

    it('reactiva una sesión retirada si vuelve a caer en el horario', async () => {
      tx.sesion_clase.findMany.mockResolvedValue([
        sesion(7, '2026-08-17', { estado: 'retirada', semana: 3 }),
        // Retirada que sigue fuera del horario: no se cuenta ni se toca.
        sesion(8, '2026-08-19', { estado: 'retirada', dia_semana: 3 }),
      ]);

      const resultado = await servicio.generarCalendario(docente, 99);

      expect(tx.sesion_clase.update).toHaveBeenCalledTimes(1);
      expect(tx.sesion_clase.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: expect.objectContaining({ estado: 'programada', semana: 3 }),
      });
      const { data } = tx.sesion_clase.createMany.mock.calls[0][0];
      expect(data.map((fila: { fecha: Date }) => fila.fecha)).toEqual([
        aFechaColumna('2026-08-03'),
        aFechaColumna('2026-08-10'),
      ]);
      expect(resultado).toMatchObject({ creadas: 3, conservadas: 0 });
    });

    it('usa el horario vigente al momento del bloqueo', async () => {
      // El proyecto se leyó con lunes, pero dentro del bloqueo el horario ya es el martes.
      tx.horario_curso.findMany.mockResolvedValue([{ dia_semana: 2 }]);

      await servicio.generarCalendario(docente, 99);

      const { data } = tx.sesion_clase.createMany.mock.calls[0][0];
      expect(
        data.map((fila: { dia_semana: number }) => fila.dia_semana),
      ).toEqual([2, 2, 2]);
    });

    it('salta la semana de receso y la siguiente toma su número (Acuerdo 46)', async () => {
      // Del 10 al 15 de agosto, de lunes a sábado, todo en la tabla de festivos.
      const receso = [10, 11, 12, 13, 14, 15].map((dia) => ({
        id: 60 + dia,
        fecha: aFechaColumna(`2026-08-${dia}`),
        nombre: 'Receso de prueba',
      }));
      prisma.dia_festivo.findMany.mockResolvedValue(receso);

      const resultado = await servicio.generarCalendario(docente, 99);

      const { data } = tx.sesion_clase.createMany.mock.calls[0][0];
      expect(
        data.map((fila: { fecha: Date; semana: number }) => [
          fila.fecha,
          fila.semana,
        ]),
      ).toEqual([
        [aFechaColumna('2026-08-03'), 1],
        [aFechaColumna('2026-08-17'), 2],
      ]);
      expect(resultado.creadas).toBe(2);
      // Los festivos se buscan de lunes a sábado de las semanas que toca el período.
      expect(prisma.dia_festivo.findMany).toHaveBeenCalledWith({
        where: {
          fecha: {
            gte: aFechaColumna('2026-08-03'),
            lte: aFechaColumna('2026-08-22'),
          },
        },
      });
    });

    it('avisa si el número de semanas deja semanas por fuera', async () => {
      // Tres semanas calendario, pero el período dice dos y no hay receso cargado.
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({
          periodo_academico: {
            ...proyecto().periodo_academico,
            numero_semanas: 2,
          },
        }),
      );

      const resultado = await servicio.generarCalendario(docente, 99);

      expect(resultado.creadas).toBe(2);
      expect(resultado.advertencias).toEqual([mensajeSemanasDeMas(3, 2)]);
    });

    it('audita la generación con lo que cambió en el calendario', async () => {
      await servicio.generarCalendario(docente, 99);

      expect(auditoria.registrar).toHaveBeenCalledWith({
        accion: 'actualizar',
        tablaAfectada: 'proyecto_docente',
        idRegistro: 99,
        valorNuevo: {
          calendario: { creadas: 3, actualizadas: 0, retiradas: 0 },
        },
      });
    });

    it('no audita si el calendario quedó igual', async () => {
      tx.sesion_clase.findMany.mockResolvedValue([
        sesion(1, '2026-08-03'),
        sesion(2, '2026-08-10', {
          semana: 2,
          id_tipo_sesion: TIPO_FESTIVO.id,
          id_dia_festivo: 50,
        }),
        sesion(3, '2026-08-17', { semana: 3 }),
      ]);

      const resultado = await servicio.generarCalendario(docente, 99);

      expect(resultado).toMatchObject({
        creadas: 0,
        actualizadas: 0,
        retiradas: 0,
      });
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('exige el horario del curso (precondición)', async () => {
      tx.horario_curso.findMany.mockResolvedValue([]);

      await expect(servicio.generarCalendario(docente, 99)).rejects.toThrow(
        new ConflictException(MENSAJE_SIN_HORARIO),
      );
    });

    it('exige las fechas del período (precondición)', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
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

  describe('alertas del calendario (RF-23)', () => {
    /** Fila de `sesion_clase` como la devuelve Prisma, con su tipo y su festivo. */
    function fila(
      id: number,
      fecha: string,
      cambios: Record<string, unknown> = {},
    ) {
      return {
        ...sesion(id, fecha),
        tipo_sesion: TIPO_CLASE,
        dia_festivo: null,
        ...cambios,
      };
    }

    beforeEach(() => {
      // Sábado 7 de noviembre de 2026, 10 a. m. en Bogotá.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({
          periodo_academico: {
            ...proyecto().periodo_academico,
            fecha_fin: aFechaColumna('2026-11-21'),
          },
        }),
      );
      prisma.sesion_clase.findMany.mockResolvedValue([
        fila(1, '2026-11-02', {
          tipo_sesion: TIPO_FESTIVO,
          dia_festivo: { nombre: 'Todos los Santos' },
        }),
        fila(2, '2026-11-04'),
        fila(3, '2026-11-05', {
          estado: 'registrada',
          fecha_registro: new Date(),
          id_registrado_por: 20,
        }),
        fila(4, '2026-11-09'),
        fila(5, '2026-11-11'),
      ]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('marca vencidas, por vencer y el resumen, sin contar festivos ni diligenciadas', async () => {
      const calendario = await servicio.consultarCalendario(departamento, 99, {
        pagina: 1,
        tamano: 100,
      });

      expect(
        calendario.elementos.map(
          ({ fecha, alerta, diasAtraso, diasRestantes }) => [
            fecha,
            alerta,
            diasAtraso,
            diasRestantes,
          ],
        ),
      ).toEqual([
        ['2026-11-02', null, null, null],
        ['2026-11-04', 'vencida', 3, null],
        ['2026-11-05', null, null, null],
        ['2026-11-09', 'por_vencer', null, 2],
        ['2026-11-11', null, null, null],
      ]);
      expect(calendario).toMatchObject({
        hoy: '2026-11-07',
        umbralDias: 2,
        total: 5,
        resumen: { vencidas: 1, porVencer: 1, incumplidas: 0, mayorAtraso: 3 },
      });
      expect(parametros.leerEntero).toHaveBeenCalledWith(
        'alerta_dias_anticipacion',
        { minimo: 0, maximo: 365 },
      );
    });

    it('con el período cerrado, la vencida queda incumplida y sin por vencer (excepción p4)', async () => {
      prisma.proyecto_docente.findFirst.mockResolvedValue(
        proyecto({
          periodo_academico: {
            ...proyecto().periodo_academico,
            fecha_fin: aFechaColumna('2026-11-21'),
            cerrado: true,
          },
        }),
      );

      const calendario = await servicio.consultarCalendario(departamento, 99, {
        pagina: 1,
        tamano: 100,
      });

      expect(calendario.resumen).toEqual({
        vencidas: 0,
        porVencer: 0,
        incumplidas: 1,
        mayorAtraso: null,
      });
      expect(calendario.elementos[1]).toMatchObject({
        alerta: 'incumplida',
        diasAtraso: 3,
      });
    });

    it('sin el parámetro del umbral no marca por vencer', async () => {
      parametros.leerEntero.mockResolvedValue(null);

      const calendario = await servicio.consultarCalendario(departamento, 99, {
        pagina: 1,
        tamano: 100,
      });

      expect(calendario.umbralDias).toBeNull();
      expect(calendario.resumen).toMatchObject({ vencidas: 1, porVencer: 0 });
    });
  });

  describe('pendientesDelDocente (RF-23, p5)', () => {
    const periodoAbierto = {
      codigo: '2026-2',
      fecha_fin: aFechaColumna('2026-11-21'),
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
      prisma.proyecto_docente.findMany.mockResolvedValue([
        {
          id: 98,
          grupo: null,
          asignatura: {
            nombre: 'Gestión de la calidad',
            codigo_interno: 'DEMO-04',
          },
          periodo_academico: periodoAbierto,
        },
        {
          id: 99,
          grupo: 'A',
          asignatura: {
            nombre: 'Investigación de operaciones',
            codigo_interno: 'DEMO-03',
          },
          periodo_academico: periodoAbierto,
        },
        {
          id: 97,
          grupo: null,
          asignatura: {
            nombre: 'Finanzas a corto plazo',
            codigo_interno: 'DEMO-01',
          },
          periodo_academico: periodoAbierto,
        },
      ]);
      prisma.sesion_clase.findMany.mockResolvedValue([
        {
          ...sesion(1, '2026-10-30'),
          id_proyecto_docente: 99,
          tipo_sesion: TIPO_CLASE,
        },
        {
          ...sesion(2, '2026-11-04'),
          id_proyecto_docente: 99,
          tipo_sesion: TIPO_CLASE,
        },
        {
          ...sesion(3, '2026-11-02'),
          id_proyecto_docente: 99,
          tipo_sesion: TIPO_FESTIVO,
        },
        {
          ...sesion(4, '2026-11-08'),
          id_proyecto_docente: 98,
          tipo_sesion: TIPO_CLASE,
        },
        {
          ...sesion(5, '2026-11-03', {
            estado: 'registrada',
            fecha_registro: new Date(),
          }),
          id_proyecto_docente: 97,
          tipo_sesion: TIPO_CLASE,
        },
      ]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cuenta vencidas y por vencer de sus proyectos, los más atrasados primero', async () => {
      const pendientes = await servicio.pendientesDelDocente(docente, {
        pagina: 1,
        tamano: 20,
      });

      expect(pendientes).toMatchObject({
        hoy: '2026-11-07',
        umbralDias: 2,
        vencidas: 2,
        porVencer: 1,
        total: 2,
      });
      expect(pendientes.elementos).toEqual([
        {
          idProyectoDocente: 99,
          asignatura: 'Investigación de operaciones',
          codigoAsignatura: 'DEMO-03',
          grupo: 'A',
          periodo: '2026-2',
          vencidas: 2,
          porVencer: 0,
          mayorAtraso: 8,
        },
        expect.objectContaining({
          idProyectoDocente: 98,
          vencidas: 0,
          porVencer: 1,
        }),
      ]);
      // Solo sus proyectos, con el período abierto, y las sesiones hasta el final del umbral.
      expect(prisma.proyecto_docente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            proyecto_docente_docente: { some: { id_usuario: docente.id } },
            periodo_academico: {
              is: { OR: [{ cerrado: false }, { cerrado: null }] },
            },
          },
        }),
      );
      const { where } = prisma.sesion_clase.findMany.mock.calls[0][0];
      expect(where.AND).toContainEqual({
        fecha: { lte: aFechaColumna('2026-11-09') },
      });
      expect(where.AND).toContainEqual({
        id_proyecto_docente: { in: [98, 99, 97] },
      });
    });

    it('pagina la lista de proyectos sin cambiar los totales', async () => {
      const pendientes = await servicio.pendientesDelDocente(docente, {
        pagina: 2,
        tamano: 1,
      });

      expect(pendientes).toMatchObject({ vencidas: 2, porVencer: 1, total: 2 });
      expect(pendientes.elementos.map((p) => p.idProyectoDocente)).toEqual([
        98,
      ]);
    });

    it('sin proyectos no consulta sesiones', async () => {
      prisma.proyecto_docente.findMany.mockResolvedValue([]);

      const pendientes = await servicio.pendientesDelDocente(docente, {
        pagina: 1,
        tamano: 20,
      });

      expect(pendientes).toMatchObject({ vencidas: 0, porVencer: 0, total: 0 });
      expect(prisma.sesion_clase.findMany).not.toHaveBeenCalled();
    });
  });
});
