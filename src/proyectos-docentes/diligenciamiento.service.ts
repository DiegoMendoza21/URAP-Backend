import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  DESCRIPCION_TOPE_TECNICO,
  type DescripcionDto,
  type DiligenciamientoDto,
  type GuardarDescripcionDto,
} from './dto/diligenciamiento.dto.js';
import { EdicionProyectoService } from './edicion-proyecto.service.js';
import { type DatosCompletitud, SECCIONES } from './entities/secciones.js';

/** Parámetro de negocio con la longitud máxima de la descripción (RF-11, p3). */
export const PARAMETRO_LONGITUD_DESCRIPCION =
  'descripcion_curso_longitud_maxima';
/**
 * Valor de respaldo si el parámetro no está sembrado o no es un entero positivo. Es el mismo
 * valor inicial de `datos-iniciales/catalogos.ts`; el que manda es el de la base.
 */
export const LONGITUD_DESCRIPCION_RESPALDO = 4000;

export function mensajeDescripcionLarga(maximo: number): string {
  return `La descripción supera los ${maximo.toLocaleString('es-CO')} caracteres permitidos. Acórtela para poder guardarla.`;
}

/**
 * Resumen del diligenciamiento (HU-06-08) y punto 2 «Descripción» del proyecto docente
 * (RF-11, HU-06-01). El punto 3 vive en `RacService`.
 */
@Injectable()
export class DiligenciamientoService {
  private readonly logger = new Logger(DiligenciamientoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
  ) {}

  /** Estado de cada sección y si el usuario puede editar (HU-06-08). */
  async resumen(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<DiligenciamientoDto> {
    const proyecto = await this.edicion.consultable(usuario, id);
    const datos = await this.datosCompletitud(id);
    const motivo = this.edicion.motivoNoEditable(usuario, proyecto);
    return {
      idProyecto: proyecto.id,
      estado: proyecto.estado_proyecto
        ? {
            codigo: proyecto.estado_proyecto.codigo ?? '',
            nombre: proyecto.estado_proyecto.nombre ?? '',
          }
        : null,
      puedeEditar: motivo === null,
      motivoNoEditable: motivo,
      fechaActualizacion: proyecto.fecha_actualizacion?.toISOString() ?? null,
      secciones: SECCIONES.map((seccion) => {
        const pendientes = seccion.pendientes(datos);
        return {
          numero: seccion.numero,
          clave: seccion.clave,
          titulo: seccion.titulo,
          completa: pendientes.length === 0,
          pendientes,
        };
      }),
    };
  }

  async descripcion(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<DescripcionDto> {
    const proyecto = await this.edicion.consultable(usuario, id);
    return {
      texto: proyecto.descripcion,
      longitudMaxima: await this.longitudMaxima(),
      fechaActualizacion: proyecto.fecha_actualizacion?.toISOString() ?? null,
    };
  }

  /**
   * RF-11, p3-p4: guarda el texto y la fecha de última modificación. Un texto vacío se guarda
   * como nulo: el docente puede dejar la sección para después (HU-06-08).
   */
  async guardarDescripcion(
    usuario: UsuarioSesion,
    id: number,
    { texto }: GuardarDescripcionDto,
  ): Promise<DescripcionDto> {
    const maximo = await this.longitudMaxima();
    if (texto.length > maximo) {
      throw new BadRequestException(mensajeDescripcionLarga(maximo));
    }
    const nuevo = texto.trim() === '' ? null : texto;

    return this.edicion.editar(usuario, id, async (tx, ahora) => {
      const anterior = await tx.proyecto_docente.findUniqueOrThrow({
        where: { id },
        select: { descripcion: true },
      });
      await tx.proyecto_docente.update({
        where: { id },
        data: { descripcion: nuevo },
      });
      return {
        resultado: {
          texto: nuevo,
          longitudMaxima: maximo,
          fechaActualizacion: ahora.toISOString(),
        },
        auditoria: {
          accion: 'actualizar',
          tabla: 'proyecto_docente',
          idRegistro: id,
          anterior: { descripcion: anterior.descripcion },
          nuevo: { descripcion: nuevo },
        },
      };
    });
  }

  /** Lo que necesitan las secciones para saber si están completas (`entities/secciones.ts`). */
  async datosCompletitud(id: number): Promise<DatosCompletitud> {
    const proyecto = await this.prisma.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: SELECCION_COMPLETITUD,
    });
    return aDatosCompletitud(proyecto);
  }

  /** Longitud máxima de la descripción, leída de `parametro_sistema` (RF-11, p3). */
  async longitudMaxima(): Promise<number> {
    const parametro = await this.prisma.parametro_sistema.findUnique({
      where: { clave: PARAMETRO_LONGITUD_DESCRIPCION },
      select: { valor: true },
    });
    const valor = Number(parametro?.valor);
    if (Number.isInteger(valor) && valor > 0) {
      // El DTO no deja pasar más que el tope técnico: un parámetro mayor no puede prometerlo.
      return Math.min(valor, DESCRIPCION_TOPE_TECNICO);
    }
    this.logger.warn(
      `El parámetro «${PARAMETRO_LONGITUD_DESCRIPCION}» falta o no es un entero positivo; ` +
        `se usa ${LONGITUD_DESCRIPCION_RESPALDO}. Corra npm run db:sembrar.`,
    );
    return LONGITUD_DESCRIPCION_RESPALDO;
  }
}

/**
 * Lo que hay que leer de un proyecto para evaluar sus secciones. Se exporta para que el tablero
 * de seguimiento (RF-25) evalúe muchos proyectos con una sola consulta y la misma regla.
 */
export const SELECCION_COMPLETITUD = {
  descripcion: true,
  proyecto_docente_rap: {
    select: {
      rap: { select: { id: true, codigo: true, numero: true } },
    },
    orderBy: { rap: { numero: 'asc' } },
  },
  rac: {
    select: {
      codigo: true,
      rac_rap: { select: { id_rap: true } },
      _count: { select: { evaluacion_rac: true } },
    },
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
  },
  periodo_academico: { select: { numero_semanas: true } },
  contenido_programatico: {
    where: { tema: { not: null } },
    select: { semana: true, tema: true },
  },
  _count: {
    select: { estrategia_metodologica: true, bibliografia: true },
  },
} satisfies Prisma.proyecto_docenteSelect;

export function aDatosCompletitud(
  proyecto: Prisma.proyecto_docenteGetPayload<{
    select: typeof SELECCION_COMPLETITUD;
  }>,
): DatosCompletitud {
  return {
    descripcion: proyecto.descripcion,
    raps: proyecto.proyecto_docente_rap.map(({ rap }) => rap),
    racs: proyecto.rac.map((rac) => ({
      codigo: rac.codigo,
      idsRap: rac.rac_rap.map((relacion) => relacion.id_rap),
      evaluaciones: rac._count.evaluacion_rac,
    })),
    estrategias: proyecto._count.estrategia_metodologica,
    contenidos: {
      numeroSemanas: proyecto.periodo_academico?.numero_semanas ?? null,
      semanasConTema: proyecto.contenido_programatico
        .filter((fila) => fila.semana !== null && fila.tema?.trim())
        .map((fila) => fila.semana as number),
    },
    bibliografia: proyecto._count.bibliografia,
  };
}
