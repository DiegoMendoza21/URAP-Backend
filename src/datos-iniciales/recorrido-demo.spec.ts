import { consolidar, logroDelRap } from '../mediciones/consolidado.js';
import {
  type DatosCompletitud,
  SECCIONES,
} from '../proyectos-docentes/entities/secciones.js';
import { imagenDemo } from './imagen-demo.js';
import { ESCALA } from './programa.js';
import {
  COHORTE_2026_1,
  COHORTE_MACROECONOMIA,
  COHORTE_RF31,
  ESTUDIANTES_DEMO,
  GRUPO_DEMO,
  MEDICION_2026_1,
  MEDICION_CASO_RF31,
  MEDICION_MACROECONOMIA,
  type MedicionDemo,
  nivelPorConteo,
  PREFIJO_DEMO,
  type ProyectoDemo,
  PROYECTOS_DEMO,
  TAMANO_CASO_RF31,
} from './recorrido-demo.js';

/** Las secciones pendientes de una definición, con la misma regla del diligenciamiento. */
function pendientesDe(proyecto: ProyectoDemo): string[] {
  const datos: DatosCompletitud = {
    descripcion: proyecto.descripcion,
    raps: proyecto.raps.map((rap) => ({ id: rap, codigo: null, numero: rap })),
    racs: proyecto.racs.map((rac) => ({
      codigo: rac.codigo,
      idsRap: [rac.rap],
      evaluaciones: rac.evaluaciones.length,
    })),
    estrategias: proyecto.estrategias.length,
    contenidos: {
      numeroSemanas: 16,
      semanasConTema: proyecto.temas.map((_, i) => i + 1),
    },
    bibliografia: proyecto.bibliografia.length,
  };
  return SECCIONES.flatMap((seccion) => seccion.pendientes(datos));
}

/** Consolida una medición de demostración con su cohorte, como lo haría la aplicación. */
function consolidarDemo(medicion: MedicionDemo, tamano: number) {
  return consolidar({
    niveles: ESCALA.niveles.map(({ valor, etiqueta }) => ({ valor, etiqueta })),
    umbralCumplimiento: ESCALA.umbral_cumplimiento,
    porcentajeEsperado: null,
    tamanoCohorte: tamano,
    totalEstudiantes: tamano,
    indicadores: medicion.conteos.map(({ indicador }) => {
      const conteos = new Map<number, number>();
      for (let posicion = 0; posicion < tamano; posicion++) {
        const nivel = nivelPorConteo(medicion.conteos, posicion, indicador);
        conteos.set(nivel, (conteos.get(nivel) ?? 0) + 1);
      }
      return {
        idIndicador: indicador,
        numero: indicador,
        descripcion: null,
        instrumento: null,
        descripcionInstrumento: null,
        conteos,
      };
    }),
  });
}

const partesDelLogro = (consolidado: ReturnType<typeof consolidarDemo>) =>
  consolidado.indicadores.map((i) => ({
    enCumplimiento: i.enCumplimiento,
    valoraciones: i.muestra,
  }));

describe('Recorrido de demostración', () => {
  it('trae estudiantes ficticios, con documentos DEMO- y nombres sin repetir', () => {
    const documentos = ESTUDIANTES_DEMO.map((e) => e.documento);
    expect(new Set(documentos).size).toBe(ESTUDIANTES_DEMO.length);
    expect(documentos.every((d) => d.startsWith(PREFIJO_DEMO))).toBe(true);
    const nombres = ESTUDIANTES_DEMO.map((e) => `${e.nombres} ${e.apellidos}`);
    expect(new Set(nombres).size).toBe(ESTUDIANTES_DEMO.length);
  });

  it('reparte los estudiantes en tres cursos sin repetir a nadie', () => {
    expect(COHORTE_RF31).toHaveLength(TAMANO_CASO_RF31);
    expect(COHORTE_MACROECONOMIA).toHaveLength(20);
    expect(COHORTE_2026_1).toHaveLength(28);
    const todos = [
      ...COHORTE_RF31,
      ...COHORTE_MACROECONOMIA,
      ...COHORTE_2026_1,
    ];
    expect(new Set(todos.map((e) => e.documento)).size).toBe(todos.length);
  });

  it.each([
    ['caso de RF-31', MEDICION_CASO_RF31, COHORTE_RF31.length],
    ['Macroeconomía', MEDICION_MACROECONOMIA, COHORTE_MACROECONOMIA.length],
    ['2026-1', MEDICION_2026_1, COHORTE_2026_1.length],
  ])(
    'los niveles de la medición %s reproducen sus conteos',
    (_, medicion, tamano) => {
      for (const { indicador, porNivel } of medicion.conteos) {
        const conteos = new Map<number, number>();
        for (let posicion = 0; posicion < tamano; posicion++) {
          const nivel = nivelPorConteo(medicion.conteos, posicion, indicador);
          conteos.set(nivel, (conteos.get(nivel) ?? 0) + 1);
        }
        expect(Object.fromEntries(conteos)).toEqual(porNivel);
      }
    },
  );

  it('caso de RF-31: 85,29 %, 70,59 %, 50 % y 50 %, y un logro de 63,97 % (87 de 136)', () => {
    const consolidado = consolidarDemo(MEDICION_CASO_RF31, TAMANO_CASO_RF31);
    expect(
      consolidado.indicadores.map((i) => i.porcentajeCumplimiento),
    ).toEqual([85.29, 70.59, 50, 50]);
    expect(logroDelRap(partesDelLogro(consolidado))).toEqual({
      porcentaje: 63.97,
      enCumplimiento: 87,
      valoraciones: 136,
    });
  });

  it('2026-1, más bajo y con la misma rúbrica: 50 % (56 de 112)', () => {
    const consolidado = consolidarDemo(MEDICION_2026_1, COHORTE_2026_1.length);
    expect(
      consolidado.indicadores.map((i) => i.porcentajeCumplimiento),
    ).toEqual([64.29, 53.57, 42.86, 39.29]);
    expect(logroDelRap(partesDelLogro(consolidado))).toEqual({
      porcentaje: 50,
      enCumplimiento: 56,
      valoraciones: 112,
    });
  });

  it('el reporte de 2026-2 suma las valoraciones de las dos asignaturas: 64,81 % (140 de 216)', () => {
    const macro = consolidarDemo(
      MEDICION_MACROECONOMIA,
      COHORTE_MACROECONOMIA.length,
    );
    expect(macro.indicadores.map((i) => i.porcentajeCumplimiento)).toEqual([
      80, 70, 55, 60,
    ]);
    expect(logroDelRap(partesDelLogro(macro)).porcentaje).toBe(66.25);
    const caso = consolidarDemo(MEDICION_CASO_RF31, TAMANO_CASO_RF31);
    expect(
      logroDelRap([...partesDelLogro(caso), ...partesDelLogro(macro)]),
    ).toEqual({ porcentaje: 64.81, enCumplimiento: 140, valoraciones: 216 });
  });

  it('mide solo el RAP 2, en proyectos aprobados o cerrados, con su cohorte completa', () => {
    for (const proyecto of PROYECTOS_DEMO.filter((p) => p.medicion)) {
      expect(proyecto.raps).toContain(2);
      expect(['aprobado', 'cerrado']).toContain(proyecto.estado);
      for (const { porNivel } of proyecto.medicion?.conteos ?? []) {
        const total = Object.values(porNivel).reduce((a, b) => a + b, 0);
        expect(total).toBe(proyecto.matriculados?.length);
      }
    }
  });

  it('cubre los estados del recorrido y solo el de diligenciamiento tiene pendientes', () => {
    expect(new Set(PROYECTOS_DEMO.map((p) => p.estado))).toEqual(
      new Set([
        'en_diligenciamiento',
        'enviado',
        'devuelto',
        'aprobado',
        'cerrado',
      ]),
    );
    for (const proyecto of PROYECTOS_DEMO) {
      // Solo se envía a revisión un proyecto completo (RF-17, p2).
      expect(pendientesDe(proyecto).length > 0).toBe(
        proyecto.estado === 'en_diligenciamiento',
      );
    }
  });

  it('pone evidencias en RAP del proyecto, y en más de un RAP del programa', () => {
    const rapsConEvidencias = new Set<number>();
    for (const proyecto of PROYECTOS_DEMO) {
      for (const evidencia of proyecto.evidencias ?? []) {
        const rap = evidencia.rap ?? proyecto.raps[0];
        expect(proyecto.raps).toContain(rap);
        rapsConEvidencias.add(rap);
      }
    }
    expect([...rapsConEvidencias].sort()).toEqual([2, 3, 7]);
  });

  it('no repite asignatura y período, y el grupo es de demostración', () => {
    const claves = PROYECTOS_DEMO.map((p) => `${p.asignatura}|${p.periodo}`);
    expect(new Set(claves).size).toBe(claves.length);
    expect(GRUPO_DEMO.startsWith(PREFIJO_DEMO)).toBe(true);
  });

  it('devuelve con observaciones sobre secciones que existen', () => {
    const claves = new Set(SECCIONES.map((seccion) => seccion.clave));
    const devuelto = PROYECTOS_DEMO.find((p) => p.estado === 'devuelto');
    expect(devuelto?.devolucion?.observaciones.length).toBeGreaterThan(0);
    for (const { seccion } of devuelto?.devolucion?.observaciones ?? []) {
      expect(claves.has(seccion)).toBe(true);
    }
  });

  it('genera imágenes PNG distintas, sin fotos de personas', () => {
    const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const una = imagenDemo(3);
    expect(una.subarray(0, 8)).toEqual(firma);
    expect(una.equals(imagenDemo(6))).toBe(false);
    expect(una.equals(imagenDemo(3))).toBe(true);
  });
});
