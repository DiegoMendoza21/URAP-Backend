/**
 * Secciones del proyecto docente que diligencia el docente, con la numeración del formato
 * FO-DO/PC-001 (glosario, «Formatos»). Cada sección se guarda por separado (HU-06-08): el
 * docente puede llenar una a medias, pasar a otra y volver otro día.
 *
 * Para agregar una sección:
 * 1. Sumar a `DatosCompletitud` lo que la sección necesita para saber si está completa.
 * 2. Agregar su entrada a `SECCIONES`, en el orden del formato.
 * 3. Leer esos datos en `DiligenciamientoService.datosCompletitud()`.
 * El resumen (`GET /proyectos-docentes/:id/diligenciamiento`) y la verificación de envío a
 * revisión (RF-17) se alimentan de esta lista.
 */

/** Lo mínimo que hay que leer del proyecto para evaluar todas las secciones. */
export interface DatosCompletitud {
  descripcion: string | null;
  /** RAP seleccionados en la creación del proyecto (`proyecto_docente_rap`). */
  raps: { id: number; codigo: string | null; numero: number | null }[];
  /**
   * Para cada RAC, en orden: su código, los RAP a los que contribuye (`rac_rap`) y cuántas
   * actividades de evaluación tiene (`evaluacion_rac`).
   */
  racs: { codigo: string | null; idsRap: number[]; evaluaciones: number }[];
  /** Cuántas estrategias metodológicas tiene el proyecto (punto 4). */
  estrategias: number;
  /**
   * Punto 6: semanas del período académico (`numero_semanas`, nulo si el período no lo define)
   * y semanas que ya tienen tema.
   */
  contenidos: { numeroSemanas: number | null; semanasConTema: number[] };
  /** Cuántas referencias tiene la bibliografía (punto 7). */
  bibliografia: number;
}

export interface Seccion {
  numero: number;
  clave: string;
  titulo: string;
  /** Lo que le falta a la sección para estar completa. Vacío: completa. */
  pendientes(datos: DatosCompletitud): string[];
}

/** Nombre corto de un RAP: su código o, si no tiene, «RAP n». */
export function nombreRap(rap: {
  id: number;
  codigo: string | null;
  numero: number | null;
}): string {
  return rap.codigo ?? `RAP ${rap.numero ?? rap.id}`;
}

/**
 * Semanas en lenguaje del usuario, agrupando las seguidas: [1, 2, 3, 5, 7, 8] →
 * «1 a 3, 5, 7 y 8». Con dieciséis semanas vacías se lee «1 a 16», no una lista de números.
 */
export function describirSemanas(semanas: readonly number[]): string {
  const ordenadas = [...new Set(semanas)].sort((a, b) => a - b);
  const tramos: string[] = [];
  let inicio = 0;
  for (let i = 1; i <= ordenadas.length; i++) {
    if (i < ordenadas.length && ordenadas[i] === ordenadas[i - 1] + 1) {
      continue;
    }
    const desde = ordenadas[inicio];
    const hasta = ordenadas[i - 1];
    if (hasta - desde >= 2) {
      tramos.push(`${desde} a ${hasta}`);
    } else {
      tramos.push(
        ...ordenadas.slice(inicio, i).map((semana) => String(semana)),
      );
    }
    inicio = i;
  }
  return tramos.length > 1
    ? `${tramos.slice(0, -1).join(', ')} y ${tramos[tramos.length - 1]}`
    : (tramos[0] ?? '');
}

/** Semanas del período que todavía no tienen tema (RF-15, p5). */
export function semanasSinTema({
  numeroSemanas,
  semanasConTema,
}: DatosCompletitud['contenidos']): number[] {
  if (!numeroSemanas) {
    return [];
  }
  const conTema = new Set(semanasConTema);
  return Array.from({ length: numeroSemanas }, (_, i) => i + 1).filter(
    (semana) => !conTema.has(semana),
  );
}

export const MENSAJE_PERIODO_SIN_SEMANAS =
  'El período académico no tiene definido su número de semanas. Pídale al administrador que lo registre.';

export const SECCIONES: readonly Seccion[] = [
  {
    numero: 2,
    clave: 'descripcion',
    titulo: 'Descripción',
    pendientes: ({ descripcion }) =>
      descripcion?.trim() ? [] : ['Redacte la descripción del curso.'],
  },
  {
    numero: 3,
    clave: 'rac',
    titulo: 'Resultados de aprendizaje del curso',
    // RF-12, p5: cada RAP del proyecto necesita al menos un RAC.
    pendientes: ({ raps, racs }) => {
      const conRac = new Set(racs.flatMap((rac) => rac.idsRap));
      return raps
        .filter((rap) => !conRac.has(rap.id))
        .map((rap) => `${nombreRap(rap)} no tiene RAC asociados.`);
    },
  },
  {
    numero: 4,
    clave: 'estrategias',
    titulo: 'Estrategias metodológicas',
    // RF-13, p4: la sección vacía bloquea el envío a revisión.
    pendientes: ({ estrategias }) =>
      estrategias > 0 ? [] : ['Registre al menos una estrategia metodológica.'],
  },
  {
    numero: 5,
    clave: 'evaluacion',
    titulo: 'Evaluación de los resultados de aprendizaje',
    // RF-14: se evalúa cada RAC (precondición: que existan) y ninguno puede quedar sin
    // actividades de evaluación (p4).
    pendientes: ({ racs }) => {
      if (racs.length === 0) {
        return ['Registre primero los RAC del curso en el punto 3.'];
      }
      return racs
        .filter((rac) => rac.evaluaciones === 0)
        .map(
          (rac) =>
            `${rac.codigo ?? 'Un RAC'} no tiene actividades de evaluación.`,
        );
    },
  },
  {
    numero: 6,
    clave: 'contenidos',
    titulo: 'Contenidos del curso',
    // RF-15, p5: una semana sin tema queda pendiente. Que el total de horas no coincida con
    // el de la asignatura (p4) se advierte en la sección, pero no deja la sección incompleta.
    pendientes: ({ contenidos }) => {
      if (!contenidos.numeroSemanas) {
        return [MENSAJE_PERIODO_SIN_SEMANAS];
      }
      const faltan = semanasSinTema(contenidos);
      if (faltan.length === 0) {
        return [];
      }
      return [
        faltan.length === 1
          ? `La semana ${faltan[0]} no tiene tema.`
          : `Las semanas ${describirSemanas(faltan)} no tienen tema.`,
      ];
    },
  },
  {
    numero: 7,
    clave: 'bibliografia',
    titulo: 'Bibliografía',
    // RF-16, p4: la sección vacía bloquea el envío a revisión.
    pendientes: ({ bibliografia }) =>
      bibliografia > 0 ? [] : ['Registre al menos una referencia.'],
  },
];
