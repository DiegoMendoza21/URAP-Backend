import { ConflictException } from '@nestjs/common';
import type { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  NOTIFICACION,
  type NotificacionesService,
} from '../notificaciones/notificaciones.service.js';
import type { ProyectoConPendientesDto } from './dto/respuestas.dto.js';
import {
  MENSAJE_RECORDATORIOS_EN_CURSO,
  RecordatoriosService,
  recordatorioDe,
} from './recordatorios.service.js';
import type { SesionesService } from './sesiones.service.js';

function proyecto(
  id: number,
  vencidas: number,
  porVencer: number,
  extra: Partial<ProyectoConPendientesDto> = {},
): ProyectoConPendientesDto {
  return {
    idProyectoDocente: id,
    asignatura: `Asignatura ficticia ${id}`,
    codigoAsignatura: null,
    grupo: null,
    periodo: '2026-2',
    vencidas,
    porVencer,
    mayorAtraso: vencidas > 0 ? 3 : null,
    ...extra,
  };
}

// Jueves 12 de noviembre de 2026, 7:00 en Colombia.
const AHORA = new Date('2026-11-12T12:00:00Z');

function crear({
  dias = 7 as number | null,
  porDocente = new Map<number, ProyectoConPendientesDto[]>(),
  tipos = [
    { id: 2, codigo: 'sesion_por_vencer', activo: true },
    { id: 3, codigo: 'sesion_vencida', activo: true },
  ] as { id: number; codigo: string; activo: boolean | null }[],
  recientes = [] as number[],
} = {}) {
  const prisma = {
    tipo_notificacion: { findMany: vi.fn().mockResolvedValue(tipos) },
    notificacion: {
      findMany: vi
        .fn()
        .mockResolvedValue(recientes.map((id) => ({ id_usuario: id }))),
    },
  };
  const sesiones = {
    pendientesPorDocente: vi.fn().mockResolvedValue(porDocente),
  };
  const notificaciones = { notificar: vi.fn().mockResolvedValue(undefined) };
  const parametros = { leerEntero: vi.fn().mockResolvedValue(dias) };
  const servicio = new RecordatoriosService(
    prisma as unknown as PrismaService,
    sesiones as unknown as SesionesService,
    notificaciones as unknown as NotificacionesService,
    parametros as unknown as ParametrosService,
  );
  return { servicio, prisma, sesiones, notificaciones };
}

describe('RecordatoriosService (RF-26, HU-13-02)', () => {
  it('envía un solo aviso por docente, agrupando todos sus cursos', async () => {
    const { servicio, notificaciones } = crear({
      porDocente: new Map([
        [5, [proyecto(10, 2, 1), proyecto(11, 1, 0)]],
        [6, [proyecto(12, 0, 2)]],
      ]),
    });

    const resultado = await servicio.enviar(AHORA);

    expect(resultado).toEqual({
      periodicidadDias: 7,
      docentesConPendientes: 2,
      enviados: 2,
      omitidosPorPeriodicidad: 0,
      omitidosPorTipoInactivo: 0,
    });
    expect(notificaciones.notificar).toHaveBeenCalledTimes(2);
    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: NOTIFICACION.sesionVencida,
        destinatarios: [5],
        urlDestino: '/',
      }),
    );
    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: NOTIFICACION.sesionPorVencer,
        destinatarios: [6],
        urlDestino: '/proyectos-docentes/12/calendario',
      }),
    );
  });

  it('no repite el aviso a quien lo recibió dentro de la periodicidad, contada en días', async () => {
    const { servicio, prisma, notificaciones } = crear({
      porDocente: new Map([
        [5, [proyecto(10, 1, 0)]],
        [6, [proyecto(12, 1, 0)]],
      ]),
      recientes: [5],
    });

    const resultado = await servicio.enviar(AHORA);

    expect(resultado).toMatchObject({
      enviados: 1,
      omitidosPorPeriodicidad: 1,
    });
    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ destinatarios: [6] }),
    );
    // Con 7 días, cuenta desde el viernes 6 a las 0:00 en Colombia: el del jueves 5 ya venció.
    expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_usuario: { in: [5, 6] },
          id_tipo_notificacion: { in: [2, 3] },
          created_at: { gte: new Date('2026-11-06T05:00:00Z') },
        },
      }),
    );
  });

  it('no envía el aviso de un tipo apagado, pero sí el del otro', async () => {
    const { servicio, notificaciones } = crear({
      porDocente: new Map([
        [5, [proyecto(10, 1, 0)]],
        [6, [proyecto(12, 0, 1)]],
      ]),
      tipos: [
        { id: 2, codigo: 'sesion_por_vencer', activo: true },
        { id: 3, codigo: 'sesion_vencida', activo: false },
      ],
    });

    const resultado = await servicio.enviar(AHORA);

    expect(resultado).toMatchObject({
      enviados: 1,
      omitidosPorTipoInactivo: 1,
    });
    expect(notificaciones.notificar).toHaveBeenCalledTimes(1);
    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ destinatarios: [6] }),
    );
  });

  it('sin una periodicidad válida no envía nada', async () => {
    const { servicio, sesiones, notificaciones } = crear({ dias: null });

    const resultado = await servicio.enviar(AHORA);

    expect(resultado).toMatchObject({ periodicidadDias: null, enviados: 0 });
    expect(sesiones.pendientesPorDocente).not.toHaveBeenCalled();
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('sin docentes con pendientes no consulta tipos ni avisos', async () => {
    const { servicio, prisma } = crear();

    const resultado = await servicio.enviar(AHORA);

    expect(resultado).toMatchObject({ docentesConPendientes: 0, enviados: 0 });
    expect(prisma.tipo_notificacion.findMany).not.toHaveBeenCalled();
  });

  it('no deja correr dos envíos a la vez', async () => {
    const { servicio, sesiones } = crear();
    let soltar: (valor: Map<number, ProyectoConPendientesDto[]>) => void = () =>
      undefined;
    sesiones.pendientesPorDocente.mockReturnValue(
      new Promise((resolver) => {
        soltar = resolver;
      }),
    );

    const primero = servicio.enviar(AHORA);
    const segundo = await servicio.enviar(AHORA).catch((e: unknown) => e);
    soltar(new Map());
    await primero;

    expect(segundo).toBeInstanceOf(ConflictException);
    expect((segundo as ConflictException).message).toBe(
      MENSAJE_RECORDATORIOS_EN_CURSO,
    );
    // Terminado el primero, se puede volver a enviar.
    await expect(servicio.enviar(AHORA)).resolves.toBeDefined();
  });

  it('la revisión diaria no lanza si algo falla', async () => {
    const { servicio, sesiones } = crear();
    sesiones.pendientesPorDocente.mockRejectedValue(new Error('sin base'));

    await expect(servicio.revisarDiariamente()).resolves.toBeUndefined();
  });
});

describe('recordatorioDe', () => {
  it('un curso: dice cuántas de cada una y lleva a su calendario', () => {
    expect(recordatorioDe([proyecto(10, 1, 2, { grupo: 'A' })])).toEqual({
      tipo: NOTIFICACION.sesionVencida,
      titulo: 'Tiene sesiones vencidas sin diligenciar',
      mensaje:
        'Tiene 1 sesión vencida sin diligenciar y 2 sesiones por vencer en el curso: ' +
        'Asignatura ficticia 10 (grupo A, 2026-2). Regístrelas en el calendario del curso ' +
        'para no acumular atrasos.',
      entidad: 'proyecto_docente',
      idEntidad: 10,
      urlDestino: '/proyectos-docentes/10/calendario',
    });
  });

  it('varios cursos: nombra los tres primeros, cuenta los demás y lleva al inicio', () => {
    const aviso = recordatorioDe([
      proyecto(10, 0, 1),
      proyecto(11, 0, 1),
      proyecto(12, 0, 1),
      proyecto(13, 0, 1),
      proyecto(14, 0, 1),
    ]);

    expect(aviso).toMatchObject({
      tipo: NOTIFICACION.sesionPorVencer,
      titulo: 'Tiene sesiones por vencer',
      idEntidad: 10,
      urlDestino: '/',
    });
    expect(aviso.mensaje).toBe(
      'Tiene 5 sesiones por vencer en 5 cursos: Asignatura ficticia 10 (2026-2), ' +
        'Asignatura ficticia 11 (2026-2), Asignatura ficticia 12 (2026-2) y 2 cursos más. ' +
        'Regístrelas en el calendario del curso para no acumular atrasos.',
    );
  });
});
