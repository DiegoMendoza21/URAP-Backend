import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ESTADOS_PROYECTO,
  FESTIVOS_2026,
  MODULOS,
  PARAMETROS,
  PERMISOS,
  ROLES,
  TIPOS_NOTIFICACION,
  TIPOS_SESION,
} from './catalogos.js';
import {
  PERIODO,
  RECESO_2026_2,
  RUBRICAS_PROVISIONALES,
  USUARIOS_DEMO,
} from './demostracion.js';
import { permisosInicialesDe } from './matriz-permisos.js';
import {
  ESCALA,
  FACULTAD,
  PLANES_DE_ESTUDIO,
  PROGRAMA,
  RAPS,
  RUBRICA_RAP_2,
  type RubricaSemilla,
} from './programa.js';

type Transaccion = Prisma.TransactionClient;

/** Registros que quedaron en cada tabla sembrada. */
export type ResumenSembrado = Record<string, number>;

export interface DatosDemostracion {
  /** Hash de la contraseña de cada usuario de demostración, por correo. */
  hashesUsuarios: ReadonlyMap<string, string>;
}

/**
 * Carga los datos base (catálogos, programa, RAP, rúbrica del RAP 2 y planes de estudio), que
 * sirven en cualquier ambiente, y, si se piden, los de demostración (período 2026-2 con su
 * receso, rúbricas provisionales y usuarios ficticios). Es repetible: solo
 * crea lo que falta y nunca modifica lo que ya existe, para no pisar lo que se cambie desde la
 * aplicación. Todo va en una transacción: si algo falla, la base queda como estaba.
 */
export function sembrarDatosIniciales(
  prisma: PrismaService,
  demostracion?: DatosDemostracion,
): Promise<ResumenSembrado> {
  return prisma.$transaction(
    async (tx) => {
      await sembrarCatalogos(tx);
      const idPrograma = await sembrarPrograma(tx);
      const idsRap = await sembrarRaps(tx, idPrograma);
      await sembrarRubrica(tx, idPrograma, idsRap, RUBRICA_RAP_2);
      await sembrarPlanesDeEstudio(tx, idPrograma, idsRap);
      if (demostracion) {
        const idPeriodo = await sembrarPeriodo(tx);
        for (const rubrica of RUBRICAS_PROVISIONALES) {
          await sembrarRubrica(tx, idPrograma, idsRap, rubrica);
        }
        await sembrarUsuariosDemo(tx, {
          idPrograma,
          idPeriodo,
          idsRap,
          hashesUsuarios: demostracion.hashesUsuarios,
        });
      }
      return contarRegistros(tx);
    },
    { timeout: 60_000 },
  );
}

async function sembrarCatalogos(tx: Transaccion): Promise<void> {
  for (const rol of ROLES) {
    await tx.rol.upsert({
      where: { nombre: rol.nombre },
      create: { ...rol },
      update: {},
    });
  }
  for (const modulo of MODULOS) {
    await tx.modulo.upsert({
      where: { codigo: modulo.codigo },
      create: modulo,
      // El orden se corrige en las bases ya sembradas: plan_curso entró entre proyectos y rap.
      update: { nombre: modulo.nombre, orden: modulo.orden },
    });
  }
  for (const permiso of PERMISOS) {
    await tx.permiso.upsert({
      where: { codigo: permiso.codigo },
      create: permiso,
      update: {},
    });
  }
  for (const estado of ESTADOS_PROYECTO) {
    await tx.estado_proyecto.upsert({
      where: { codigo: estado.codigo },
      create: estado,
      update: {},
    });
  }
  for (const tipo of TIPOS_SESION) {
    await tx.tipo_sesion.upsert({
      where: { codigo: tipo.codigo },
      create: tipo,
      update: {},
    });
  }
  for (const tipo of TIPOS_NOTIFICACION) {
    await tx.tipo_notificacion.upsert({
      where: { codigo: tipo.codigo },
      create: tipo,
      update: {},
    });
  }
  // Un parámetro que ya existe conserva su valor: pudo cambiarlo el administrador.
  for (const parametro of PARAMETROS) {
    await tx.parametro_sistema.upsert({
      where: { clave: parametro.clave },
      create: parametro,
      update: {},
    });
  }
  for (const festivo of FESTIVOS_2026) {
    await tx.dia_festivo.upsert({
      where: { fecha: fechaDeColumnaDate(festivo.fecha) },
      create: {
        fecha: fechaDeColumnaDate(festivo.fecha),
        nombre: festivo.nombre,
        anio: Number(festivo.fecha.slice(0, 4)),
        origen: 'ley',
      },
      update: {},
    });
  }
  await sembrarMatrizPermisos(tx);
}

/**
 * Matriz inicial de permisos (Producto 1, Tabla 17; ver matriz-permisos.ts). Solo para los
 * roles que todavía no tienen ningún permiso: si el administrador ya la ajustó (HU-02-06), no
 * se pisa.
 */
async function sembrarMatrizPermisos(tx: Transaccion): Promise<void> {
  const [modulos, permisos] = await Promise.all([
    tx.modulo.findMany({ select: { id: true, codigo: true } }),
    tx.permiso.findMany({ select: { id: true, codigo: true } }),
  ]);
  const idModulo = new Map(modulos.map(({ id, codigo }) => [codigo, id]));
  const idPermiso = new Map(permisos.map(({ id, codigo }) => [codigo, id]));

  for (const { nombre } of ROLES) {
    const rol = await tx.rol.findUnique({
      where: { nombre },
      select: { id: true, _count: { select: { rol_permiso: true } } },
    });
    if (!rol || rol._count.rol_permiso > 0) {
      continue;
    }
    await tx.rol_permiso.createMany({
      data: permisosInicialesDe(nombre).map(({ modulo, permiso }) => ({
        id_rol: rol.id,
        id_modulo: obtener(idModulo, modulo, `el módulo ${modulo}`),
        id_permiso: obtener(idPermiso, permiso, `el permiso ${permiso}`),
      })),
    });
  }
}

/** Facultad, programa y escala de valoración (RF-04, RF-07). Devuelve el id del programa. */
async function sembrarPrograma(tx: Transaccion): Promise<number> {
  const facultad = await tx.facultad.upsert({
    where: { nombre: FACULTAD.nombre },
    create: FACULTAD,
    update: {},
  });
  const programa = await tx.programa.upsert({
    where: {
      id_facultad_nombre: {
        id_facultad: facultad.id,
        nombre: PROGRAMA.nombre,
      },
    },
    create: { id_facultad: facultad.id, nombre: PROGRAMA.nombre },
    update: {},
  });

  const escala =
    (await tx.escala_valoracion.findFirst({
      where: { id_programa: programa.id, nombre: ESCALA.nombre },
    })) ??
    (await tx.escala_valoracion.create({
      data: {
        id_programa: programa.id,
        nombre: ESCALA.nombre,
        numero_niveles: ESCALA.niveles.length,
        umbral_cumplimiento: ESCALA.umbral_cumplimiento,
        porcentaje_esperado: ESCALA.porcentaje_esperado,
      },
    }));
  for (const nivel of ESCALA.niveles) {
    await tx.nivel_escala.upsert({
      where: { id_escala_valor: { id_escala: escala.id, valor: nivel.valor } },
      create: { id_escala: escala.id, ...nivel },
      update: {},
    });
  }
  if (programa.id_escala_activa === null) {
    await tx.programa.update({
      where: { id: programa.id },
      data: { id_escala_activa: escala.id },
    });
  }
  return programa.id;
}

async function sembrarPeriodo(tx: Transaccion): Promise<number> {
  const periodo = await tx.periodo_academico.upsert({
    where: { codigo: PERIODO.codigo },
    create: {
      codigo: PERIODO.codigo,
      fecha_inicio: fechaDeColumnaDate(PERIODO.fecha_inicio),
      fecha_fin: fechaDeColumnaDate(PERIODO.fecha_fin),
      numero_semanas: PERIODO.numero_semanas,
    },
    update: {},
  });
  // RF-19: el receso se marca igual que un festivo.
  for (const dia of RECESO_2026_2) {
    await tx.dia_festivo.upsert({
      where: { fecha: fechaDeColumnaDate(dia.fecha) },
      create: {
        fecha: fechaDeColumnaDate(dia.fecha),
        nombre: dia.nombre,
        anio: Number(dia.fecha.slice(0, 4)),
        origen: 'institucional',
      },
      update: {},
    });
  }
  return periodo.id;
}

/** RF-05. Devuelve el id de cada RAP por su número. */
async function sembrarRaps(
  tx: Transaccion,
  idPrograma: number,
): Promise<Map<number, number>> {
  const ids = new Map<number, number>();
  for (const { numero, codigo, descripcion } of RAPS) {
    const rap = await tx.rap.upsert({
      where: { id_programa_codigo: { id_programa: idPrograma, codigo } },
      create: { id_programa: idPrograma, codigo, numero, descripcion },
      update: {},
    });
    ids.set(numero, rap.id);
  }
  return ids;
}

/**
 * RF-06: los indicadores de desempeño del RAP, su rúbrica (vigente, sobre la escala activa del
 * programa) y el descriptor de cada indicador en cada nivel.
 */
async function sembrarRubrica(
  tx: Transaccion,
  idPrograma: number,
  idsRap: ReadonlyMap<number, number>,
  { rap, version, indicadores }: RubricaSemilla,
): Promise<void> {
  const { id_escala_activa: idEscala } = await tx.programa.findUniqueOrThrow({
    where: { id: idPrograma },
    select: { id_escala_activa: true },
  });
  if (idEscala === null) {
    throw new Error(
      'El programa no tiene escala activa al sembrar las rúbricas.',
    );
  }
  const idsNivel = new Map(
    (
      await tx.nivel_escala.findMany({
        where: { id_escala: idEscala },
        select: { id: true, valor: true },
      })
    ).map(({ id, valor }) => [valor, id]),
  );

  const idRap = obtener(idsRap, rap, `RAP ${rap}`);
  const rubrica = await tx.rubrica.upsert({
    where: { id_rap_version: { id_rap: idRap, version } },
    create: { id_rap: idRap, id_escala: idEscala, version, estado: 'vigente' },
    update: {},
  });
  for (const { numero, descripcion, descriptores } of indicadores) {
    const indicador = await tx.indicador_rap.upsert({
      where: { id_rap_numero: { id_rap: idRap, numero } },
      create: { id_rap: idRap, numero, descripcion },
      update: {},
    });
    for (const descriptor of descriptores) {
      const idNivel = obtener(
        idsNivel,
        descriptor.nivel,
        `el nivel ${descriptor.nivel}`,
      );
      await tx.rubrica_descriptor.upsert({
        where: {
          id_rubrica_id_indicador_id_nivel: {
            id_rubrica: rubrica.id,
            id_indicador: indicador.id,
            id_nivel: idNivel,
          },
        },
        create: {
          id_rubrica: rubrica.id,
          id_indicador: indicador.id,
          id_nivel: idNivel,
          descripcion: descriptor.descripcion,
        },
        update: {},
      });
    }
  }
}

/**
 * Planes de estudio del programa (modelo v2.5), sus asignaturas, el mapeo curricular con los
 * RAP y, donde el programa la entregó, la ficha de la asignatura con sus prerrequisitos (RF-04,
 * RF-05, RF-08 p5). Cada plan tiene su propia fila de cada asignatura: Comportamiento
 * organizacional queda dos veces, FP15503 en el 1702 e IX24193 en el 2502. Muchas asignaturas
 * no tienen código SMA, así que el índice único (id_plan_estudio, codigo_interno) no evita
 * duplicados: cada asignatura se busca por su nombre dentro de su plan antes de crearla. Los
 * prerrequisitos se buscan también dentro del mismo plan (HU-03-04).
 */
async function sembrarPlanesDeEstudio(
  tx: Transaccion,
  idPrograma: number,
  idsRap: ReadonlyMap<number, number>,
): Promise<void> {
  for (const { codigo, nombre, asignaturas } of PLANES_DE_ESTUDIO) {
    const plan = await tx.plan_estudio.upsert({
      where: { id_programa_codigo: { id_programa: idPrograma, codigo } },
      create: { id_programa: idPrograma, codigo, nombre, estado: 'vigente' },
      update: {},
    });

    const idsAsignatura = new Map<string, number>();
    for (const {
      nombre: nombreAsignatura,
      semestre,
      raps,
      codigo_interno,
      creditos,
      ficha,
    } of asignaturas) {
      const datosFicha = ficha && {
        componente: ficha.componente,
        tipo_curso: ficha.tipo_curso,
        horas_tde: ficha.horas_tde,
        horas_tdp: ficha.horas_tdp,
        horas_ti: ficha.horas_ti,
        horas_totales: ficha.horas_tde + ficha.horas_tdp + ficha.horas_ti,
      };
      const asignatura =
        (await tx.asignatura.findFirst({
          where: { id_plan_estudio: plan.id, nombre: nombreAsignatura },
        })) ??
        (await tx.asignatura.create({
          data: {
            id_plan_estudio: plan.id,
            nombre: nombreAsignatura,
            semestre,
            codigo_interno,
            creditos,
            ...datosFicha,
          },
        }));
      idsAsignatura.set(nombreAsignatura, asignatura.id);
      for (const numero of raps) {
        const idRap = obtener(idsRap, numero, `RAP ${numero}`);
        await tx.asignatura_rap.upsert({
          where: {
            id_asignatura_id_rap: {
              id_asignatura: asignatura.id,
              id_rap: idRap,
            },
          },
          create: { id_asignatura: asignatura.id, id_rap: idRap },
          update: {},
        });
      }
    }

    for (const { nombre: nombreAsignatura, ficha } of asignaturas) {
      for (const requerida of ficha?.prerrequisitos ?? []) {
        const clave = {
          id_asignatura: obtener(
            idsAsignatura,
            nombreAsignatura,
            nombreAsignatura,
          ),
          id_asignatura_requerida: obtener(
            idsAsignatura,
            requerida,
            `${requerida} en el plan ${codigo}`,
          ),
          tipo: 'prerrequisito',
        };
        await tx.asignatura_requisito.upsert({
          where: { id_asignatura_id_asignatura_requerida_tipo: clave },
          create: clave,
          update: {},
        });
      }
    }
  }
}

interface ContextoUsuarios {
  idPrograma: number;
  idPeriodo: number;
  idsRap: ReadonlyMap<number, number>;
  hashesUsuarios: ReadonlyMap<string, string>;
}

/**
 * Usuarios ficticios con sus roles. Un usuario que ya existe no se toca: ni su contraseña ni
 * sus datos. Los roles del programa llevan su alcance (`id_programa`); el del administrador
 * es global.
 */
async function sembrarUsuariosDemo(
  tx: Transaccion,
  { idPrograma, idPeriodo, idsRap, hashesUsuarios }: ContextoUsuarios,
): Promise<void> {
  const roles = new Map(
    (await tx.rol.findMany({ select: { id: true, nombre: true } })).map(
      ({ id, nombre }) => [nombre ?? '', id],
    ),
  );

  for (const demo of USUARIOS_DEMO) {
    const alcance = demo.global ? null : idPrograma;
    const usuario = await tx.usuario.upsert({
      where: { email: demo.correo },
      create: {
        email: demo.correo,
        nombres: demo.nombres,
        apellidos: demo.apellidos,
        password_hash: obtener(hashesUsuarios, demo.correo, 'la contraseña'),
        id_programa: alcance,
        activo: true,
      },
      update: {},
    });

    for (const nombreRol of demo.roles) {
      const idRol = obtener(roles, nombreRol, `el rol ${nombreRol}`);
      // El índice único de usuario_rol no evita duplicados con id_programa nulo (ver
      // docs/modelo-datos.md), así que se busca antes de crear.
      const asignado = await tx.usuario_rol.findFirst({
        where: { id_usuario: usuario.id, id_rol: idRol, id_programa: alcance },
      });
      if (!asignado) {
        await tx.usuario_rol.create({
          data: {
            id_usuario: usuario.id,
            id_rol: idRol,
            id_programa: alcance,
            activo: true,
            fecha_asignacion: new Date(),
          },
        });
      }
    }

    if (demo.lideraRap !== undefined) {
      const idRap = obtener(idsRap, demo.lideraRap, `RAP ${demo.lideraRap}`);
      await tx.lider_rap.upsert({
        where: {
          id_rap_id_usuario_id_periodo: {
            id_rap: idRap,
            id_usuario: usuario.id,
            id_periodo: idPeriodo,
          },
        },
        create: {
          id_rap: idRap,
          id_usuario: usuario.id,
          id_periodo: idPeriodo,
        },
        update: {},
      });
    }

    if (demo.dirigePrograma) {
      await tx.programa.updateMany({
        where: { id: idPrograma, id_director: null },
        data: { id_director: usuario.id },
      });
    }
  }
}

async function contarRegistros(tx: Transaccion): Promise<ResumenSembrado> {
  return {
    roles: await tx.rol.count(),
    modulos: await tx.modulo.count(),
    permisos: await tx.permiso.count(),
    estados_proyecto: await tx.estado_proyecto.count(),
    tipos_sesion: await tx.tipo_sesion.count(),
    tipos_notificacion: await tx.tipo_notificacion.count(),
    parametros: await tx.parametro_sistema.count(),
    festivos: await tx.dia_festivo.count(),
    programas: await tx.programa.count(),
    planes_estudio: await tx.plan_estudio.count(),
    raps: await tx.rap.count(),
    asignaturas: await tx.asignatura.count(),
    asignaturas_rap: await tx.asignatura_rap.count(),
    requisitos: await tx.asignatura_requisito.count(),
    indicadores: await tx.indicador_rap.count(),
    rubricas: await tx.rubrica.count(),
    descriptores: await tx.rubrica_descriptor.count(),
    usuarios: await tx.usuario.count(),
    permisos_por_rol: await tx.rol_permiso.count(),
  };
}

/** Fecha de una columna DATE: la medianoche UTC del día, para que no cambie de día. */
function fechaDeColumnaDate(texto: string): Date {
  return new Date(`${texto}T00:00:00.000Z`);
}

function obtener<C, V>(mapa: ReadonlyMap<C, V>, clave: C, que: string): V {
  const valor = mapa.get(clave);
  if (valor === undefined) {
    throw new Error(`No se encontró ${que} al sembrar los datos iniciales.`);
  }
  return valor;
}
