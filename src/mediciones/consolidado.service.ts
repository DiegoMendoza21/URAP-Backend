import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  type Consolidado,
  consolidar,
  nivelesDeEscala,
} from './consolidado.js';

/**
 * Consolidado de varias mediciones a la vez (RF-31), para la lista de mediciones y el reporte
 * de logro (RF-32). Cuenta las valoraciones con una sola consulta agrupada por indicador y
 * nivel, y aplica la misma regla que la hoja de cada medición (`consolidar`).
 */
@Injectable()
export class ConsolidadoService {
  constructor(private readonly prisma: PrismaService) {}

  async deMediciones(
    idsMedicion: readonly number[],
  ): Promise<Map<number, Consolidado>> {
    const ids = [...new Set(idsMedicion)];
    if (ids.length === 0) {
      return new Map();
    }
    const [mediciones, grupos] = await Promise.all([
      this.prisma.medicion_rap.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          tamano_cohorte: true,
          porcentaje_esperado: true,
          rubrica: { select: { id_escala: true } },
          proyecto_docente: {
            select: {
              asignatura: {
                select: {
                  plan_estudio: {
                    select: {
                      programa: { select: { id_escala_activa: true } },
                    },
                  },
                },
              },
            },
          },
          medicion_indicador: {
            select: {
              id: true,
              id_indicador: true,
              instrumento: true,
              descripcion_instrumento: true,
              indicador_rap: { select: { numero: true, descripcion: true } },
            },
            orderBy: { indicador_rap: { numero: 'asc' } },
          },
        },
      }),
      this.prisma.valoracion_estudiante.groupBy({
        by: ['id_medicion_indicador', 'id_nivel'],
        where: { medicion_indicador: { is: { id_medicion: { in: ids } } } },
        _count: { _all: true },
      }),
    ]);

    // La escala de cada medición: la de su rúbrica o, si no la indica, la del programa.
    const escalaDe = (medicion: (typeof mediciones)[number]) =>
      medicion.rubrica?.id_escala ??
      medicion.proyecto_docente?.asignatura?.plan_estudio.programa
        ?.id_escala_activa ??
      null;
    const idsEscala = [
      ...new Set(
        mediciones.map(escalaDe).filter((id): id is number => id !== null),
      ),
    ];
    const escalas = new Map(
      (
        await this.prisma.escala_valoracion.findMany({
          where: { id: { in: idsEscala } },
          include: { nivel_escala: { orderBy: { valor: 'asc' } } },
        })
      ).map((escala) => [escala.id, escala]),
    );
    const valorDeNivel = new Map<number, number>();
    for (const escala of escalas.values()) {
      for (const nivel of escala.nivel_escala) {
        if (nivel.valor !== null) {
          valorDeNivel.set(nivel.id, nivel.valor);
        }
      }
    }
    // Conteos por fila de medicion_indicador y valor de nivel.
    const conteos = new Map<number, Map<number, number>>();
    for (const grupo of grupos) {
      const valor =
        grupo.id_nivel === null ? undefined : valorDeNivel.get(grupo.id_nivel);
      if (grupo.id_medicion_indicador === null || valor === undefined) {
        continue;
      }
      const porValor =
        conteos.get(grupo.id_medicion_indicador) ?? new Map<number, number>();
      porValor.set(valor, (porValor.get(valor) ?? 0) + grupo._count._all);
      conteos.set(grupo.id_medicion_indicador, porValor);
    }

    const resultado = new Map<number, Consolidado>();
    for (const medicion of mediciones) {
      const idEscala = escalaDe(medicion);
      const escala = idEscala === null ? undefined : escalas.get(idEscala);
      if (!escala || escala.umbral_cumplimiento === null) {
        continue;
      }
      resultado.set(
        medicion.id,
        consolidar({
          niveles: nivelesDeEscala(escala.nivel_escala),
          umbralCumplimiento: escala.umbral_cumplimiento,
          porcentajeEsperado:
            medicion.porcentaje_esperado === null
              ? null
              : Number(medicion.porcentaje_esperado),
          tamanoCohorte: medicion.tamano_cohorte,
          totalEstudiantes: null,
          indicadores: medicion.medicion_indicador
            .filter((fila) => fila.id_indicador !== null)
            .map((fila) => ({
              idIndicador: fila.id_indicador as number,
              numero: fila.indicador_rap?.numero ?? null,
              descripcion: fila.indicador_rap?.descripcion ?? null,
              instrumento: fila.instrumento,
              descripcionInstrumento: fila.descripcion_instrumento,
              conteos: conteos.get(fila.id) ?? new Map(),
            })),
        }),
      );
    }
    return resultado;
  }
}
