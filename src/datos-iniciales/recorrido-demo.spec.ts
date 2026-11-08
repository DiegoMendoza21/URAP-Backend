import { consolidar, logroDelRap } from '../mediciones/consolidado.js';
import {
  type DatosCompletitud,
  SECCIONES,
} from '../proyectos-docentes/entities/secciones.js';
import { imagenDemo } from './imagen-demo.js';
import { ESCALA } from './programa.js';
import {
  CONTEOS_CASO_RF31,
  ESTUDIANTES_DEMO,
  GRUPO_DEMO,
  nivelDelCasoRf31,
  PREFIJO_DEMO,
  type ProyectoDemo,
  PROYECTOS_DEMO,
  TOTAL_ESTUDIANTES_DEMO,
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

describe('Recorrido de demostración', () => {
  it('trae 34 estudiantes ficticios, con documentos DEMO- y nombres sin repetir', () => {
    expect(ESTUDIANTES_DEMO).toHaveLength(TOTAL_ESTUDIANTES_DEMO);
    const documentos = ESTUDIANTES_DEMO.map((e) => e.documento);
    expect(new Set(documentos).size).toBe(TOTAL_ESTUDIANTES_DEMO);
    expect(documentos.every((d) => d.startsWith(PREFIJO_DEMO))).toBe(true);
    const nombres = ESTUDIANTES_DEMO.map((e) => `${e.nombres} ${e.apellidos}`);
    expect(new Set(nombres).size).toBe(TOTAL_ESTUDIANTES_DEMO);
  });

  it('reproduce los conteos de la medición real del RAP 2 (caso de RF-31)', () => {
    for (const { indicador, porNivel } of CONTEOS_CASO_RF31) {
      const conteos = new Map<number, number>();
      ESTUDIANTES_DEMO.forEach((_, posicion) => {
        const nivel = nivelDelCasoRf31(posicion, indicador);
        conteos.set(nivel, (conteos.get(nivel) ?? 0) + 1);
      });
      expect(Object.fromEntries(conteos)).toEqual(porNivel);
    }
  });

  it('da 85,29 %, 70,59 %, 50 % y 50 %, y un logro de 63,97 % (87 de 136)', () => {
    const consolidado = consolidar({
      niveles: ESCALA.niveles.map(({ valor, etiqueta }) => ({
        valor,
        etiqueta,
      })),
      umbralCumplimiento: ESCALA.umbral_cumplimiento,
      porcentajeEsperado: null,
      tamanoCohorte: TOTAL_ESTUDIANTES_DEMO,
      totalEstudiantes: TOTAL_ESTUDIANTES_DEMO,
      indicadores: CONTEOS_CASO_RF31.map(({ indicador }) => {
        const conteos = new Map<number, number>();
        ESTUDIANTES_DEMO.forEach((_, posicion) => {
          const nivel = nivelDelCasoRf31(posicion, indicador);
          conteos.set(nivel, (conteos.get(nivel) ?? 0) + 1);
        });
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
    expect(
      consolidado.indicadores.map((i) => i.porcentajeCumplimiento),
    ).toEqual([85.29, 70.59, 50, 50]);
    expect(
      logroDelRap(
        consolidado.indicadores.map((i) => ({
          enCumplimiento: i.enCumplimiento,
          valoraciones: i.muestra,
        })),
      ),
    ).toEqual({ porcentaje: 63.97, enCumplimiento: 87, valoraciones: 136 });
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
