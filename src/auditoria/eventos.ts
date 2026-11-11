import { Prisma } from '../generated/prisma/client.js';
import { type AccionAuditoria, VALOR_OMITIDO } from './auditoria.service.js';

/*
 * La tabla `auditoria` guarda cinco acciones del modelo de datos (crear, actualizar…). Con
 * solo eso, un inicio de sesión se lee como «creación» y una devolución como «modificación»,
 * porque así se guardan: una fila de `sesion` que se crea, un `estado` que cambia. Aquí se
 * nombra lo que pasó con palabras del dominio, sin cambiar el modelo: el evento se deduce de
 * la acción, la tabla y, cuando hace falta, un campo del valor nuevo.
 *
 * El mismo catálogo sirve para clasificar un registro leído y para filtrar en la base, de modo
 * que el filtro devuelve exactamente los registros que la pantalla muestra con ese nombre.
 */

/** Eventos generales: uno por acción del modelo. Son lo que queda cuando no hay uno propio. */
const EVENTO_GENERAL = {
  crear: 'creacion',
  actualizar: 'modificacion',
  eliminar: 'eliminacion',
  aprobar: 'aprobacion',
  consulta_sensible: 'consulta_sensible',
} as const satisfies Record<AccionAuditoria, string>;

interface EventoPropio {
  evento: string;
  accion: AccionAuditoria;
  tabla: string;
  /** Campo del valor nuevo que lo distingue de otros cambios sobre la misma tabla. */
  nuevo?: { campo: string; valor: string | boolean };
}

/**
 * Eventos con nombre propio. Dos eventos de la misma acción y la misma tabla no deben poder
 * cumplirse a la vez en un registro: se distinguen por valores distintos de un campo, o por
 * campos que no se guardan juntos.
 */
const EVENTOS_PROPIOS = [
  { evento: 'inicio_sesion', accion: 'crear', tabla: 'sesion' },
  { evento: 'cierre_sesion', accion: 'actualizar', tabla: 'sesion' },
  {
    evento: 'envio_revision',
    accion: 'actualizar',
    tabla: 'proyecto_docente',
    nuevo: { campo: 'estado', valor: 'enviado' },
  },
  {
    evento: 'devolucion',
    accion: 'actualizar',
    tabla: 'proyecto_docente',
    nuevo: { campo: 'estado', valor: 'devuelto' },
  },
  { evento: 'registro_clase', accion: 'actualizar', tabla: 'sesion_clase' },
  {
    evento: 'registro_inasistencias',
    accion: 'actualizar',
    tabla: 'inasistencia',
  },
  { evento: 'carga_matriculados', accion: 'actualizar', tabla: 'matricula' },
  { evento: 'carga_evidencia', accion: 'crear', tabla: 'evidencia_rap' },
  {
    evento: 'generacion_reporte',
    accion: 'crear',
    tabla: 'reporte_academico',
  },
  {
    evento: 'cierre_medicion',
    accion: 'actualizar',
    tabla: 'medicion_rap',
    nuevo: { campo: 'estado', valor: 'cerrada' },
  },
  {
    evento: 'reapertura_medicion',
    accion: 'actualizar',
    tabla: 'medicion_rap',
    nuevo: { campo: 'estado', valor: 'borrador' },
  },
  {
    evento: 'bloqueo_usuario',
    accion: 'actualizar',
    tabla: 'usuario',
    nuevo: { campo: 'motivo', valor: 'intentos_fallidos_consecutivos' },
  },
  {
    evento: 'inactivacion_usuario',
    accion: 'actualizar',
    tabla: 'usuario',
    nuevo: { campo: 'activo', valor: false },
  },
  {
    evento: 'reactivacion_usuario',
    accion: 'actualizar',
    tabla: 'usuario',
    nuevo: { campo: 'activo', valor: true },
  },
  {
    // La contraseña nunca se guarda: queda el campo, con el valor omitido.
    evento: 'restablecimiento_contrasena',
    accion: 'actualizar',
    tabla: 'usuario',
    nuevo: { campo: 'contrasena', valor: VALOR_OMITIDO },
  },
  { evento: 'asignacion_rol', accion: 'crear', tabla: 'usuario_rol' },
  {
    // Un rol que se revocó y se vuelve a dar reutiliza la misma fila.
    evento: 'asignacion_rol',
    accion: 'actualizar',
    tabla: 'usuario_rol',
    nuevo: { campo: 'activo', valor: true },
  },
  {
    evento: 'revocacion_rol',
    accion: 'actualizar',
    tabla: 'usuario_rol',
    nuevo: { campo: 'activo', valor: false },
  },
] as const satisfies readonly EventoPropio[];

type CodigoPropio = (typeof EVENTOS_PROPIOS)[number]['evento'];
type CodigoGeneral = (typeof EVENTO_GENERAL)[AccionAuditoria];

/** Lo que pasó, con palabras del dominio. */
export type EventoDeAuditoria = CodigoGeneral | CodigoPropio;

export const EVENTOS_DE_AUDITORIA: readonly EventoDeAuditoria[] = [
  ...new Set<EventoDeAuditoria>([
    ...Object.values(EVENTO_GENERAL),
    ...EVENTOS_PROPIOS.map(({ evento }) => evento),
  ]),
];

const PROPIOS: readonly EventoPropio[] = EVENTOS_PROPIOS;

/** El evento de un registro guardado. Una acción que no sea del modelo queda como modificación. */
export function eventoDe(registro: {
  accion: string | null;
  tabla_afectada: string | null;
  valor_nuevo: unknown;
}): EventoDeAuditoria {
  const propio = PROPIOS.find(
    (candidato) =>
      candidato.accion === registro.accion &&
      candidato.tabla === registro.tabla_afectada &&
      (!candidato.nuevo ||
        campo(registro.valor_nuevo, candidato.nuevo.campo) ===
          candidato.nuevo.valor),
  );
  if (propio) {
    return propio.evento as EventoDeAuditoria;
  }
  return (
    EVENTO_GENERAL[registro.accion as AccionAuditoria] ??
    EVENTO_GENERAL.actualizar
  );
}

/** Condición de la base que cumplen los registros de ese evento, y solo ellos. */
export function filtroDeEvento(
  evento: EventoDeAuditoria,
): Prisma.auditoriaWhereInput {
  const propios = PROPIOS.filter((candidato) => candidato.evento === evento);
  if (propios.length > 0) {
    return { OR: propios.map(condicion) };
  }
  const accion = (Object.keys(EVENTO_GENERAL) as AccionAuditoria[]).find(
    (candidata) => EVENTO_GENERAL[candidata] === evento,
  );
  // Un evento general es la acción menos lo que tiene nombre propio.
  return {
    accion,
    AND: PROPIOS.filter((candidato) => candidato.accion === accion).map(
      excepto,
    ),
  };
}

/**
 * Los registros que no son de ese evento propio, dentro de su misma acción. No se escribe
 * como NOT de su condición: para la base, comparar un campo que el registro no guarda no da
 * «falso» sino «desconocido», y negarlo descartaría justo las modificaciones corrientes.
 * Por eso cada forma de no cumplirla va dicha en positivo.
 */
function excepto({ tabla, nuevo }: EventoPropio): Prisma.auditoriaWhereInput {
  const otraTabla: Prisma.auditoriaWhereInput[] = [
    { tabla_afectada: { not: tabla } },
    { tabla_afectada: null },
  ];
  if (!nuevo) {
    return { OR: otraTabla };
  }
  return {
    OR: [
      ...otraTabla,
      // El registro no guarda ese campo (o no guarda valor nuevo), o guarda otro valor.
      { valor_nuevo: { path: `$.${nuevo.campo}`, equals: Prisma.DbNull } },
      { valor_nuevo: { path: `$.${nuevo.campo}`, not: nuevo.valor } },
    ],
  };
}

function condicion({
  accion,
  tabla,
  nuevo,
}: EventoPropio): Prisma.auditoriaWhereInput {
  return {
    accion,
    tabla_afectada: tabla,
    ...(nuevo && {
      valor_nuevo: { path: `$.${nuevo.campo}`, equals: nuevo.valor },
    }),
  };
}

function campo(valor: unknown, nombre: string): unknown {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)[nombre]
    : undefined;
}
