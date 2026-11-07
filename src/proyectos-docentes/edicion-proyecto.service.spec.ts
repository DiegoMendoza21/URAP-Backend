import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import {
  EdicionProyectoService,
  MENSAJE_SOLO_DOCENTES_ASIGNADOS,
  motivoEstadoNoEditable,
  soloCambios,
} from './edicion-proyecto.service.js';
import type { ProyectosDocentesService } from './proyectos-docentes.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const docente: UsuarioSesion = {
  id: 20,
  nombres: 'Docente',
  apellidos: 'De Prueba',
  correo: 'docente.prueba@urap.local',
  roles: [ROL.docente],
  jti: 'jti-20',
  idSesion: 1,
  asignaciones: [],
  permisos: [],
};

const EN_DILIGENCIAMIENTO = {
  codigo: 'en_diligenciamiento',
  nombre: 'En diligenciamiento',
  permite_edicion: true,
};
const APROBADO = {
  codigo: 'aprobado',
  nombre: 'Aprobado',
  permite_edicion: false,
};

function proyecto(
  estado: object | null = EN_DILIGENCIAMIENTO,
  docentes = [20, 21],
) {
  return {
    id: 7,
    estado_proyecto: estado,
    proyecto_docente_docente: docentes.map((id_usuario) => ({ id_usuario })),
    fecha_actualizacion: null,
  };
}

function crear(
  enTransaccion = proyecto(),
  visible: object | null = proyecto(),
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    proyecto_docente: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(enTransaccion),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    proyecto_docente: { findFirst: vi.fn().mockResolvedValue(visible) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const proyectos = {
    filtroVisibilidad: vi.fn().mockResolvedValue({}),
  };
  const servicio = new EdicionProyectoService(
    prisma as unknown as PrismaService,
    proyectos as unknown as ProyectosDocentesService,
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, prisma, tx, auditoria };
}

const cambio = vi.fn(() =>
  Promise.resolve({
    resultado: 'hecho',
    auditoria: {
      accion: 'actualizar' as const,
      tabla: 'proyecto_docente',
      idRegistro: 7,
    },
  }),
);

describe('motivoEstadoNoEditable (RF-11, p4)', () => {
  it('permite editar cuando el catálogo lo dice', () => {
    expect(motivoEstadoNoEditable(EN_DILIGENCIAMIENTO as never)).toBeNull();
  });

  it('en aprobado, en ejecución o cerrado sugiere solicitar la reapertura', () => {
    for (const codigo of ['aprobado', 'en_ejecucion', 'cerrado']) {
      expect(
        motivoEstadoNoEditable({
          ...APROBADO,
          codigo,
        } as never),
      ).toMatch(/solicite su reapertura/);
    }
  });

  it('enviado a revisión no se edita, pero no pide reapertura', () => {
    const motivo = motivoEstadoNoEditable({
      codigo: 'enviado',
      nombre: 'Enviado a revisión',
      permite_edicion: false,
    } as never);
    expect(motivo).toMatch(/lo revisa/);
    expect(motivo).not.toMatch(/reapertura/);
  });

  it('sin estado no se edita', () => {
    expect(motivoEstadoNoEditable(null)).not.toBeNull();
  });
});

describe('EdicionProyectoService.editar', () => {
  beforeEach(() => cambio.mockClear());

  it('guarda, actualiza la fecha de modificación y audita', async () => {
    const { servicio, tx, auditoria } = crear();
    await expect(servicio.editar(docente, 7, cambio)).resolves.toBe('hecho');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(cambio).toHaveBeenCalledWith(tx, expect.any(Date));
    expect(tx.proyecto_docente.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { fecha_actualizacion: expect.any(Date) },
    });
    // El usuario y la IP los pone AuditoriaService desde el contexto de la petición.
    expect(auditoria.registrar).toHaveBeenCalledWith({
      accion: 'actualizar',
      tablaAfectada: 'proyecto_docente',
      idRegistro: 7,
      valorAnterior: undefined,
      valorNuevo: undefined,
    });
  });

  it('responde 404 si el usuario no ve el proyecto', async () => {
    const { servicio } = crear(proyecto(), null);
    await expect(servicio.editar(docente, 7, cambio)).rejects.toThrow(
      NotFoundException,
    );
    expect(cambio).not.toHaveBeenCalled();
  });

  it('solo editan los docentes asignados (alcance «propios»)', async () => {
    const { servicio } = crear(
      proyecto(EN_DILIGENCIAMIENTO, [21]),
      proyecto(EN_DILIGENCIAMIENTO, [21]),
    );
    await expect(servicio.editar(docente, 7, cambio)).rejects.toThrow(
      new ForbiddenException(MENSAJE_SOLO_DOCENTES_ASIGNADOS),
    );
  });

  it('no basta estar asignado: hace falta el rol Docente vigente', async () => {
    const { servicio } = crear();
    const sinRol = { ...docente, roles: [ROL.liderRap] };
    await expect(servicio.editar(sinRol, 7, cambio)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('vuelve a mirar el estado con la fila bloqueada', async () => {
    const { servicio, auditoria } = crear(proyecto(APROBADO), proyecto());
    await expect(servicio.editar(docente, 7, cambio)).rejects.toThrow(
      ConflictException,
    );
    expect(cambio).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('sin cambios tampoco mueve la fecha de modificación', async () => {
    const { servicio, tx } = crear();
    const sinCambios = vi.fn(() =>
      Promise.resolve({ resultado: 'igual', auditoria: null }),
    );
    await servicio.editar(docente, 7, sinCambios);
    expect(tx.proyecto_docente.update).not.toHaveBeenCalled();
  });

  it('sin cambios que auditar, no registra nada', async () => {
    const { servicio, auditoria } = crear();
    const sinCambios = vi.fn(() =>
      Promise.resolve({ resultado: 'igual', auditoria: null }),
    );
    await expect(servicio.editar(docente, 7, sinCambios)).resolves.toBe(
      'igual',
    );
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('sin cambios tampoco mueve la fecha de modificación', async () => {
    const { servicio, tx } = crear();
    const sinCambios = vi.fn(() =>
      Promise.resolve({ resultado: 'igual', auditoria: null }),
    );
    await servicio.editar(docente, 7, sinCambios);
    expect(tx.proyecto_docente.update).not.toHaveBeenCalled();
  });
});

describe('EdicionProyectoService.motivoNoEditable', () => {
  it('nulo para el docente asignado en un estado editable', () => {
    const { servicio } = crear();
    expect(servicio.motivoNoEditable(docente, proyecto() as never)).toBeNull();
  });

  it('explica que solo editan los asignados', () => {
    const { servicio } = crear();
    const departamento = { ...docente, id: 1, roles: [ROL.departamento] };
    expect(servicio.motivoNoEditable(departamento, proyecto() as never)).toBe(
      MENSAJE_SOLO_DOCENTES_ASIGNADOS,
    );
  });
});

describe('soloCambios', () => {
  it('deja solo los campos que cambian', () => {
    expect(
      soloCambios(
        { codigo: 'RAC 1', enunciado: 'A', raps: [{ idRap: 1 }] },
        { codigo: 'RAC 1', enunciado: 'B', raps: [{ idRap: 1 }] },
      ),
    ).toEqual({ anterior: { enunciado: 'A' }, nuevo: { enunciado: 'B' } });
  });

  it('compara arreglos y objetos por su contenido', () => {
    expect(
      soloCambios({ raps: [{ idRap: 1 }] }, { raps: [{ idRap: 2 }] }),
    ).toEqual({
      anterior: { raps: [{ idRap: 1 }] },
      nuevo: { raps: [{ idRap: 2 }] },
    });
  });

  it('detecta un campo que desaparece', () => {
    expect(soloCambios({ a: 1, b: 2 }, { a: 1 })).toEqual({
      anterior: { b: 2 },
      nuevo: { b: null },
    });
  });

  it('nulo si no cambió nada', () => {
    expect(soloCambios({ descripcion: 'x' }, { descripcion: 'x' })).toBeNull();
  });
});
