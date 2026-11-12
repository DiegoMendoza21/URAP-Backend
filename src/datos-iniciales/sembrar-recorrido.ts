import { ESTADO_MATRICULA } from '../estudiantes/estados.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ESTADO_MEDICION,
  PERIODO_TOMA,
  TIPO_VALORACION,
} from '../mediciones/constantes.js';
import {
  type AvisoRevision,
  avisoAprobado,
  avisoDevuelto,
  avisoEnviado,
  cursoDelAviso,
} from '../notificaciones/avisos-revision.js';
import { ORIGEN_ASISTENTE } from '../proyectos-docentes/proyectos-docentes.service.js';
import { fechaDeHoy, sumarDias } from '../sesiones/alertas.js';
import {
  aFechaColumna,
  aHoraColumna,
  aTextoFecha,
  planificarSesiones,
} from '../sesiones/calendario.js';
import {
  ESTADO_PROGRAMADA,
  ESTADO_REGISTRADA,
  TIPO_CLASE,
  TIPO_FESTIVO,
} from '../sesiones/sesiones.service.js';
import { imagenDemo } from './imagen-demo.js';
import { CODIGO_PLAN_1702 } from './programa.js';
import {
  DIAS_SIN_REGISTRAR,
  ESTUDIANTES_DEMO,
  GRUPO_DEMO,
  type EstudianteDemo,
  fechasDelProyecto,
  type MedicionDemo,
  nivelPorConteo,
  PERIODO_CERRADO_DEMO,
  PREFIJO_DEMO,
  type ProyectoDemo,
  PROYECTOS_DEMO,
  SEMANAS_INCUMPLIDAS,
} from './recorrido-demo.js';

type Transaccion = Prisma.TransactionClient;

/** Archivo de una evidencia de demostración, para guardarlo en el almacenamiento documental. */
export interface ArchivoDemo {
  clave: string;
  contenido: Buffer;
}

export interface ContextoRecorrido {
  idPrograma: number;
  /** Período vigente de demostración (2026-2). */
  idPeriodo: number;
  idsRap: ReadonlyMap<number, number>;
  /** `YYYY-MM-DD`: define qué sesiones ya pasaron. Por defecto, hoy en Colombia. */
  hoy?: string;
}

/** Tipo de sesión de las evaluaciones parcial y final (catálogo en datos-iniciales). */
const TIPO_PARCIAL = 'parcial';
/**
 * `revision_proyecto.tipo` y `.resultado`, como los escribe la revisión de EP-07 (backend #25,
 * todavía fuera de main): cuando entre, conviene importar sus constantes.
 */
const EVENTO = {
  envio: { tipo: 'elaboracion', resultado: 'enviado' },
  devolucion: { tipo: 'revision', resultado: 'devuelto' },
  aprobacion: { tipo: 'aprobacion', resultado: 'aprobado' },
};

/**
 * Siembra el recorrido de demostración (recorrido-demo.ts). Como el resto del seed, es
 * repetible: un proyecto que ya existe (misma asignatura, período y grupo `DEMO-A`) no se toca,
 * y de un estudiante que ya existe (mismo documento) solo se pone al día el nombre. Devuelve los
 * archivos de todas las evidencias de demostración, nuevas o no, para guardarlos en el
 * almacenamiento documental después de confirmar la transacción.
 */
export async function sembrarRecorridoDemo(
  tx: Transaccion,
  contexto: ContextoRecorrido,
): Promise<ArchivoDemo[]> {
  const hoy = contexto.hoy ?? fechaDeHoy();
  const datos = await leerReferencias(tx, contexto);
  const idPeriodoCerrado = await sembrarPeriodoCerrado(tx);
  const idsEstudiante = await sembrarEstudiantes(tx, contexto.idPrograma);

  const archivos: ArchivoDemo[] = [];
  for (const definicion of PROYECTOS_DEMO) {
    const periodo =
      definicion.periodo === 'vigente'
        ? await leerPeriodo(tx, contexto.idPeriodo)
        : await leerPeriodo(tx, idPeriodoCerrado);
    const idAsignatura = await asignaturaDemo(
      tx,
      contexto.idPrograma,
      definicion.asignatura,
    );
    const existente = await tx.proyecto_docente.findFirst({
      where: {
        id_asignatura: idAsignatura,
        id_periodo: periodo.id,
        grupo: GRUPO_DEMO,
      },
      select: { id: true },
    });
    const idProyecto =
      existente?.id ??
      (await sembrarProyecto(tx, definicion, {
        ...datos,
        idsRap: contexto.idsRap,
        idAsignatura,
        periodo,
        hoy,
        idsEstudiante,
      }));
    archivos.push(...(await archivosDeEvidencias(tx, idProyecto)));
  }
  return archivos;
}

// ---------------------------------------------------------------------------------------------
// Referencias que ya dejó el resto del seed
// ---------------------------------------------------------------------------------------------

interface Referencias {
  estados: Map<string, number>;
  tiposSesion: Map<string, number>;
  usuarios: Map<string, number>;
  festivos: Map<string, number>;
  /** Nivel de la escala del programa por su valor (1 a 4). */
  niveles: Map<number, number>;
  porcentajeEsperado: Prisma.Decimal | null;
}

async function leerReferencias(
  tx: Transaccion,
  { idPrograma }: ContextoRecorrido,
): Promise<Referencias> {
  const [estados, tipos, usuarios, festivos, programa] = await Promise.all([
    tx.estado_proyecto.findMany({ select: { id: true, codigo: true } }),
    tx.tipo_sesion.findMany({ select: { id: true, codigo: true } }),
    tx.usuario.findMany({
      where: { email: { endsWith: '.demo@urap.local' } },
      select: { id: true, email: true },
    }),
    tx.dia_festivo.findMany({ select: { id: true, fecha: true } }),
    tx.programa.findUniqueOrThrow({
      where: { id: idPrograma },
      select: {
        escala_valoracion_programa_id_escala_activaToescala_valoracion: {
          select: {
            porcentaje_esperado: true,
            nivel_escala: { select: { id: true, valor: true } },
          },
        },
      },
    }),
  ]);
  const escala =
    programa.escala_valoracion_programa_id_escala_activaToescala_valoracion;
  if (!escala) {
    throw new Error(
      'El programa no tiene escala activa al sembrar el recorrido.',
    );
  }
  return {
    estados: porClave(estados, (fila) => fila.codigo),
    tiposSesion: porClave(tipos, (fila) => fila.codigo),
    usuarios: porClave(usuarios, (fila) => fila.email),
    festivos: porClave(festivos, (fila) =>
      fila.fecha ? aTextoFecha(fila.fecha) : null,
    ),
    niveles: porClave(escala.nivel_escala, (fila) => fila.valor),
    porcentajeEsperado: escala.porcentaje_esperado,
  };
}

/**
 * La asignatura de un proyecto de demostración, por su nombre en el plan de estudios. Es la
 * única búsqueda de asignaturas del recorrido. Desde el modelo v2.5 las asignaturas cuelgan del
 * plan de estudios y varias se repiten en el 1702 y el 2502 (Finanzas a corto plazo,
 * Macroeconomía, Organización y dirección): todas las de la demostración son del plan 1702.
 */
async function asignaturaDemo(
  tx: Transaccion,
  idPrograma: number,
  nombre: string,
): Promise<number> {
  const asignatura = await tx.asignatura.findFirst({
    where: {
      plan_estudio: { id_programa: idPrograma, codigo: CODIGO_PLAN_1702 },
      nombre,
    },
    select: { id: true },
  });
  if (!asignatura) {
    throw new Error(
      `No se encontró la asignatura ${nombre} al sembrar el recorrido de demostración.`,
    );
  }
  return asignatura.id;
}

interface PeriodoLeido {
  id: number;
  inicio: string;
  fin: string;
  numeroSemanas: number | null;
  cerrado: boolean;
}

async function leerPeriodo(tx: Transaccion, id: number): Promise<PeriodoLeido> {
  const periodo = await tx.periodo_academico.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      fecha_inicio: true,
      fecha_fin: true,
      numero_semanas: true,
      cerrado: true,
    },
  });
  if (!periodo.fecha_inicio || !periodo.fecha_fin) {
    throw new Error(
      `El período ${id} no tiene fechas al sembrar el recorrido.`,
    );
  }
  return {
    id: periodo.id,
    inicio: aTextoFecha(periodo.fecha_inicio),
    fin: aTextoFecha(periodo.fecha_fin),
    numeroSemanas: periodo.numero_semanas,
    cerrado: Boolean(periodo.cerrado),
  };
}

async function sembrarPeriodoCerrado(tx: Transaccion): Promise<number> {
  const periodo = await tx.periodo_academico.upsert({
    where: { codigo: PERIODO_CERRADO_DEMO.codigo },
    create: {
      codigo: PERIODO_CERRADO_DEMO.codigo,
      fecha_inicio: aFechaColumna(PERIODO_CERRADO_DEMO.fecha_inicio),
      fecha_fin: aFechaColumna(PERIODO_CERRADO_DEMO.fecha_fin),
      numero_semanas: PERIODO_CERRADO_DEMO.numero_semanas,
      activo: false,
      cerrado: true,
    },
    update: {},
  });
  return periodo.id;
}

/** Los estudiantes ficticios de todos los cursos; devuelve su id por documento. */
async function sembrarEstudiantes(
  tx: Transaccion,
  idPrograma: number,
): Promise<Map<string, number>> {
  await tx.estudiante.createMany({
    data: ESTUDIANTES_DEMO.map((estudiante) => ({
      identificacion: estudiante.documento,
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      id_programa: idPrograma,
      activo: true,
    })),
    skipDuplicates: true,
  });
  const filas = await tx.estudiante.findMany({
    where: {
      identificacion: { in: ESTUDIANTES_DEMO.map((e) => e.documento) },
    },
    select: { id: true, identificacion: true, nombres: true, apellidos: true },
  });
  // Una base sembrada con una versión anterior trae nombres que parecían de personas reales:
  // se cambian por los de ahora. En una base nueva no hay nada que cambiar.
  const vigentes = new Map(ESTUDIANTES_DEMO.map((e) => [e.documento, e]));
  for (const fila of filas) {
    const vigente = vigentes.get(fila.identificacion ?? '');
    if (
      vigente &&
      (fila.nombres !== vigente.nombres || fila.apellidos !== vigente.apellidos)
    ) {
      await tx.estudiante.update({
        where: { id: fila.id },
        data: { nombres: vigente.nombres, apellidos: vigente.apellidos },
      });
    }
  }
  return porClave(filas, (fila) => fila.identificacion);
}

// ---------------------------------------------------------------------------------------------
// Un proyecto docente con todo lo suyo
// ---------------------------------------------------------------------------------------------

interface ContextoProyecto extends Referencias {
  idsRap: ReadonlyMap<number, number>;
  idAsignatura: number;
  periodo: PeriodoLeido;
  hoy: string;
  idsEstudiante: ReadonlyMap<string, number>;
}

async function sembrarProyecto(
  tx: Transaccion,
  definicion: ProyectoDemo,
  contexto: ContextoProyecto,
): Promise<number> {
  const { periodo, usuarios, estados, idsRap } = contexto;
  const idDocente = obtener(usuarios, definicion.docente, definicion.docente);
  const idRevisor = obtener(
    usuarios,
    'departamento.demo@urap.local',
    'el usuario del departamento',
  );
  const estadoDe = (codigo: string) =>
    obtener(estados, codigo, `el estado ${codigo}`);

  // Los aprobados se tramitaron en la primera semana del período; los que siguen en trámite,
  // en los días anteriores a la siembra (`fechasDelProyecto`).
  const fechas = fechasDelProyecto(
    definicion.estado,
    periodo.inicio,
    contexto.hoy,
  );
  const creado = momento(fechas.creado, '09:00');
  const enviado = fechas.enviado ? momento(fechas.enviado, '08:00') : null;
  const revisado = fechas.revisado ? momento(fechas.revisado, '10:00') : null;
  const aprobado =
    definicion.estado === 'aprobado' || definicion.estado === 'cerrado';

  const rubricaRap2 = await tx.rubrica.findFirst({
    where: { id_rap: obtener(idsRap, 2, 'RAP 2'), version: 1 },
    select: { id: true },
  });
  const proyecto = await tx.proyecto_docente.create({
    data: {
      id_asignatura: contexto.idAsignatura,
      id_periodo: periodo.id,
      id_estado: estadoDe(definicion.estado),
      grupo: GRUPO_DEMO,
      descripcion: definicion.descripcion,
      origen: ORIGEN_ASISTENTE,
      id_creado_por: idDocente,
      fecha_creacion: creado,
      fecha_actualizacion: enviado ?? momento(fechas.actualizado, '17:00'),
      fecha_envio: enviado,
      fecha_aprobacion: aprobado ? revisado : null,
      proyecto_docente_rap: {
        create: definicion.raps.map((rap) => ({
          id_rap: obtener(idsRap, rap, `RAP ${rap}`),
          // La rúbrica real del RAP 2 queda congelada en el proyecto (RF-30).
          id_rubrica: rap === 2 ? (rubricaRap2?.id ?? null) : null,
        })),
      },
      proyecto_docente_docente: {
        create: [{ id_usuario: idDocente, responsable: true, orden: 1 }],
      },
    },
    select: { id: true },
  });
  const idProyecto = proyecto.id;

  await sembrarSecciones(tx, idProyecto, definicion, idsRap);
  await sembrarRevision(tx, idProyecto, definicion, {
    idDocente,
    idRevisor,
    enviado,
    revisado,
    estadoDe,
  });
  await sembrarAvisos(tx, idProyecto, definicion, {
    idDocente,
    idRevisor,
    enviado,
    revisado,
  });

  const idsMatricula = definicion.matriculados
    ? await sembrarMatriculas(tx, idProyecto, definicion.matriculados, contexto)
    : [];
  const sesiones = definicion.horario
    ? await sembrarCalendario(tx, idProyecto, definicion, {
        ...contexto,
        idDocente,
        idsMatricula,
      })
    : [];
  await sembrarEvidencias(tx, idProyecto, definicion, {
    sesiones,
    idDocente,
    idsRap,
  });
  if (definicion.medicion) {
    await sembrarMedicion(tx, idProyecto, definicion.medicion, {
      ...contexto,
      idDocente,
      idsMatricula,
      idRubrica: rubricaRap2?.id ?? null,
    });
  }
  return idProyecto;
}

/** Puntos 2 a 7 del formato: descripción, RAC con su evaluación, estrategias, contenidos y bibliografía. */
async function sembrarSecciones(
  tx: Transaccion,
  idProyecto: number,
  definicion: ProyectoDemo,
  idsRap: ReadonlyMap<number, number>,
): Promise<void> {
  for (const [indice, rac] of definicion.racs.entries()) {
    await tx.rac.create({
      data: {
        id_proyecto_docente: idProyecto,
        codigo: rac.codigo,
        descripcion: rac.descripcion,
        orden: indice + 1,
        rac_rap: {
          create: [
            {
              id_rap: obtener(idsRap, rac.rap, `RAP ${rac.rap}`),
              descripcion_contribucion: rac.contribucion,
            },
          ],
        },
        evaluacion_rac: { create: rac.evaluaciones },
      },
    });
  }
  await tx.estrategia_metodologica.createMany({
    data: definicion.estrategias.map((descripcion, indice) => ({
      id_proyecto_docente: idProyecto,
      descripcion,
      orden: indice + 1,
    })),
  });
  await tx.contenido_programatico.createMany({
    data: definicion.temas.map((tema, indice) => ({
      id_proyecto_docente: idProyecto,
      semana: indice + 1,
      tema,
    })),
  });
  await tx.bibliografia.createMany({
    data: definicion.bibliografia.map((referencia, indice) => ({
      id_proyecto_docente: idProyecto,
      referencia,
      orden: indice + 1,
    })),
  });
}

/** Historial de la revisión (RF-17, RF-18), con los mismos eventos que escribe EP-07. */
async function sembrarRevision(
  tx: Transaccion,
  idProyecto: number,
  definicion: ProyectoDemo,
  datos: {
    idDocente: number;
    idRevisor: number;
    enviado: Date | null;
    revisado: Date | null;
    estadoDe: (codigo: string) => number;
  },
): Promise<void> {
  const { idDocente, idRevisor, enviado, revisado, estadoDe } = datos;
  if (enviado === null) {
    return;
  }
  await tx.revision_proyecto.create({
    data: {
      id_proyecto_docente: idProyecto,
      id_usuario: idDocente,
      ...EVENTO.envio,
      id_estado_anterior: estadoDe('en_diligenciamiento'),
      id_estado_nuevo: estadoDe('enviado'),
      fecha: enviado,
    },
  });
  if (revisado === null) {
    return;
  }
  if (definicion.estado === 'devuelto' && definicion.devolucion) {
    await tx.revision_proyecto.create({
      data: {
        id_proyecto_docente: idProyecto,
        id_usuario: idRevisor,
        ...EVENTO.devolucion,
        id_estado_anterior: estadoDe('enviado'),
        id_estado_nuevo: estadoDe('devuelto'),
        observacion_general: definicion.devolucion.general,
        fecha: revisado,
        observacion_revision: {
          create: definicion.devolucion.observaciones.map((fila) => ({
            ...fila,
            resuelta: false,
          })),
        },
      },
    });
  }
  if (definicion.estado === 'aprobado' || definicion.estado === 'cerrado') {
    await tx.revision_proyecto.create({
      data: {
        id_proyecto_docente: idProyecto,
        id_usuario: idRevisor,
        ...EVENTO.aprobacion,
        id_estado_anterior: estadoDe('enviado'),
        id_estado_nuevo: estadoDe('aprobado'),
        fecha: revisado,
      },
    });
  }
}

/**
 * HU-13-03: los avisos que la revisión le habría dejado a cada quien, para que la campana no
 * empiece vacía en la demostración. Sin leer, salvo la aprobación de un período ya cerrado.
 * Quien envía no se avisa a sí mismo, igual que en la revisión.
 */
async function sembrarAvisos(
  tx: Transaccion,
  idProyecto: number,
  definicion: ProyectoDemo,
  datos: {
    idDocente: number;
    idRevisor: number;
    enviado: Date | null;
    revisado: Date | null;
  },
): Promise<void> {
  const { idDocente, idRevisor, enviado, revisado } = datos;
  const proyecto = await tx.proyecto_docente.findUniqueOrThrow({
    where: { id: idProyecto },
    select: {
      grupo: true,
      asignatura: { select: { nombre: true } },
      periodo_academico: { select: { codigo: true } },
    },
  });
  const curso = cursoDelAviso(
    proyecto.asignatura?.nombre,
    proyecto.grupo,
    proyecto.periodo_academico?.codigo,
  );
  const avisos: {
    aviso: AvisoRevision;
    idUsuario: number;
    fecha: Date;
    leida: boolean;
  }[] = [];
  if (definicion.estado === 'enviado' && enviado) {
    avisos.push({
      aviso: avisoEnviado(curso, idProyecto),
      idUsuario: idRevisor,
      fecha: enviado,
      leida: false,
    });
  }
  if (definicion.estado === 'devuelto' && definicion.devolucion && revisado) {
    avisos.push({
      aviso: avisoDevuelto(
        curso,
        idProyecto,
        definicion.devolucion.observaciones.length,
      ),
      idUsuario: idDocente,
      fecha: revisado,
      leida: false,
    });
  }
  if (
    (definicion.estado === 'aprobado' || definicion.estado === 'cerrado') &&
    revisado
  ) {
    avisos.push({
      aviso: avisoAprobado(curso, idProyecto),
      idUsuario: idDocente,
      fecha: revisado,
      leida: definicion.estado === 'cerrado',
    });
  }
  for (const { aviso, idUsuario, fecha, leida } of avisos) {
    const tipo = await tx.tipo_notificacion.findUnique({
      where: { codigo: aviso.tipo },
      select: { id: true },
    });
    await tx.notificacion.create({
      data: {
        id_tipo_notificacion: tipo?.id ?? null,
        id_usuario: idUsuario,
        titulo: aviso.titulo,
        mensaje: aviso.mensaje,
        entidad: 'proyecto_docente',
        id_entidad: idProyecto,
        url_destino: aviso.urlDestino,
        leida,
        fecha_lectura: leida ? fecha : null,
        estado_envio: 'pendiente',
        created_at: fecha,
      },
    });
  }
}

/** RF-22: los estudiantes ficticios del curso, cargados por el administrador de demostración. */
async function sembrarMatriculas(
  tx: Transaccion,
  idProyecto: number,
  estudiantes: readonly EstudianteDemo[],
  { usuarios, periodo, idsEstudiante: porDocumento }: ContextoProyecto,
): Promise<number[]> {
  const idsEstudiante = estudiantes.map((estudiante) =>
    obtener(porDocumento, estudiante.documento, estudiante.documento),
  );
  const idAdministrador = obtener(
    usuarios,
    'admin.demo@urap.local',
    'el administrador de demostración',
  );
  await tx.matricula.createMany({
    data: idsEstudiante.map((idEstudiante) => ({
      id_proyecto_docente: idProyecto,
      id_estudiante: idEstudiante,
      estado: ESTADO_MATRICULA.matriculado,
      fecha_carga: momento(sumarDias(periodo.inicio, 10), '08:00'),
      id_cargado_por: idAdministrador,
    })),
  });
  const filas = await tx.matricula.findMany({
    where: { id_proyecto_docente: idProyecto },
    select: { id: true, id_estudiante: true },
  });
  const porEstudiante = porClave(filas, (fila) => fila.id_estudiante);
  return idsEstudiante.map((id) =>
    obtener(porEstudiante, id, `la matrícula del estudiante ${id}`),
  );
}

interface SesionSembrada {
  id: number;
  semana: number;
  fecha: string;
  registrada: boolean;
}

/**
 * RF-19 y RF-20: horario, calendario generado con la misma regla del servicio (festivos y
 * receso) y el registro de las sesiones que ya pasaron, con sus temas y algunas inasistencias.
 * En el período vigente quedan sin registrar las de los últimos DIAS_SIN_REGISTRAR días
 * (vencidas); en el cerrado, una sesión de cada semana de SEMANAS_INCUMPLIDAS (incumplidas).
 */
async function sembrarCalendario(
  tx: Transaccion,
  idProyecto: number,
  definicion: ProyectoDemo,
  contexto: ContextoProyecto & { idDocente: number; idsMatricula: number[] },
): Promise<SesionSembrada[]> {
  const horario = definicion.horario;
  if (!horario) {
    return [];
  }
  const { periodo, festivos, tiposSesion, hoy, idDocente, idsMatricula } =
    contexto;
  await tx.horario_curso.createMany({
    data: horario.dias.map((dia) => ({
      id_proyecto_docente: idProyecto,
      dia_semana: dia,
      hora_inicio: aHoraColumna(horario.horaInicio),
      hora_fin: aHoraColumna(horario.horaFin),
    })),
  });

  const plan = planificarSesiones({
    fechaInicio: aFechaColumna(periodo.inicio),
    fechaFin: aFechaColumna(periodo.fin),
    numeroSemanas: periodo.numeroSemanas,
    diasClase: horario.dias,
    diasSinClase: new Set(festivos.keys()),
  });
  const tipo = (codigo: string) =>
    obtener(tiposSesion, codigo, `el tipo de sesión ${codigo}`);
  const ultimoRegistrable = sumarDias(hoy, -DIAS_SIN_REGISTRAR);
  const parciales = new Set<number>();
  const incumplidas = new Set<number>();

  const filas = plan.map((sesion) => {
    const idFestivo = festivos.get(sesion.fecha) ?? null;
    // El primer encuentro de las semanas 8 y 16 es la evaluación parcial y la final.
    const esParcial =
      idFestivo === null &&
      (sesion.semana === 8 || sesion.semana === 16) &&
      !parciales.has(sesion.semana);
    if (esParcial) {
      parciales.add(sesion.semana);
    }
    let sinRegistrar: boolean;
    if (periodo.cerrado) {
      // La primera clase de cada semana de SEMANAS_INCUMPLIDAS.
      sinRegistrar =
        idFestivo === null &&
        SEMANAS_INCUMPLIDAS.includes(sesion.semana) &&
        !incumplidas.has(sesion.semana);
      if (sinRegistrar) {
        incumplidas.add(sesion.semana);
      }
    } else {
      // Al día: todas las que ya pasaron quedan registradas.
      sinRegistrar = definicion.sesionesAlDia
        ? sesion.fecha >= hoy
        : sesion.fecha > ultimoRegistrable;
    }
    const registrada = idFestivo === null && !sinRegistrar;
    return {
      sesion,
      registrada,
      datos: {
        id_proyecto_docente: idProyecto,
        semana: sesion.semana,
        fecha: aFechaColumna(sesion.fecha),
        dia_semana: sesion.diaSemana,
        id_dia_festivo: idFestivo,
        id_tipo_sesion: tipo(
          idFestivo !== null
            ? TIPO_FESTIVO
            : esParcial
              ? TIPO_PARCIAL
              : TIPO_CLASE,
        ),
        descripcion: esParcial
          ? sesion.semana === 8
            ? 'Evaluación parcial'
            : 'Evaluación final'
          : null,
        estado: registrada ? ESTADO_REGISTRADA : ESTADO_PROGRAMADA,
        id_registrado_por: registrada ? idDocente : null,
        // Registrada la misma tarde de la clase (18:00 en Colombia).
        fecha_registro: registrada ? momento(sesion.fecha, '18:00') : null,
      },
    };
  });
  await tx.sesion_clase.createMany({ data: filas.map((fila) => fila.datos) });

  const creadas = await tx.sesion_clase.findMany({
    where: { id_proyecto_docente: idProyecto },
    select: { id: true, fecha: true },
  });
  const idPorFecha = porClave(creadas, (fila) =>
    fila.fecha ? aTextoFecha(fila.fecha) : null,
  );
  const contenidos = porClave(
    await tx.contenido_programatico.findMany({
      where: { id_proyecto_docente: idProyecto },
      select: { id: true, semana: true },
    }),
    (fila) => fila.semana,
  );

  const sesiones: SesionSembrada[] = [];
  const temas: { id_sesion: number; id_contenido: number }[] = [];
  const inasistencias: { id_sesion: number; id_matricula: number }[] = [];
  for (const { sesion, registrada } of filas) {
    const id = obtener(
      idPorFecha,
      sesion.fecha,
      `la sesión del ${sesion.fecha}`,
    );
    sesiones.push({
      id,
      semana: sesion.semana,
      fecha: sesion.fecha,
      registrada,
    });
    if (!registrada) {
      continue;
    }
    const idContenido = contenidos.get(sesion.semana);
    if (idContenido !== undefined) {
      temas.push({ id_sesion: id, id_contenido: idContenido });
    }
    // Entre cero y dos ausentes por sesión, elegidos de forma fija.
    for (let k = 0; k < (sesion.semana + sesion.diaSemana) % 3; k++) {
      const posicion =
        (sesion.semana * 5 + sesion.diaSemana * 3 + k * 11) %
        Math.max(idsMatricula.length, 1);
      const idMatricula = idsMatricula[posicion];
      if (idMatricula !== undefined) {
        inasistencias.push({ id_sesion: id, id_matricula: idMatricula });
      }
    }
  }
  await tx.sesion_tema.createMany({ data: temas });
  await tx.inasistencia.createMany({
    data: inasistencias,
    skipDuplicates: true,
  });
  return sesiones;
}

/** RF-24: evidencias del RAP del curso, ligadas a una sesión registrada de esa semana. */
async function sembrarEvidencias(
  tx: Transaccion,
  idProyecto: number,
  definicion: ProyectoDemo,
  datos: {
    sesiones: SesionSembrada[];
    idDocente: number;
    idsRap: ReadonlyMap<number, number>;
  },
): Promise<void> {
  for (const evidencia of definicion.evidencias ?? []) {
    const sesion = datos.sesiones.find(
      (fila) => fila.semana === evidencia.semana && fila.registrada,
    );
    if (!sesion) {
      continue;
    }
    const rap = evidencia.rap ?? definicion.raps[0];
    await tx.evidencia_rap.create({
      data: {
        id_proyecto_docente: idProyecto,
        id_rap: obtener(datos.idsRap, rap, `RAP ${rap}`),
        id_sesion: sesion.id,
        nombre_original: `${PREFIJO_DEMO}rap-${rap}-semana-${evidencia.semana}.png`,
        url: claveEvidencia(idProyecto, rap, evidencia.semana),
        tipo: 'image/png',
        tamano_bytes: imagenDemo(evidencia.semana + rap).length,
        descripcion: evidencia.descripcion,
        fecha: aFechaColumna(sesion.fecha),
        id_subido_por: datos.idDocente,
        fecha_subida: momento(sesion.fecha, '19:00'),
      },
    });
  }
}

function claveEvidencia(
  idProyecto: number,
  rap: number,
  semana: number,
): string {
  return `evidencias/proyecto-${idProyecto}/${PREFIJO_DEMO.toLowerCase()}rap-${rap}-semana-${semana}.png`;
}

/** Los archivos de las evidencias de demostración de un proyecto, ya sembradas o no. */
async function archivosDeEvidencias(
  tx: Transaccion,
  idProyecto: number,
): Promise<ArchivoDemo[]> {
  const evidencias = await tx.evidencia_rap.findMany({
    where: {
      id_proyecto_docente: idProyecto,
      nombre_original: { startsWith: PREFIJO_DEMO },
    },
    select: {
      url: true,
      sesion_clase: { select: { semana: true } },
      rap: { select: { numero: true } },
    },
  });
  return evidencias.flatMap((evidencia) => {
    const semana = evidencia.sesion_clase?.semana;
    const rap = evidencia.rap?.numero;
    return evidencia.url && semana != null && rap != null
      ? [{ clave: evidencia.url, contenido: imagenDemo(semana + rap) }]
      : [];
  });
}

/**
 * RF-30 y RF-31: una medición formativa del RAP 2, cerrada, con la rúbrica real (versión 1) y
 * los niveles que reproducen sus conteos (`nivelPorConteo`), en el orden de los matriculados.
 */
async function sembrarMedicion(
  tx: Transaccion,
  idProyecto: number,
  medicionDemo: MedicionDemo,
  datos: ContextoProyecto & {
    idDocente: number;
    idsMatricula: number[];
    idRubrica: number | null;
  },
): Promise<void> {
  const { idsRap, idDocente, idsMatricula, niveles, periodo } = datos;
  if (datos.idRubrica === null) {
    throw new Error(
      'Falta la rúbrica real del RAP 2 para la medición de demostración.',
    );
  }
  const indicadores = await tx.indicador_rap.findMany({
    where: {
      rubrica_descriptor: { some: { id_rubrica: datos.idRubrica } },
    },
    select: { id: true, numero: true },
    orderBy: { numero: 'asc' },
  });
  const medicion = await tx.medicion_rap.create({
    data: {
      id_proyecto_docente: idProyecto,
      id_rap: obtener(idsRap, 2, 'RAP 2'),
      id_rubrica: datos.idRubrica,
      tipo_valoracion: TIPO_VALORACION.formativa,
      periodo_toma: PERIODO_TOMA[medicionDemo.periodoToma],
      anio_toma: Number(periodo.inicio.slice(0, 4)),
      tamano_cohorte: idsMatricula.length,
      porcentaje_esperado: datos.porcentajeEsperado,
      estado: ESTADO_MEDICION.cerrada,
      ...medicionDemo.analisis,
      id_registrado_por: idDocente,
      id_cerrado_por: idDocente,
      fecha_cierre: momento(sumarDias(periodo.inicio, 84), '18:00'),
      medicion_indicador: {
        create: indicadores.map((indicador) => ({
          id_indicador: indicador.id,
          instrumento: medicionDemo.instrumentos[indicador.numero ?? 0] ?? null,
        })),
      },
    },
    select: {
      medicion_indicador: {
        select: { id: true, indicador_rap: { select: { numero: true } } },
      },
    },
  });
  await tx.valoracion_estudiante.createMany({
    data: medicion.medicion_indicador.flatMap((fila) =>
      idsMatricula.map((idMatricula, posicion) => ({
        id_medicion_indicador: fila.id,
        id_matricula: idMatricula,
        id_nivel: obtener(
          niveles,
          nivelPorConteo(
            medicionDemo.conteos,
            posicion,
            fila.indicador_rap?.numero ?? 0,
          ),
          'el nivel de la escala',
        ),
      })),
    ),
  });
}

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/** Instante de una fecha `YYYY-MM-DD` a una hora de Colombia (UTC−5, sin horario de verano). */
function momento(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00.000-05:00`);
}

function porClave<T, C>(
  filas: readonly T[],
  clave: (fila: T) => C | null | undefined,
): Map<C, number> {
  const mapa = new Map<C, number>();
  for (const fila of filas) {
    const valor = clave(fila);
    if (valor !== null && valor !== undefined) {
      mapa.set(valor, (fila as { id: number }).id);
    }
  }
  return mapa;
}

function obtener<C, V>(mapa: ReadonlyMap<C, V>, clave: C, que: string): V {
  const valor = mapa.get(clave);
  if (valor === undefined) {
    throw new Error(
      `No se encontró ${que} al sembrar el recorrido de demostración.`,
    );
  }
  return valor;
}
