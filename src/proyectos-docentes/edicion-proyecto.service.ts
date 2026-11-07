import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ROL } from '../auth/roles.js';
import type { UsuarioSesion } from '../auth/tipos.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  MENSAJE_PROYECTO_NO_EXISTE,
  ProyectosDocentesService,
} from './proyectos-docentes.service.js';

export const MENSAJE_SOLO_DOCENTES_ASIGNADOS =
  'Solo los docentes asignados a este proyecto pueden diligenciarlo.';

/** Estados que ya pasaron la revisión: para cambiar algo hay que reabrir el proyecto. */
const ESTADOS_CON_REAPERTURA = new Set(['aprobado', 'en_ejecucion', 'cerrado']);
const ESTADO_ENVIADO = 'enviado';

type Tx = Prisma.TransactionClient;

const INCLUIR_ACCESO = {
  estado_proyecto: true,
  proyecto_docente_docente: { select: { id_usuario: true } },
} satisfies Prisma.proyecto_docenteInclude;

export type ProyectoConAcceso = Prisma.proyecto_docenteGetPayload<{
  include: typeof INCLUIR_ACCESO;
}>;

/**
 * Lo que un cambio de sección deja en `auditoria` (RF-29). En `anterior` y `nuevo` van solo los
 * campos que cambian (CLAUDE.md, «Auditoría»): use `soloCambios()`. El usuario y la IP los
 * pone `AuditoriaService` desde el contexto de la petición.
 */
export interface Auditable {
  accion: 'crear' | 'actualizar' | 'eliminar';
  tabla: string;
  idRegistro: number;
  anterior?: Prisma.InputJsonValue;
  nuevo?: Prisma.InputJsonValue;
}

type Campos = Record<string, Prisma.InputJsonValue | null>;

/**
 * De dos versiones de un registro, solo los campos que cambian. Nulo si no cambió nada: en ese
 * caso no hay nada que auditar. Compara por su JSON, así que arme las dos versiones con las
 * claves y las listas en el mismo orden (ordene las listas, como hace `RacService`).
 */
export function soloCambios(
  anterior: Campos,
  nuevo: Campos,
): { anterior: Campos; nuevo: Campos } | null {
  const claves = [
    ...new Set([...Object.keys(anterior), ...Object.keys(nuevo)]),
  ].filter(
    (clave) => JSON.stringify(anterior[clave]) !== JSON.stringify(nuevo[clave]),
  );
  if (claves.length === 0) {
    return null;
  }
  return {
    anterior: Object.fromEntries(claves.map((c) => [c, anterior[c] ?? null])),
    nuevo: Object.fromEntries(claves.map((c) => [c, nuevo[c] ?? null])),
  };
}

/**
 * Por qué no se puede editar el proyecto en su estado actual, o nulo si se puede (RF-11, p4 y
 * RF-17). La regla la da `estado_proyecto.permite_edicion`; el código solo elige el consejo.
 */
export function motivoEstadoNoEditable(
  estado: ProyectoConAcceso['estado_proyecto'],
): string | null {
  if (estado?.permite_edicion === true) {
    return null;
  }
  const nombre = estado?.nombre ?? 'sin estado';
  if (estado?.codigo === ESTADO_ENVIADO) {
    return `El proyecto está «${nombre}»: no se puede editar mientras el departamento académico lo revisa.`;
  }
  if (estado?.codigo && ESTADOS_CON_REAPERTURA.has(estado.codigo)) {
    return `El proyecto está «${nombre}» y ya no se puede editar. Si necesita cambiarlo, solicite su reapertura al departamento académico.`;
  }
  return `El proyecto está «${nombre}» y no se puede editar.`;
}

/**
 * Acceso al diligenciamiento del proyecto docente (matriz de permisos de `URAP-34`):
 * - consultan quienes ven el proyecto en la bandeja (mismo filtro que RF-08);
 * - editan solo los docentes asignados en `proyecto_docente_docente` («R/E propios») y solo
 *   mientras el estado lo permita.
 */
@Injectable()
export class EdicionProyectoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectos: ProyectosDocentesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** El proyecto si el usuario lo puede ver; si no, 404 sin revelar si existe. */
  async consultable(
    usuario: UsuarioSesion,
    id: number,
  ): Promise<ProyectoConAcceso> {
    const visibles = await this.proyectos.filtroVisibilidad(usuario);
    const proyecto = visibles
      ? await this.prisma.proyecto_docente.findFirst({
          where: { AND: [{ id }, visibles] },
          include: INCLUIR_ACCESO,
        })
      : null;
    if (!proyecto) {
      throw new NotFoundException(MENSAJE_PROYECTO_NO_EXISTE);
    }
    return proyecto;
  }

  /** Si el usuario es docente asignado al proyecto. */
  esDocenteAsignado(
    usuario: UsuarioSesion,
    proyecto: ProyectoConAcceso,
  ): boolean {
    return (
      usuario.roles.includes(ROL.docente) &&
      proyecto.proyecto_docente_docente.some(
        (asignacion) => asignacion.id_usuario === usuario.id,
      )
    );
  }

  /** Motivo por el que el usuario no puede editar ahora, o nulo si puede. */
  motivoNoEditable(
    usuario: UsuarioSesion,
    proyecto: ProyectoConAcceso,
  ): string | null {
    if (!this.esDocenteAsignado(usuario, proyecto)) {
      return MENSAJE_SOLO_DOCENTES_ASIGNADOS;
    }
    return motivoEstadoNoEditable(proyecto.estado_proyecto);
  }

  /**
   * Ejecuta un cambio de una sección dentro de una transacción. Bloquea la fila del proyecto
   * para que el estado no cambie a mitad del guardado (por ejemplo, un envío a revisión
   * simultáneo) y para que dos guardados del mismo proyecto se atiendan de a uno. Al terminar,
   * actualiza la fecha de última modificación (RF-11, p4) y audita el cambio (RF-29). Si el
   * cambio devuelve `auditoria: null` (no cambió nada), no se toca la fecha ni se audita.
   */
  async editar<T>(
    usuario: UsuarioSesion,
    id: number,
    cambio: (
      tx: Tx,
      ahora: Date,
    ) => Promise<{ resultado: T; auditoria: Auditable | null }>,
  ): Promise<T> {
    const visible = await this.consultable(usuario, id);
    if (!this.esDocenteAsignado(usuario, visible)) {
      throw new ForbiddenException(MENSAJE_SOLO_DOCENTES_ASIGNADOS);
    }

    const { resultado, auditoria } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM proyecto_docente WHERE id = ${id} FOR UPDATE`;
        const actual = await tx.proyecto_docente.findUniqueOrThrow({
          where: { id },
          include: INCLUIR_ACCESO,
        });
        // Se vuelve a mirar con la fila bloqueada: la asignación o el estado pudieron cambiar.
        if (!this.esDocenteAsignado(usuario, actual)) {
          throw new ForbiddenException(MENSAJE_SOLO_DOCENTES_ASIGNADOS);
        }
        const motivo = motivoEstadoNoEditable(actual.estado_proyecto);
        if (motivo) {
          throw new ConflictException(motivo);
        }
        const ahora = new Date();
        const hecho = await cambio(tx, ahora);
        // Sin cambios no hay modificación: ni fecha nueva ni fila de auditoría.
        if (hecho.auditoria) {
          await tx.proyecto_docente.update({
            where: { id },
            data: { fecha_actualizacion: ahora },
          });
        }
        return hecho;
      },
    );

    // RF-29: después de confirmar, fuera de la transacción. AuditoriaService toma el usuario
    // y la IP del contexto de la petición, limpia los valores y nunca lanza: un fallo al
    // auditar no deshace el guardado.
    if (auditoria) {
      await this.auditoria.registrar({
        accion: auditoria.accion,
        tablaAfectada: auditoria.tabla,
        idRegistro: auditoria.idRegistro,
        valorAnterior: auditoria.anterior,
        valorNuevo: auditoria.nuevo,
      });
    }
    return resultado;
  }
}
