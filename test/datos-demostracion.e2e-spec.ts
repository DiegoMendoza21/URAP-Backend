import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { PERIODO, USUARIOS_DEMO } from '../src/datos-iniciales/demostracion.js';
import {
  GRUPO_DEMO,
  PERIODO_CERRADO_DEMO,
  SEMANAS_INCUMPLIDAS,
  TAMANO_CASO_RF31,
} from '../src/datos-iniciales/recorrido-demo.js';
import { sembrarEn } from '../src/datos-iniciales/sembrar-datos.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import {
  consolidar,
  contarPorIndicador,
  logroDelRap,
  nivelesDeEscala,
} from '../src/mediciones/consolidado.js';
import { alertaDeSesion } from '../src/sesiones/alertas.js';
import { aTextoFecha } from '../src/sesiones/calendario.js';

/** Para deshacer el sembrado al terminar: la base queda como estaba. */
class Revertir extends Error {}

// Requiere el .env configurado y la base local levantada. Siembra los datos base y los de
// demostración dentro de una transacción, comprueba el recorrido y la revierte: no deja nada en
// la base, tenga o no el seed. Las imágenes de las evidencias no se escriben aquí.
describe('Datos de demostración del recorrido (e2e)', () => {
  let prisma: PrismaService;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = modulo.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    cerrar = () => app.close();
  });

  afterAll(async () => {
    await cerrar?.();
  });

  /** Siembra en una transacción, deja que `revisar` la consulte y la revierte. */
  async function sembrarYRevisar(
    revisar: (tx: Prisma.TransactionClient, archivos: number) => Promise<void>,
  ): Promise<void> {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const { archivos } = await sembrarEn(tx, {
            hashesUsuarios: new Map(
              USUARIOS_DEMO.map(({ correo }) => [
                correo,
                'hash-solo-de-prueba',
              ]),
            ),
            hoy: '2026-11-08',
          });
          await revisar(tx, archivos.length);
          throw new Revertir();
        },
        { timeout: 120_000 },
      ),
    ).rejects.toBeInstanceOf(Revertir);
  }

  it('reproduce el caso de RF-31: 85,29 %, 70,59 %, 50 %, 50 % y 63,97 % (87 de 136)', async () => {
    await sembrarYRevisar(async (tx) => {
      const medicion = await tx.medicion_rap.findFirstOrThrow({
        where: {
          estado: 'cerrada',
          rap: { numero: 2 },
          rubrica: { version: 1 },
          proyecto_docente: {
            grupo: GRUPO_DEMO,
            periodo_academico: { codigo: PERIODO.codigo },
            asignatura: { nombre: 'Finanzas a corto plazo' },
          },
        },
        select: {
          tamano_cohorte: true,
          porcentaje_esperado: true,
          rubrica: {
            select: {
              escala_valoracion: {
                select: {
                  umbral_cumplimiento: true,
                  nivel_escala: {
                    select: { valor: true, etiqueta: true },
                    orderBy: { valor: 'asc' },
                  },
                },
              },
            },
          },
          medicion_indicador: {
            select: {
              id_indicador: true,
              indicador_rap: { select: { numero: true } },
              valoracion_estudiante: {
                select: { nivel_escala: { select: { valor: true } } },
              },
            },
            orderBy: { indicador_rap: { numero: 'asc' } },
          },
        },
      });
      const escala = medicion.rubrica?.escala_valoracion;
      const conteos = contarPorIndicador(
        medicion.medicion_indicador.flatMap((fila) =>
          fila.valoracion_estudiante.map((valoracion) => ({
            idIndicador: fila.id_indicador as number,
            valor: valoracion.nivel_escala?.valor as number,
          })),
        ),
      );
      const consolidado = consolidar({
        niveles: nivelesDeEscala(escala?.nivel_escala ?? []),
        umbralCumplimiento: escala?.umbral_cumplimiento as number,
        porcentajeEsperado:
          medicion.porcentaje_esperado === null
            ? null
            : Number(medicion.porcentaje_esperado),
        tamanoCohorte: medicion.tamano_cohorte,
        totalEstudiantes: TAMANO_CASO_RF31,
        indicadores: medicion.medicion_indicador.map((fila) => ({
          idIndicador: fila.id_indicador as number,
          numero: fila.indicador_rap?.numero ?? null,
          descripcion: null,
          instrumento: null,
          descripcionInstrumento: null,
          conteos: conteos.get(fila.id_indicador as number) ?? new Map(),
        })),
      });

      expect(medicion.tamano_cohorte).toBe(34);
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
  }, 180_000);

  it('deja proyectos en cada estado, sesiones registradas, vencidas e incumplidas, y evidencias', async () => {
    await sembrarYRevisar(async (tx, archivos) => {
      const proyectos = await tx.proyecto_docente.findMany({
        where: { grupo: GRUPO_DEMO },
        select: {
          estado_proyecto: { select: { codigo: true } },
          periodo_academico: {
            select: { codigo: true, cerrado: true, fecha_fin: true },
          },
          asignatura: { select: { nombre: true } },
          revision_proyecto: {
            select: {
              resultado: true,
              observacion_revision: { select: { seccion: true } },
            },
          },
          sesion_clase: {
            select: {
              fecha: true,
              estado: true,
              tipo_sesion: { select: { codigo: true } },
            },
          },
          evidencia_rap: { select: { rap: { select: { numero: true } } } },
          _count: { select: { matricula: true, evidencia_rap: true } },
        },
      });
      const estados = new Set(proyectos.map((p) => p.estado_proyecto?.codigo));
      const porEstado = new Map(
        proyectos.map((p) => [p.estado_proyecto?.codigo, p]),
      );
      const curso = (asignatura: string, periodo: string) =>
        proyectos.find(
          (p) =>
            p.asignatura?.nombre === asignatura &&
            p.periodo_academico?.codigo === periodo,
        );
      expect([...estados].sort()).toEqual([
        'aprobado',
        'cerrado',
        'devuelto',
        'en_diligenciamiento',
        'enviado',
      ]);

      // Revisión (EP-07): el devuelto trae sus observaciones; el enviado, solo el envío.
      const devuelto = porEstado.get('devuelto');
      expect(
        devuelto?.revision_proyecto.flatMap((r) =>
          r.observacion_revision.map((o) => o.seccion),
        ),
      ).toEqual(expect.arrayContaining(['estrategias', 'bibliografia']));
      expect(
        porEstado.get('enviado')?.revision_proyecto.map((r) => r.resultado),
      ).toEqual(['enviado']);

      // El caso de RF-31: 34 matriculados, evidencias y clases registradas y sin registrar.
      const aprobado = curso('Finanzas a corto plazo', PERIODO.codigo);
      expect(aprobado?._count.matricula).toBe(34);
      expect(aprobado?._count.evidencia_rap).toBeGreaterThan(0);
      const clases = (aprobado?.sesion_clase ?? []).filter(
        (s) => s.tipo_sesion?.codigo !== 'festivo',
      );
      expect(clases.some((s) => s.estado === 'registrada')).toBe(true);
      expect(clases.some((s) => s.estado !== 'registrada')).toBe(true);

      // El período cerrado: una sesión incumplida por cada semana de SEMANAS_INCUMPLIDAS.
      const cerrado = curso(
        'Finanzas a corto plazo',
        PERIODO_CERRADO_DEMO.codigo,
      );
      expect(cerrado?.periodo_academico?.codigo).toBe(
        PERIODO_CERRADO_DEMO.codigo,
      );
      const alertas = (cerrado?.sesion_clase ?? []).map((sesion) =>
        alertaDeSesion(
          {
            fecha: aTextoFecha(sesion.fecha as Date),
            diligenciada: sesion.estado === 'registrada',
            esFestivo: sesion.tipo_sesion?.codigo === 'festivo',
          },
          {
            hoy: '2026-11-08',
            umbralDias: 2,
            periodoCerrado: true,
            fechaFinPeriodo: PERIODO_CERRADO_DEMO.fecha_fin,
          },
        ),
      );
      expect(alertas.filter((a) => a.alerta === 'incumplida')).toHaveLength(
        SEMANAS_INCUMPLIDAS.length,
      );

      // Evidencias en más de un RAP (RF-24), para la contribución RAC-RAP.
      expect(
        [
          ...new Set(
            proyectos.flatMap((p) => p.evidencia_rap.map((e) => e.rap?.numero)),
          ),
        ].sort(),
      ).toEqual([2, 3, 7]);

      // Una imagen por cada evidencia de demostración, para el almacenamiento documental.
      const evidencias = proyectos.reduce(
        (suma, p) => suma + p._count.evidencia_rap,
        0,
      );
      expect(archivos).toBe(evidencias);
    });
  }, 180_000);

  it('el logro del RAP 2 suma las asignaturas del período y deja con qué comparar (RF-32)', async () => {
    await sembrarYRevisar(async (tx) => {
      /** Logro del RAP 2 en un período: todas sus mediciones cerradas de demostración juntas. */
      const logroDelPeriodo = async (codigo: string) => {
        const valoraciones = await tx.valoracion_estudiante.findMany({
          where: {
            medicion_indicador: {
              is: {
                medicion_rap: {
                  is: {
                    estado: 'cerrada',
                    rap: { numero: 2 },
                    proyecto_docente: {
                      grupo: GRUPO_DEMO,
                      periodo_academico: { codigo },
                    },
                  },
                },
              },
            },
          },
          select: { nivel_escala: { select: { valor: true } } },
        });
        const umbral = 3;
        return logroDelRap([
          {
            enCumplimiento: valoraciones.filter(
              (v) => (v.nivel_escala?.valor ?? 0) >= umbral,
            ).length,
            valoraciones: valoraciones.length,
          },
        ]);
      };
      // 2026-2: Finanzas a corto plazo (87 de 136) y Macroeconomía (53 de 80), sumadas.
      expect(await logroDelPeriodo(PERIODO.codigo)).toEqual({
        porcentaje: 64.81,
        enCumplimiento: 140,
        valoraciones: 216,
      });
      // 2026-1, el período anterior, más bajo y con la misma rúbrica.
      expect(await logroDelPeriodo(PERIODO_CERRADO_DEMO.codigo)).toEqual({
        porcentaje: 50,
        enCumplimiento: 56,
        valoraciones: 112,
      });
      const versiones = await tx.medicion_rap.findMany({
        where: { proyecto_docente: { grupo: GRUPO_DEMO } },
        select: {
          rap: { select: { numero: true } },
          rubrica: { select: { version: true } },
        },
      });
      expect(versiones).toHaveLength(3);
      expect(
        versiones.every((m) => m.rap?.numero === 2 && m.rubrica?.version === 1),
      ).toBe(true);
    });
  }, 180_000);
});
