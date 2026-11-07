import { BadRequestException, Injectable } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/tipos.js';
import { ParametrosService } from '../common/parametros/parametros.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  DESCRIPCION_TOPE_TECNICO,
  type DescripcionDto,
  type DiligenciamientoDto,
  type GuardarDescripcionDto,
} from './dto/diligenciamiento.dto.js';
import {
  type Auditable,
  EdicionProyectoService,
  soloCambios,
} from './edicion-proyecto.service.js';
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

/** Solo si el texto cambió: guardar lo mismo otra vez no deja rastro en la auditoría. */
function auditarDescripcion(
  id: number,
  anterior: string | null,
  nuevo: string | null,
): Auditable | null {
  const cambios = soloCambios(
    { descripcion: anterior },
    { descripcion: nuevo },
  );
  return cambios
    ? {
        accion: 'actualizar',
        tabla: 'proyecto_docente',
        idRegistro: id,
        ...cambios,
      }
    : null;
}

/**
 * Resumen del diligenciamiento (HU-06-08) y punto 2 «Descripción» del proyecto docente
 * (RF-11, HU-06-01). El punto 3 vive en `RacService`.
 */
@Injectable()
export class DiligenciamientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edicion: EdicionProyectoService,
    private readonly parametros: ParametrosService,
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
        select: { descripcion: true, fecha_actualizacion: true },
      });
      const auditoria = auditarDescripcion(id, anterior.descripcion, nuevo);
      if (auditoria) {
        await tx.proyecto_docente.update({
          where: { id },
          data: { descripcion: nuevo },
        });
      }
      // Sin cambios, `editar` no mueve la fecha: se devuelve la que ya tenía.
      const fecha = auditoria ? ahora : anterior.fecha_actualizacion;
      return {
        resultado: {
          texto: nuevo,
          longitudMaxima: maximo,
          fechaActualizacion: fecha?.toISOString() ?? null,
        },
        auditoria,
      };
    });
  }

  /** Lo que necesitan las secciones para saber si están completas (`entities/secciones.ts`). */
  async datosCompletitud(id: number): Promise<DatosCompletitud> {
    const proyecto = await this.prisma.proyecto_docente.findUniqueOrThrow({
      where: { id },
      select: {
        descripcion: true,
        proyecto_docente_rap: {
          select: {
            rap: { select: { id: true, codigo: true, numero: true } },
          },
          orderBy: { rap: { numero: 'asc' } },
        },
        rac: { select: { rac_rap: { select: { id_rap: true } } } },
      },
    });
    return {
      descripcion: proyecto.descripcion,
      raps: proyecto.proyecto_docente_rap.map(({ rap }) => rap),
      racs: proyecto.rac.map((rac) => ({
        idsRap: rac.rac_rap.map((relacion) => relacion.id_rap),
      })),
    };
  }

  /** Longitud máxima de la descripción, leída de `parametro_sistema` (RF-11, p3). */
  async longitudMaxima(): Promise<number> {
    // Inválido o sin sembrar, ParametrosService lo registra como error de configuración y
    // devuelve nulo: se usa entonces el valor inicial. Mayor que el tope del DTO, se recorta:
    // el servidor no puede prometer más de lo que acepta.
    const valor = await this.parametros.leerEntero(
      PARAMETRO_LONGITUD_DESCRIPCION,
      { minimo: 1, maximo: Number.MAX_SAFE_INTEGER },
    );
    return valor === null
      ? LONGITUD_DESCRIPCION_RESPALDO
      : Math.min(valor, DESCRIPCION_TOPE_TECNICO);
  }
}
