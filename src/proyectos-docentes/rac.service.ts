import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  GuardarRacDto,
  RacDto,
  SeccionRacDto,
} from './dto/diligenciamiento.dto.js';
import {
  type Auditable,
  EdicionProyectoService,
  soloCambios,
} from './edicion-proyecto.service.js';
import { aRap } from './mapeo.js';

export const MENSAJE_RAC_NO_EXISTE = 'El RAC no existe en este proyecto.';
export const MENSAJE_RAP_REPETIDO =
  'Un RAC no puede asociarse dos veces al mismo RAP.';
export const MENSAJE_RAP_FUERA_DEL_PROYECTO =
  'Solo puede asociar el RAC a los RAP seleccionados para este proyecto docente.';
export const MENSAJE_RAC_CON_EVALUACION =
  'Este RAC ya tiene evaluaciones registradas. Quítelas antes de eliminarlo.';

export function mensajeCodigoRepetido(codigo: string): string {
  return `Ya existe un RAC con el código «${codigo}» en este proyecto.`;
}

type Tx = Prisma.TransactionClient;

const INCLUIR_RAC = {
  rac_rap: { include: { rap: true } },
} satisfies Prisma.racInclude;

type RacConRaps = Prisma.racGetPayload<{ include: typeof INCLUIR_RAC }>;

function aRac(rac: RacConRaps): RacDto {
  return {
    id: rac.id,
    codigo: rac.codigo ?? '',
    enunciado: rac.descripcion ?? '',
    orden: rac.orden,
    raps: [...rac.rac_rap]
      .sort((a, b) => (a.rap.numero ?? 0) - (b.rap.numero ?? 0))
      .map((relacion) => ({
        idRap: relacion.id_rap,
        codigo: relacion.rap.codigo,
        numero: relacion.rap.numero,
        descripcionContribucion: relacion.descripcion_contribucion,
      })),
  };
}

/** Lo que se guarda en `auditoria` de un RAC creado o eliminado. */
function instantanea(rac: RacConRaps): Record<string, Prisma.InputJsonValue> {
  return {
    codigo: rac.codigo ?? '',
    enunciado: rac.descripcion ?? '',
    raps: [...rac.rac_rap]
      .sort((a, b) => a.id_rap - b.id_rap)
      .map((relacion) => ({
        idRap: relacion.id_rap,
        descripcionContribucion: relacion.descripcion_contribucion,
      })),
  };
}

/** Solo los campos que cambiaron; nulo si se guardó el RAC tal como estaba. */
function auditarActualizacion(
  idRac: number,
  anterior: RacConRaps,
  actualizado: RacConRaps,
): Auditable | null {
  const cambios = soloCambios(instantanea(anterior), instantanea(actualizado));
  return cambios
    ? { accion: 'actualizar', tabla: 'rac', idRegistro: idRac, ...cambios }
    : null;
}

/**
 * Punto 3 del proyecto docente: los RAC del curso agrupados por RAP (RF-12, HU-06-02) y su
 * asociación con uno o varios RAP (`rac_rap`, HU-06-03). Cada RAC se guarda por separado
 * (HU-06-08). Las respuestas de escritura devuelven la sección completa para que la pantalla
 * no tenga que pedirla otra vez.
 */
@Injectable()
export class RacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
  ) {}

  async seccion(usuario: UsuarioSesion, id: number): Promise<SeccionRacDto> {
    await this.edicion.consultable(usuario, id);
    return this.leerSeccion(this.prisma, id);
  }

  /** RF-12, p3-p4: registra un RAC con su relación con el o los RAP. */
  async crear(
    usuario: UsuarioSesion,
    id: number,
    datos: GuardarRacDto,
  ): Promise<SeccionRacDto> {
    this.validarRapsSinRepetir(datos);
    return this.edicion.editar(usuario, id, async (tx) => {
      await this.validarContraProyecto(tx, id, datos, null);
      const ultimo = await tx.rac.aggregate({
        where: { id_proyecto_docente: id },
        _max: { orden: true },
      });
      const creado = await tx.rac.create({
        data: {
          id_proyecto_docente: id,
          codigo: datos.codigo,
          descripcion: datos.enunciado,
          orden: (ultimo._max.orden ?? 0) + 1,
          rac_rap: { create: this.relaciones(datos) },
        },
        include: INCLUIR_RAC,
      });
      return {
        resultado: await this.leerSeccion(tx, id),
        auditoria: {
          accion: 'crear',
          tabla: 'rac',
          idRegistro: creado.id,
          nuevo: instantanea(creado),
        },
      };
    });
  }

  /** Cambia el código, el enunciado o los RAP de un RAC. Los RAP se reemplazan completos. */
  async actualizar(
    usuario: UsuarioSesion,
    id: number,
    idRac: number,
    datos: GuardarRacDto,
  ): Promise<SeccionRacDto> {
    this.validarRapsSinRepetir(datos);
    return this.edicion.editar(usuario, id, async (tx) => {
      const anterior = await this.racDelProyecto(tx, id, idRac);
      await this.validarContraProyecto(tx, id, datos, idRac);
      await tx.rac_rap.deleteMany({ where: { id_rac: idRac } });
      const actualizado = await tx.rac.update({
        where: { id: idRac },
        data: {
          codigo: datos.codigo,
          descripcion: datos.enunciado,
          rac_rap: { create: this.relaciones(datos) },
        },
        include: INCLUIR_RAC,
      });
      return {
        resultado: await this.leerSeccion(tx, id),
        auditoria: auditarActualizacion(idRac, anterior, actualizado),
      };
    });
  }

  /**
   * Elimina un RAC mientras el proyecto está en diligenciamiento. Es un borrador del docente
   * que todavía no tiene trazabilidad (sin evaluaciones ni mediciones), por eso no se inactiva.
   */
  async eliminar(
    usuario: UsuarioSesion,
    id: number,
    idRac: number,
  ): Promise<SeccionRacDto> {
    return this.edicion.editar(usuario, id, async (tx) => {
      const anterior = await this.racDelProyecto(tx, id, idRac);
      if ((await tx.evaluacion_rac.count({ where: { id_rac: idRac } })) > 0) {
        throw new ConflictException(MENSAJE_RAC_CON_EVALUACION);
      }
      await tx.rac_rap.deleteMany({ where: { id_rac: idRac } });
      await tx.rac.delete({ where: { id: idRac } });
      return {
        resultado: await this.leerSeccion(tx, id),
        auditoria: {
          accion: 'eliminar',
          tabla: 'rac',
          idRegistro: idRac,
          anterior: instantanea(anterior),
        },
      };
    });
  }

  /** HU-06-03: un RAC no se asocia dos veces al mismo RAP. */
  private validarRapsSinRepetir({ raps }: GuardarRacDto): void {
    const ids = new Set(raps.map((rap) => rap.idRap));
    if (ids.size !== raps.length) {
      throw new BadRequestException(MENSAJE_RAP_REPETIDO);
    }
  }

  /** Los RAP deben ser del proyecto y el código no puede repetirse en él. */
  private async validarContraProyecto(
    tx: Tx,
    id: number,
    { codigo, raps }: GuardarRacDto,
    idRacActual: number | null,
  ): Promise<void> {
    const delProyecto = await tx.proyecto_docente_rap.count({
      where: {
        id_proyecto_docente: id,
        id_rap: { in: raps.map((rap) => rap.idRap) },
      },
    });
    if (delProyecto !== raps.length) {
      throw new BadRequestException(MENSAJE_RAP_FUERA_DEL_PROYECTO);
    }
    // La intercalación de MySQL compara sin distinguir mayúsculas: «rac 1» choca con «RAC 1».
    const mismoCodigo = await tx.rac.findFirst({
      where: {
        id_proyecto_docente: id,
        codigo,
        ...(idRacActual === null ? {} : { id: { not: idRacActual } }),
      },
      select: { id: true },
    });
    if (mismoCodigo) {
      throw new ConflictException(mensajeCodigoRepetido(codigo));
    }
  }

  private relaciones({
    raps,
  }: GuardarRacDto): Prisma.rac_rapCreateWithoutRacInput[] {
    return raps.map((rap) => ({
      rap: { connect: { id: rap.idRap } },
      descripcion_contribucion: rap.descripcionContribucion ?? null,
    }));
  }

  private async racDelProyecto(
    tx: Tx,
    id: number,
    idRac: number,
  ): Promise<RacConRaps> {
    const rac = await tx.rac.findFirst({
      where: { id: idRac, id_proyecto_docente: id },
      include: INCLUIR_RAC,
    });
    if (!rac) {
      throw new NotFoundException(MENSAJE_RAC_NO_EXISTE);
    }
    return rac;
  }

  /** RF-12, p2 y p5: los RAP del proyecto con sus RAC, y los que todavía no tienen. */
  private async leerSeccion(
    cliente: Tx | PrismaService,
    id: number,
  ): Promise<SeccionRacDto> {
    // En secuencia y no con Promise.all: dentro de una transacción comparten una conexión.
    const relacionesRap = await cliente.proyecto_docente_rap.findMany({
      where: { id_proyecto_docente: id },
      include: { rap: true },
      orderBy: { rap: { numero: 'asc' } },
    });
    const racs = await cliente.rac.findMany({
      where: { id_proyecto_docente: id },
      include: INCLUIR_RAC,
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });
    const dtos = racs.map(aRac);
    const grupos = relacionesRap.map(({ rap }) => ({
      rap: aRap(rap),
      racs: dtos.filter((rac) => rac.raps.some((r) => r.idRap === rap.id)),
    }));
    return {
      grupos,
      rapsSinRac: grupos
        .filter((grupo) => grupo.racs.length === 0)
        .map((grupo) => grupo.rap.id),
    };
  }
}
