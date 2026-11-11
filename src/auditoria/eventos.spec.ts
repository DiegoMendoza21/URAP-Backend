import { Prisma } from '../generated/prisma/client.js';
import { eventoDe, EVENTOS_DE_AUDITORIA, filtroDeEvento } from './eventos.js';

const registro = (
  accion: string | null,
  tabla: string | null,
  valorNuevo: unknown = null,
) => ({ accion, tabla_afectada: tabla, valor_nuevo: valorNuevo });

describe('eventoDe', () => {
  it.each([
    ['crear', 'sesion', { id_usuario: 7 }, 'inicio_sesion'],
    ['actualizar', 'sesion', { motivo_revocacion: 'logout' }, 'cierre_sesion'],
    ['actualizar', 'proyecto_docente', { estado: 'enviado' }, 'envio_revision'],
    ['actualizar', 'proyecto_docente', { estado: 'devuelto' }, 'devolucion'],
    ['aprobar', 'proyecto_docente', { estado: 'aprobado' }, 'aprobacion'],
    ['actualizar', 'sesion_clase', { temas: [1] }, 'registro_clase'],
    ['actualizar', 'inasistencia', { ausentes: 2 }, 'registro_inasistencias'],
    ['actualizar', 'matricula', { total: 30 }, 'carga_matriculados'],
    ['crear', 'evidencia_rap', { tipo: 'foto' }, 'carga_evidencia'],
    ['crear', 'reporte_academico', { tipo: 'logro' }, 'generacion_reporte'],
    ['actualizar', 'medicion_rap', { estado: 'cerrada' }, 'cierre_medicion'],
    [
      'actualizar',
      'medicion_rap',
      { estado: 'borrador' },
      'reapertura_medicion',
    ],
    [
      'actualizar',
      'usuario',
      { motivo: 'intentos_fallidos_consecutivos', intentos_fallidos: 0 },
      'bloqueo_usuario',
    ],
    ['actualizar', 'usuario', { activo: false }, 'inactivacion_usuario'],
    ['actualizar', 'usuario', { activo: true }, 'reactivacion_usuario'],
    [
      'actualizar',
      'usuario',
      { contrasena: '[omitido]' },
      'restablecimiento_contrasena',
    ],
    ['crear', 'usuario_rol', { activo: true }, 'asignacion_rol'],
    ['actualizar', 'usuario_rol', { activo: true }, 'asignacion_rol'],
    ['actualizar', 'usuario_rol', { activo: false }, 'revocacion_rol'],
  ])('%s sobre %s con %j es %s', (accion, tabla, valorNuevo, evento) => {
    expect(eventoDe(registro(accion, tabla, valorNuevo))).toBe(evento);
  });

  it.each([
    ['crear', 'proyecto_docente', { grupo: 'A' }, 'creacion'],
    ['crear', 'usuario', { activo: true }, 'creacion'],
    ['actualizar', 'proyecto_docente', { horario: [] }, 'modificacion'],
    [
      'actualizar',
      'proyecto_docente',
      { estado: 'en_diligenciamiento' },
      'modificacion',
    ],
    ['actualizar', 'proyecto_docente', null, 'modificacion'],
    ['actualizar', 'medicion_rap', ['cerrada'], 'modificacion'],
    ['actualizar', 'usuario', { nombres: 'Persona' }, 'modificacion'],
    ['actualizar', 'rol', { activo: false }, 'modificacion'],
    ['eliminar', 'rac', null, 'eliminacion'],
    ['consulta_sensible', 'matricula', null, 'consulta_sensible'],
  ])(
    'sin nombre propio, %s sobre %s con %j es %s',
    (accion, tabla, valorNuevo, evento) => {
      expect(eventoDe(registro(accion, tabla, valorNuevo))).toBe(evento);
    },
  );

  it('una acción que no es del modelo, o un registro sin acción, queda como modificación', () => {
    expect(eventoDe(registro('importar', 'usuario'))).toBe('modificacion');
    expect(eventoDe(registro(null, null))).toBe('modificacion');
  });
});

describe('filtroDeEvento', () => {
  it('un evento propio se busca por su acción, su tabla y el campo que lo distingue', () => {
    expect(filtroDeEvento('devolucion')).toEqual({
      OR: [
        {
          accion: 'actualizar',
          tabla_afectada: 'proyecto_docente',
          valor_nuevo: { path: '$.estado', equals: 'devuelto' },
        },
      ],
    });
    expect(filtroDeEvento('inicio_sesion')).toEqual({
      OR: [{ accion: 'crear', tabla_afectada: 'sesion' }],
    });
  });

  it('un evento con dos orígenes los busca a los dos', () => {
    expect(filtroDeEvento('asignacion_rol')).toEqual({
      OR: [
        { accion: 'crear', tabla_afectada: 'usuario_rol' },
        {
          accion: 'actualizar',
          tabla_afectada: 'usuario_rol',
          valor_nuevo: { path: '$.activo', equals: true },
        },
      ],
    });
  });

  it('un evento general es su acción menos lo que tiene nombre propio', () => {
    const filtro = filtroDeEvento('creacion');

    expect(filtro.accion).toBe('crear');
    expect(filtro.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [{ tabla_afectada: { not: 'sesion' } }, { tabla_afectada: null }],
        },
      ]),
    );
    expect(filtroDeEvento('modificacion').AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { tabla_afectada: { not: 'proyecto_docente' } },
            { tabla_afectada: null },
            { valor_nuevo: { path: '$.estado', equals: Prisma.DbNull } },
            { valor_nuevo: { path: '$.estado', not: 'devuelto' } },
          ],
        },
      ]),
    );
    expect(filtroDeEvento('aprobacion')).toEqual({
      accion: 'aprobar',
      AND: [],
    });
  });

  it('todos los eventos tienen filtro y ninguno se repite', () => {
    expect(new Set(EVENTOS_DE_AUDITORIA).size).toBe(
      EVENTOS_DE_AUDITORIA.length,
    );
    for (const evento of EVENTOS_DE_AUDITORIA) {
      const filtro = filtroDeEvento(evento);
      expect(filtro.OR ?? filtro.accion).toBeTruthy();
    }
  });
});
