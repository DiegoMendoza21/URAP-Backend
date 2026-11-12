import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { ParametrosService } from '../common/parametros/parametros.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  NOTIFICACION,
  type NotificacionesService,
} from '../notificaciones/notificaciones.service.js';
import type { AlcanceService } from './alcance.service.js';
import type { EdicionProyectoService } from './edicion-proyecto.service.js';
import {
  MENSAJE_FUERA_DE_ALCANCE,
  MENSAJE_OBSERVACION_NO_EXISTE,
  MENSAJE_OBSERVACIONES_SOLO_DEVUELTO,
  MENSAJE_PERIODO_CERRADO_ENVIO,
  MENSAJE_PROYECTO_PROPIO,
  MENSAJE_SECCIONES_INCOMPLETAS,
  MENSAJE_SOLO_RESPONSABLE,
  mensajeNoEnviable,
  mensajeNoRevisable,
  MOTIVO_PROYECTO_PROPIO,
  RevisionService,
} from './revision.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
function usuario(id: number, roles: string[]): UsuarioSesion {
  return {
    id,
    nombres: 'Usuario',
    apellidos: 'De Prueba',
    correo: `usuario.${id}@urap.local`,
    roles,
    jti: `jti-${id}`,
    idSesion: id,
    asignaciones: [],
    permisos: [],
  };
}
const responsable = usuario(20, [ROL.docente]);
const codocente = usuario(21, [ROL.docente]);
const revisor = usuario(30, [ROL.departamento]);
// Del Departamento y, a la vez, docentes del proyecto 7: el responsable y el codocente.
const revisorResponsable = usuario(20, [ROL.docente, ROL.departamento]);
const revisorCodocente = usuario(21, [ROL.docente, ROL.departamento]);

const ESTADOS: Record<string, { id: number; codigo: string; nombre: string }> =
  {
    en_diligenciamiento: {
      id: 1,
      codigo: 'en_diligenciamiento',
      nombre: 'En diligenciamiento',
    },
    enviado: { id: 2, codigo: 'enviado', nombre: 'Enviado a revisión' },
    devuelto: {
      id: 3,
      codigo: 'devuelto',
      nombre: 'Devuelto con observaciones',
    },
    aprobado: { id: 4, codigo: 'aprobado', nombre: 'Aprobado' },
  };

const COMPLETO = {
  descripcion: 'Descripción',
  proyecto_docente_rap: [{ rap: { id: 1, codigo: 'RAP 1', numero: 1 } }],
  rac: [
    {
      codigo: 'RAC 1',
      rac_rap: [{ id_rap: 1 }],
      _count: { evaluacion_rac: 1 },
    },
  ],
  periodo_academico: { numero_semanas: 1 },
  contenido_programatico: [{ semana: 1, tema: 'Tema' }],
  _count: { estrategia_metodologica: 1, bibliografia: 1 },
};
const VACIO = {
  ...COMPLETO,
  descripcion: null,
  _count: { estrategia_metodologica: 0, bibliografia: 1 },
};

function proyecto({
  estado = 'en_diligenciamiento',
  cerrado = false,
  responsableActivo = true,
} = {}) {
  return {
    id: 7,
    id_estado: ESTADOS[estado].id,
    grupo: 'A',
    estado_proyecto: ESTADOS[estado],
    periodo_academico: { codigo: '2026-2', cerrado },
    asignatura: {
      nombre: 'Asignatura ficticia',
      plan_estudio: { id_programa: 1 },
    },
    proyecto_docente_docente: [
      {
        id_usuario: 20,
        responsable: true,
        usuario: {
          activo: responsableActivo,
          nombres: 'Ana',
          apellidos: 'Prueba',
        },
      },
      {
        id_usuario: 21,
        responsable: false,
        usuario: { activo: true, nombres: 'Luis', apellidos: 'Prueba' },
      },
    ],
  };
}

/** Una fila de la bandeja (`INCLUIR_RESUMEN`) con sus docentes; el primero es el responsable. */
function pendiente(id: number, docentes: number[]) {
  return {
    id,
    grupo: 'A',
    fecha_creacion: null,
    fecha_envio: new Date('2026-11-08T15:00:00.000Z'),
    asignatura: null,
    periodo_academico: null,
    estado_proyecto: ESTADOS.enviado,
    proyecto_docente_docente: docentes.map((idUsuario, indice) => ({
      id_usuario: idUsuario,
      responsable: indice === 0,
      orden: indice + 1,
      usuario: { id: idUsuario, nombres: 'Docente', apellidos: 'Ficticio' },
    })),
  };
}

function crear({
  actual = proyecto(),
  completitud = COMPLETO as object,
  alcance = { global: false, programas: [1] },
  devolucion = null as object | null,
  // RF-18: `revision_bloquear_autoaprobacion` tal como lo siembran los datos base.
  parametro = { valor: 'si' } as { valor: string | null } | null,
  pendientes = [] as object[],
} = {}) {
  const proyectoDocente = {
    // Mismo método para tres lecturas: se distinguen por lo que piden.
    findUniqueOrThrow: vi.fn(
      (args: { select?: Record<string, unknown>; include?: unknown }) => {
        if (args.select && 'descripcion' in args.select) {
          return Promise.resolve(completitud);
        }
        if (args.select && 'asignatura' in args.select) {
          return Promise.resolve({ asignatura: actual.asignatura });
        }
        return Promise.resolve(actual);
      },
    ),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(pendientes.length),
    findMany: vi.fn().mockResolvedValue(pendientes),
  };
  const revisionProyecto = {
    create: vi.fn().mockResolvedValue({ id: 90 }),
    findFirst: vi.fn().mockResolvedValue(devolucion),
  };
  const observacionRevision = {
    update: vi.fn((args: { where: { id: number }; data: object }) =>
      Promise.resolve({
        id: args.where.id,
        seccion: 'rac',
        observacion: 'Texto',
        ...args.data,
      }),
    ),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    proyecto_docente: proyectoDocente,
    revision_proyecto: revisionProyecto,
    observacion_revision: observacionRevision,
  };
  const prisma = {
    ...tx,
    estado_proyecto: {
      findUnique: vi.fn((args: { where: { codigo: string } }) =>
        Promise.resolve(ESTADOS[args.where.codigo] ?? null),
      ),
    },
    parametro_sistema: { findUnique: vi.fn().mockResolvedValue(parametro) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const edicion = {
    consultable: vi.fn().mockResolvedValue(actual),
    esDocenteAsignado: vi.fn((u: UsuarioSesion) => u.id === 20 || u.id === 21),
  };
  const alcanceServicio = {
    alcanceConPermiso: vi.fn().mockResolvedValue(alcance),
  };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const notificaciones = {
    notificar: vi.fn().mockResolvedValue(undefined),
    usuariosConPermiso: vi.fn().mockResolvedValue([30, 31]),
  };
  const servicio = new RevisionService(
    prisma as unknown as PrismaService,
    edicion as unknown as EdicionProyectoService,
    alcanceServicio as unknown as AlcanceService,
    auditoria as unknown as AuditoriaService,
    notificaciones as unknown as NotificacionesService,
    // El lector real: las pruebas cubren también cómo interpreta el parámetro.
    new ParametrosService(prisma as unknown as PrismaService),
  );
  return { servicio, prisma, tx, auditoria, notificaciones };
}

describe('RevisionService', () => {
  describe('envío a revisión (RF-17)', () => {
    it('lo envía, deja el evento «elaboró», audita y avisa a quien revisa', async () => {
      const { servicio, tx, auditoria, notificaciones } = crear();

      const respuesta = await servicio.enviar(responsable, 7);

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.proyecto_docente.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { id_estado: 2, fecha_envio: expect.any(Date) },
      });
      expect(tx.revision_proyecto.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id_usuario: 20,
          tipo: 'elaboracion',
          resultado: 'enviado',
          id_estado_anterior: 1,
          id_estado_nuevo: 2,
        }),
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'actualizar',
          tablaAfectada: 'proyecto_docente',
          valorAnterior: { estado: 'en_diligenciamiento' },
        }),
      );
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: NOTIFICACION.proyectoEnviado,
          destinatarios: [30, 31],
          urlDestino: '/proyectos-docentes/7/revision',
        }),
      );
      expect(respuesta.idProyecto).toBe(7);
    });

    it('no avisa a los docentes del proyecto que revisan, con la separación de funciones encendida', async () => {
      const { servicio, notificaciones } = crear();
      // El codocente 21 es también del Departamento: no puede revisar este proyecto.
      notificaciones.usuariosConPermiso.mockResolvedValue([21, 30, 31]);

      await servicio.enviar(responsable, 7);

      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: NOTIFICACION.proyectoEnviado,
          destinatarios: [30, 31],
        }),
      );
    });

    it('sí avisa al codocente que revisa cuando la separación de funciones está apagada', async () => {
      const { servicio, notificaciones } = crear({
        parametro: { valor: 'no' },
      });
      notificaciones.usuariosConPermiso.mockResolvedValue([20, 21, 30]);

      await servicio.enviar(responsable, 7);

      // Quien envía nunca se avisa a sí mismo.
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: NOTIFICACION.proyectoEnviado,
          destinatarios: [21, 30],
        }),
      );
    });

    it('no lo envía con secciones incompletas y lista los pendientes (excepción de p2)', async () => {
      const { servicio, tx } = crear({ completitud: VACIO });

      const error = await servicio
        .enviar(responsable, 7)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        mensaje: MENSAJE_SECCIONES_INCOMPLETAS,
        detalles: [
          'Punto 2 · Descripción: Redacte la descripción del curso.',
          'Punto 4 · Estrategias metodológicas: Registre al menos una estrategia metodológica.',
        ],
      });
      expect(tx.proyecto_docente.update).not.toHaveBeenCalled();
    });

    it('solo lo envía el docente responsable (precondición)', async () => {
      const { servicio } = crear();
      await expect(servicio.enviar(codocente, 7)).rejects.toThrow(
        new ForbiddenException(MENSAJE_SOLO_RESPONSABLE),
      );
    });

    it('un período cerrado lo impide (excepción de p4)', async () => {
      const { servicio } = crear({ actual: proyecto({ cerrado: true }) });
      await expect(servicio.enviar(responsable, 7)).rejects.toThrow(
        new ConflictException(MENSAJE_PERIODO_CERRADO_ENVIO),
      );
    });

    it('solo se envía en diligenciamiento o devuelto', async () => {
      const { servicio } = crear({ actual: proyecto({ estado: 'aprobado' }) });
      await expect(servicio.enviar(responsable, 7)).rejects.toThrow(
        new ConflictException(mensajeNoEnviable('Aprobado')),
      );
    });

    it('la verificación advierte las observaciones sin resolver, pero deja enviar', async () => {
      const { servicio } = crear({
        actual: proyecto({ estado: 'devuelto' }),
        devolucion: {
          observacion_revision: [
            { id: 1, resuelta: true },
            { id: 2, resuelta: false },
          ],
        },
      });
      await expect(
        servicio.verificarEnvio(responsable, 7),
      ).resolves.toMatchObject({
        puedeEnviar: true,
        motivo: null,
        observacionesSinResolver: 1,
      });
    });
  });

  describe('aprobación y devolución (RF-18)', () => {
    it('aprueba, audita como «aprobar» y avisa a los docentes activos', async () => {
      const { servicio, tx, auditoria, notificaciones } = crear({
        actual: proyecto({ estado: 'enviado' }),
      });

      await servicio.aprobar(revisor, 7, {});

      expect(tx.proyecto_docente.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { id_estado: 4, fecha_aprobacion: expect.any(Date) },
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'aprobar' }),
      );
      expect(notificaciones.notificar).toHaveBeenCalledTimes(1);
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: NOTIFICACION.proyectoAprobado,
          destinatarios: [20, 21],
        }),
      );
    });

    it('con el responsable inactivo, avisa también a quien revisa (excepción de p5)', async () => {
      const { servicio, notificaciones } = crear({
        actual: proyecto({ estado: 'enviado', responsableActivo: false }),
      });

      await servicio.devolver(revisor, 7, {
        observaciones: [{ seccion: 'rac', observacion: 'Precise el RAC.' }],
      });

      expect(notificaciones.notificar).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ destinatarios: [21] }),
      );
      expect(notificaciones.notificar).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          destinatarios: [30, 31],
          titulo: expect.stringContaining('inactivo'),
          mensaje: expect.stringContaining('devuelto con observaciones'),
        }),
      );
    });

    it('devuelve con las observaciones por sección', async () => {
      const { servicio, tx } = crear({
        actual: proyecto({ estado: 'enviado' }),
      });

      await servicio.devolver(revisor, 7, {
        observacionGeneral: 'General',
        observaciones: [
          { seccion: 'rac', observacion: 'Uno' },
          { seccion: 'bibliografia', observacion: 'Dos' },
        ],
      });

      expect(tx.proyecto_docente.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { id_estado: 3 },
      });
      expect(tx.revision_proyecto.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tipo: 'revision',
          resultado: 'devuelto',
          observacion_general: 'General',
          observacion_revision: {
            create: [
              { seccion: 'rac', observacion: 'Uno', resuelta: false },
              { seccion: 'bibliografia', observacion: 'Dos', resuelta: false },
            ],
          },
        }),
      });
    });

    it('solo revisa proyectos enviados (precondición)', async () => {
      const { servicio } = crear({ actual: proyecto({ estado: 'devuelto' }) });
      await expect(servicio.aprobar(revisor, 7, {})).rejects.toThrow(
        new ConflictException(mensajeNoRevisable('Devuelto con observaciones')),
      );
    });

    it('no revisa proyectos de un programa donde no aprueba', async () => {
      const { servicio } = crear({
        actual: proyecto({ estado: 'enviado' }),
        alcance: { global: false, programas: [2] },
      });
      await expect(servicio.aprobar(revisor, 7, {})).rejects.toThrow(
        new ForbiddenException(MENSAJE_FUERA_DE_ALCANCE),
      );
    });
  });

  describe('separación de funciones (RF-18, revision_bloquear_autoaprobacion)', () => {
    const enviado = () => proyecto({ estado: 'enviado' });
    const devolucion = {
      observaciones: [{ seccion: 'rac', observacion: 'Precise el RAC.' }],
    };
    let registrarError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      registrarError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['el responsable', revisorResponsable],
      ['un codocente', revisorCodocente],
    ])(
      'encendido: %s del proyecto no lo aprueba ni lo devuelve (403)',
      async (_quien, docenteRevisor) => {
        const { servicio, prisma, tx } = crear({ actual: enviado() });

        await expect(servicio.aprobar(docenteRevisor, 7, {})).rejects.toThrow(
          new ForbiddenException(MENSAJE_PROYECTO_PROPIO),
        );
        await expect(
          servicio.devolver(docenteRevisor, 7, devolucion),
        ).rejects.toThrow(new ForbiddenException(MENSAJE_PROYECTO_PROPIO));
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(tx.proyecto_docente.update).not.toHaveBeenCalled();
        expect(registrarError).not.toHaveBeenCalled();
      },
    );

    it('encendido: otra persona del Departamento sí lo aprueba, sin leer el parámetro', async () => {
      const { servicio, prisma } = crear({ actual: enviado() });

      await expect(servicio.aprobar(revisor, 7, {})).resolves.toMatchObject({
        idProyecto: 7,
      });
      expect(prisma.parametro_sistema.findUnique).not.toHaveBeenCalled();
    });

    it.each(['no', ' NO '])(
      'apagado («%s»): el docente del proyecto lo aprueba y lo devuelve como antes',
      async (valor) => {
        const aprobar = crear({ actual: enviado(), parametro: { valor } });
        await expect(
          aprobar.servicio.aprobar(revisorCodocente, 7, {}),
        ).resolves.toMatchObject({ idProyecto: 7 });
        expect(aprobar.tx.revision_proyecto.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            id_usuario: 21,
            tipo: 'aprobacion',
          }),
        });

        const devolver = crear({ actual: enviado(), parametro: { valor } });
        await expect(
          devolver.servicio.devolver(revisorResponsable, 7, devolucion),
        ).resolves.toMatchObject({ idProyecto: 7 });
        expect(registrarError).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['falta', null],
      ['no tiene valor', { valor: null }],
      ['tiene un valor inválido', { valor: 'quizás' }],
    ])(
      'si el parámetro %s, se aplica la regla y queda en el registro técnico',
      async (_caso, parametro) => {
        const { servicio } = crear({ actual: enviado(), parametro });

        await expect(servicio.aprobar(revisorCodocente, 7, {})).rejects.toThrow(
          new ForbiddenException(MENSAJE_PROYECTO_PROPIO),
        );
        expect(registrarError).toHaveBeenCalledWith(
          expect.stringContaining('revision_bloquear_autoaprobacion'),
        );
      },
    );

    it('acepta «Sí» con tilde y mayúscula como encendido', async () => {
      const { servicio } = crear({
        actual: enviado(),
        parametro: { valor: 'Sí' },
      });
      await expect(servicio.aprobar(revisorCodocente, 7, {})).rejects.toThrow(
        new ForbiddenException(MENSAJE_PROYECTO_PROPIO),
      );
      expect(registrarError).not.toHaveBeenCalled();
    });

    it('la bandeja muestra los propios con el aviso y deja revisar los demás', async () => {
      const { servicio } = crear({
        pendientes: [pendiente(7, [20, 21]), pendiente(8, [40])],
      });

      const pagina = await servicio.pendientes(revisorCodocente, {
        pagina: 1,
        tamano: 20,
      });

      expect(pagina.total).toBe(2);
      expect(pagina.elementos).toEqual([
        expect.objectContaining({
          id: 7,
          puedeRevisar: false,
          motivo: MOTIVO_PROYECTO_PROPIO,
          fechaEnvio: '2026-11-08T15:00:00.000Z',
        }),
        expect.objectContaining({ id: 8, puedeRevisar: true, motivo: null }),
      ]);
    });

    it('apagado: la bandeja deja revisar también los propios', async () => {
      const { servicio } = crear({
        parametro: { valor: 'no' },
        pendientes: [pendiente(7, [20, 21])],
      });

      const pagina = await servicio.pendientes(revisorCodocente, {
        pagina: 1,
        tamano: 20,
      });

      expect(pagina.elementos).toEqual([
        expect.objectContaining({ id: 7, puedeRevisar: true, motivo: null }),
      ]);
    });

    describe('verificación de la pantalla de revisión', () => {
      it('puede revisar: enviado y no es docente del proyecto', async () => {
        const { servicio } = crear({ actual: enviado() });
        await expect(servicio.verificarRevision(revisor, 7)).resolves.toEqual({
          idProyecto: 7,
          estado: { codigo: 'enviado', nombre: 'Enviado a revisión' },
          puedeRevisar: true,
          motivo: null,
        });
      });

      it('no puede: es docente del proyecto con la regla encendida', async () => {
        const { servicio } = crear({ actual: enviado() });
        await expect(
          servicio.verificarRevision(revisorCodocente, 7),
        ).resolves.toEqual({
          idProyecto: 7,
          estado: { codigo: 'enviado', nombre: 'Enviado a revisión' },
          puedeRevisar: false,
          motivo: MOTIVO_PROYECTO_PROPIO,
        });
      });

      it('con la regla apagada, el docente del proyecto puede', async () => {
        const { servicio } = crear({
          actual: enviado(),
          parametro: { valor: 'no' },
        });
        await expect(
          servicio.verificarRevision(revisorCodocente, 7),
        ).resolves.toMatchObject({ puedeRevisar: true, motivo: null });
      });

      it('no puede: el proyecto no está enviado a revisión', async () => {
        const { servicio } = crear({
          actual: proyecto({ estado: 'devuelto' }),
        });
        await expect(
          servicio.verificarRevision(revisor, 7),
        ).resolves.toMatchObject({
          puedeRevisar: false,
          motivo: mensajeNoRevisable('Devuelto con observaciones'),
        });
      });

      it('si fallan las dos, el motivo es el de la aprobación: primero el proyecto propio', async () => {
        const { servicio } = crear({
          actual: proyecto({ estado: 'devuelto' }),
        });
        await expect(
          servicio.verificarRevision(revisorResponsable, 7),
        ).resolves.toMatchObject({
          puedeRevisar: false,
          motivo: MOTIVO_PROYECTO_PROPIO,
        });
      });

      it('fuera de su programa responde 403, como la aprobación, sin revelar el estado', async () => {
        const { servicio, prisma } = crear({
          actual: enviado(),
          alcance: { global: false, programas: [2] },
        });
        await expect(
          servicio.verificarRevision(revisorCodocente, 7),
        ).rejects.toThrow(new ForbiddenException(MENSAJE_FUERA_DE_ALCANCE));
        expect(prisma.parametro_sistema.findUnique).not.toHaveBeenCalled();
      });
    });
  });

  describe('observaciones (HU-07-05)', () => {
    const devolucion = {
      id: 9,
      observacion_revision: [
        { id: 1, seccion: 'rac', observacion: 'Uno', resuelta: false },
      ],
    };

    it('marca una observación de la última devolución y lo audita', async () => {
      const { servicio, auditoria } = crear({
        actual: proyecto({ estado: 'devuelto' }),
        devolucion,
      });
      await expect(
        servicio.marcarObservacion(codocente, 7, 1, { resuelta: true }),
      ).resolves.toMatchObject({ id: 1, resuelta: true, numeroSeccion: 3 });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          tablaAfectada: 'observacion_revision',
          valorAnterior: { resuelta: false },
          valorNuevo: { resuelta: true },
        }),
      );
    });

    it('marcar lo mismo otra vez no deja rastro en la auditoría', async () => {
      const { servicio, tx, auditoria } = crear({
        actual: proyecto({ estado: 'devuelto' }),
        devolucion,
      });
      await servicio.marcarObservacion(codocente, 7, 1, { resuelta: false });
      expect(tx.observacion_revision.update).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('rechaza una observación ajena a la última devolución', async () => {
      const { servicio } = crear({
        actual: proyecto({ estado: 'devuelto' }),
        devolucion,
      });
      await expect(
        servicio.marcarObservacion(codocente, 7, 99, { resuelta: true }),
      ).rejects.toThrow(new NotFoundException(MENSAJE_OBSERVACION_NO_EXISTE));
    });

    it('solo se marcan mientras el proyecto está devuelto', async () => {
      const { servicio } = crear({
        actual: proyecto({ estado: 'enviado' }),
        devolucion,
      });
      await expect(
        servicio.marcarObservacion(codocente, 7, 1, { resuelta: true }),
      ).rejects.toThrow(
        new ConflictException(MENSAJE_OBSERVACIONES_SOLO_DEVUELTO),
      );
    });

    it('solo las marca un docente asignado', async () => {
      const { servicio } = crear({
        actual: proyecto({ estado: 'devuelto' }),
        devolucion,
      });
      await expect(
        servicio.marcarObservacion(revisor, 7, 1, { resuelta: true }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
