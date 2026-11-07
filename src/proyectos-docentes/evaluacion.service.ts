import { Injectable, NotFoundException } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ActividadEvaluacionDto,
  GuardarEvaluacionRacDto,
  RacEvaluacionDto,
  SeccionEvaluacionDto,
} from './dto/planeacion.dto.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { MENSAJE_RAC_NO_EXISTE } from './rac.service.js';

type Tx = Prisma.TransactionClient;

/** `evaluacion_rac` no tiene columna de orden: el de registro (id) es el del docente. */
const INCLUIR_EVALUACION = {
  evaluacion_rac: { orderBy: { id: 'asc' } },
  rac_rap: { include: { rap: true } },
} satisfies Prisma.racInclude;

type RacConEvaluacion = Prisma.racGetPayload<{
  include: typeof INCLUIR_EVALUACION;
}>;

function aActividad(
  fila: RacConEvaluacion['evaluacion_rac'][number],
): ActividadEvaluacionDto {
  return {
    id: fila.id,
    actividad: fila.descripcion ?? '',
    instrumento: fila.instrumento ?? '',
    porcentaje: fila.porcentaje === null ? null : fila.porcentaje.toNumber(),
  };
}

/** Suma de los pesos que se registraron, con dos decimales; nulo si no hay ninguno. */
export function pesoTotal(
  actividades: readonly { porcentaje: number | null }[],
): number | null {
  const pesos = actividades
    .map((actividad) => actividad.porcentaje)
    .filter((peso): peso is number => peso !== null);
  if (pesos.length === 0) {
    return null;
  }
  return Math.round(pesos.reduce((suma, peso) => suma + peso, 0) * 100) / 100;
}

function aRacEvaluacion(rac: RacConEvaluacion): RacEvaluacionDto {
  const actividades = rac.evaluacion_rac.map(aActividad);
  return {
    id: rac.id,
    codigo: rac.codigo ?? '',
    enunciado: rac.descripcion ?? '',
    raps: [...rac.rac_rap]
      .sort((a, b) => (a.rap.numero ?? 0) - (b.rap.numero ?? 0))
      .map(({ rap }) => rap.codigo ?? `RAP ${rap.numero ?? rap.id}`),
    actividades,
    pesoTotal: pesoTotal(actividades),
  };
}

/** Lo que se guarda en `auditoria` de la evaluación de un RAC. */
function instantanea(
  actividades: readonly {
    actividad: string;
    instrumento: string;
    porcentaje?: number | null;
  }[],
): Prisma.InputJsonValue {
  return actividades.map(({ actividad, instrumento, porcentaje }) => ({
    actividad,
    instrumento,
    porcentaje: porcentaje ?? null,
  }));
}

/**
 * Punto 5 «Evaluación de los resultados de aprendizaje» (RF-14, HU-06-05): para cada RAC del
 * proyecto, las actividades e instrumentos con los que se evaluará. Cada RAC se guarda por
 * separado (HU-06-08) y la respuesta trae la sección completa.
 */
@Injectable()
export class EvaluacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
  ) {}

  async seccion(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<SeccionEvaluacionDto> {
    await this.edicion.consultable(usuario, id);
    return this.leerSeccion(this.prisma, id);
  }

  /** RF-14, p3 y p4: reemplaza las actividades de evaluación de un RAC. */
  async guardar(
    usuario: UsuarioSesion,
    id: number,
    idRac: number,
    { actividades }: GuardarEvaluacionRacDto,
  ): Promise<SeccionEvaluacionDto> {
    return this.edicion.editar(usuario, id, async (tx) => {
      const rac = await tx.rac.findFirst({
        where: { id: idRac, id_proyecto_docente: id },
        include: INCLUIR_EVALUACION,
      });
      if (!rac) {
        throw new NotFoundException(MENSAJE_RAC_NO_EXISTE);
      }
      await tx.evaluacion_rac.deleteMany({ where: { id_rac: idRac } });
      if (actividades.length > 0) {
        // Un solo INSERT: los id quedan en el orden del listado, que es el que se muestra.
        await tx.evaluacion_rac.createMany({
          data: actividades.map((actividad) => ({
            id_rac: idRac,
            descripcion: actividad.actividad,
            instrumento: actividad.instrumento,
            porcentaje: actividad.porcentaje ?? null,
          })),
        });
      }
      return {
        resultado: await this.leerSeccion(tx, id),
        auditoria: {
          accion: 'actualizar',
          tabla: 'rac',
          idRegistro: idRac,
          anterior: {
            evaluacion: instantanea(rac.evaluacion_rac.map(aActividad)),
          },
          nuevo: { evaluacion: instantanea(actividades) },
        },
      };
    });
  }

  /** RF-14, p2 y p4: los RAC del proyecto con su evaluación y los que todavía no tienen. */
  private async leerSeccion(
    cliente: Tx | PrismaService,
    id: number,
  ): Promise<SeccionEvaluacionDto> {
    const racs = await cliente.rac.findMany({
      where: { id_proyecto_docente: id },
      include: INCLUIR_EVALUACION,
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
    const dtos = racs.map(aRacEvaluacion);
    return {
      racs: dtos,
      racsSinEvaluacion: dtos
        .filter((rac) => rac.actividades.length === 0)
        .map((rac) => rac.id),
    };
  }
}
