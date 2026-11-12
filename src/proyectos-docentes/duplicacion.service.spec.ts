import {
  avisoRap,
  contenidoDe,
  MENSAJE_AVISO_RAP,
  type Origen,
  semanasFuera,
} from './duplicacion.service.js';

// Datos ficticios: nunca datos reales de personas en las pruebas.
const rap = (id: number, numero: number, activo = true) => ({
  id,
  id_programa: 10,
  numero,
  codigo: `RAP ${numero}`,
  descripcion: `RAP ficticio ${numero}`,
  activo,
  competencia_asociada: null,
  perfil_egreso: null,
  created_at: null,
  updated_at: null,
});

/** Un origen con lo que leen las reglas; el resto del proyecto no les importa. */
function origen(datos: {
  raps?: number[];
  mapeo?: { id_rap: number; activo?: boolean }[];
  semanas?: number[];
  descripcion?: string | null;
}): Origen {
  return {
    descripcion:
      'descripcion' in datos ? datos.descripcion : 'Descripción del curso',
    asignatura: { asignatura_rap: datos.mapeo ?? [] },
    proyecto_docente_rap: (datos.raps ?? []).map((id) => ({
      id_rap: id,
      rap: rap(id, id),
    })),
    rac: [
      {
        rac_rap: [{ id_rap: 1 }, { id_rap: 2 }],
        evaluacion_rac: [{}, {}, {}],
      },
      { rac_rap: [{ id_rap: 1 }], evaluacion_rac: [{}] },
    ],
    estrategia_metodologica: [{}, {}],
    contenido_programatico: (datos.semanas ?? [1, 2, 3]).map((semana) => ({
      semana,
    })),
    bibliografia: [{}, {}, {}, {}],
  } as unknown as Origen;
}

describe('contenidoDe: lo que la copia va a llevar', () => {
  it('cuenta cada sección del origen', () => {
    expect(contenidoDe(origen({}))).toEqual({
      descripcion: true,
      racs: 2,
      relacionesRap: 3,
      estrategias: 2,
      actividadesEvaluacion: 4,
      semanasContenido: 3,
      referencias: 4,
    });
  });

  it('una descripción vacía o en blanco no cuenta como escrita', () => {
    expect(contenidoDe(origen({ descripcion: '   ' })).descripcion).toBe(false);
    expect(contenidoDe(origen({ descripcion: null })).descripcion).toBe(false);
  });
});

describe('semanasFuera: semanas que no caben en el período elegido', () => {
  it('cuenta las semanas del origen que pasan del número de semanas del período', () => {
    const conDieciocho = origen({ semanas: [1, 2, 16, 17, 18] });

    expect(semanasFuera(conDieciocho, 16)).toBe(2);
    expect(semanasFuera(conDieciocho, 18)).toBe(0);
  });

  it('un período sin número de semanas no deja ninguna fuera', () => {
    expect(semanasFuera(origen({ semanas: [1, 40] }), null)).toBe(0);
  });
});

describe('avisoRap: la asignatura cambió de RAP (RF-09, excepción de p4)', () => {
  const activos = [rap(1, 1), rap(2, 2), rap(3, 3)];

  it('sin cambios no avisa', () => {
    expect(
      avisoRap(
        origen({ raps: [1, 2], mapeo: [{ id_rap: 1 }, { id_rap: 2 }] }),
        activos,
      ),
    ).toBeNull();
  });

  it('avisa del RAP que entró al mapeo y no estaba en el origen', () => {
    const aviso = avisoRap(
      origen({
        raps: [1],
        mapeo: [{ id_rap: 1 }, { id_rap: 3 }],
      }),
      activos,
    );

    expect(aviso).toMatchObject({ mensaje: MENSAJE_AVISO_RAP, retirados: [] });
    expect(aviso?.nuevos.map((r) => r.id)).toEqual([3]);
  });

  it('avisa del RAP del origen que salió del mapeo o se inactivó', () => {
    const aviso = avisoRap(
      origen({
        raps: [1, 2, 4],
        mapeo: [{ id_rap: 1 }, { id_rap: 2, activo: false }, { id_rap: 4 }],
      }),
      activos,
    );

    expect(aviso?.retirados.map((r) => r.id)).toEqual([2, 4]);
    expect(aviso?.nuevos).toEqual([]);
  });

  it('sin mapeo registrado solo avisa de los RAP inactivos', () => {
    expect(avisoRap(origen({ raps: [1, 2] }), activos)).toBeNull();
    expect(
      avisoRap(origen({ raps: [1, 5] }), activos)?.retirados.map((r) => r.id),
    ).toEqual([5]);
  });
});
