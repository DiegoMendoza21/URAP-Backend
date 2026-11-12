import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type {
  CodigoModulo,
  CodigoPermiso,
} from '../datos-iniciales/catalogos.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ConsultarNotificacionesDto,
  ContadorNotificacionesDto,
  NotificacionDto,
  NotificacionesMarcadasDto,
  PaginaNotificacionesDto,
} from './dto/notificaciones.dto.js';

/** Códigos de `tipo_notificacion` que usa el código (catálogo en `datos-iniciales`). */
export const NOTIFICACION = {
  asignacionProyecto: 'asignacion_proyecto',
  proyectoEnviado: 'proyecto_enviado',
  proyectoAprobado: 'proyecto_aprobado',
  proyectoDevuelto: 'proyecto_devuelto',
  /** HU-13-02: el recordatorio de un docente con alguna sesión vencida. */
  sesionVencida: 'sesion_vencida',
  /** HU-13-02: el recordatorio de un docente que solo tiene sesiones por vencer. */
  sesionPorVencer: 'sesion_por_vencer',
} as const;

/**
 * `notificacion.estado_envio` de una notificación recién creada (DBML v2.4). Se queda así
 * mientras no haya servicio de correo institucional (ACT-07): el envío por correo de RF-26,
 * p4, es una tarea aparte.
 */
const ENVIO_PENDIENTE = 'pendiente';

export const MENSAJE_NOTIFICACION_NO_EXISTE = 'La notificación no existe.';

/** No leída: `leida` en falso o vacío (la columna admite nulos). */
const NO_LEIDA = {
  OR: [{ leida: false }, { leida: null }],
} satisfies Prisma.notificacionWhereInput;

const SELECCION_NOTIFICACION = {
  id: true,
  titulo: true,
  mensaje: true,
  url_destino: true,
  leida: true,
  created_at: true,
  fecha_lectura: true,
  tipo_notificacion: { select: { codigo: true } },
} satisfies Prisma.notificacionSelect;

type NotificacionLeida = Prisma.notificacionGetPayload<{
  select: typeof SELECCION_NOTIFICACION;
}>;

export interface AvisoNuevo {
  /** Código de `tipo_notificacion`. */
  tipo: string;
  destinatarios: readonly number[];
  titulo: string;
  mensaje: string;
  /** Entidad a la que se refiere el aviso, como `proyecto_docente`. */
  entidad: string;
  idEntidad: number;
  /** Ruta del frontend que abre el aviso, como `/proyectos-docentes/12`. */
  urlDestino?: string;
}

/**
 * Notificaciones dentro del sistema (RF-26): las registra en `notificacion` y le muestra a cada
 * usuario las suyas (HU-13-01 y HU-13-03). Quedan con `estado_envio` «pendiente»: el envío por
 * correo llega cuando haya servicio de correo institucional (ACT-07).
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deja una notificación para cada destinatario. Nunca lanza: un fallo al notificar no debe
   * deshacer la operación que la generó, así que queda en el registro técnico.
   */
  async notificar(aviso: AvisoNuevo): Promise<void> {
    const destinatarios = [...new Set(aviso.destinatarios)];
    if (destinatarios.length === 0) {
      return;
    }
    try {
      const tipo = await this.prisma.tipo_notificacion.findUnique({
        where: { codigo: aviso.tipo },
        select: { id: true, activo: true },
      });
      if (!tipo) {
        this.logger.error(
          `No existe el tipo de notificación «${aviso.tipo}». Corra npm run db:sembrar.`,
        );
        return;
      }
      // HU-13-04: el administrador puede desactivar un tipo de notificación.
      if (tipo.activo === false) {
        return;
      }
      await this.prisma.notificacion.createMany({
        data: destinatarios.map((idUsuario) => ({
          id_tipo_notificacion: tipo.id,
          id_usuario: idUsuario,
          titulo: aviso.titulo,
          mensaje: aviso.mensaje,
          entidad: aviso.entidad,
          id_entidad: aviso.idEntidad,
          url_destino: aviso.urlDestino ?? null,
          leida: false,
          estado_envio: ENVIO_PENDIENTE,
        })),
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la notificación «${aviso.tipo}» de ${aviso.entidad} ${aviso.idEntidad}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * HU-13-01 y HU-13-03: la bandeja del usuario, de la más reciente a la más antigua. Solo ve
   * las suyas: no hay forma de pedir las de otra persona.
   */
  async listar(
    idUsuario: number,
    { pagina, tamano, filtro }: ConsultarNotificacionesDto,
  ): Promise<PaginaNotificacionesDto> {
    const where: Prisma.notificacionWhereInput = {
      id_usuario: idUsuario,
      ...(filtro === 'no_leidas' ? NO_LEIDA : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.findMany({
        where,
        select: SELECCION_NOTIFICACION,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return { elementos: filas.map(aNotificacion), pagina, tamano, total };
  }

  /** Cuántas notificaciones del usuario están sin leer: el número de la campana. */
  async contarNoLeidas(idUsuario: number): Promise<ContadorNotificacionesDto> {
    const noLeidas = await this.prisma.notificacion.count({
      where: { id_usuario: idUsuario, ...NO_LEIDA },
    });
    return { noLeidas };
  }

  /**
   * Marca como leída una notificación del usuario. Una ajena responde 404, igual que una que
   * no existe: así no se puede saber qué notificaciones tienen los demás. Si ya estaba leída,
   * conserva la fecha en que se leyó.
   */
  async marcarLeida(idUsuario: number, id: number): Promise<NotificacionDto> {
    const actual = await this.prisma.notificacion.findFirst({
      where: { id, id_usuario: idUsuario },
      select: SELECCION_NOTIFICACION,
    });
    if (!actual) {
      throw new NotFoundException(MENSAJE_NOTIFICACION_NO_EXISTE);
    }
    if (actual.leida === true) {
      return aNotificacion(actual);
    }
    const leida = await this.prisma.notificacion.update({
      where: { id },
      data: { leida: true, fecha_lectura: new Date() },
      select: SELECCION_NOTIFICACION,
    });
    return aNotificacion(leida);
  }

  /** Marca como leídas todas las notificaciones pendientes del usuario. */
  async marcarTodasLeidas(
    idUsuario: number,
  ): Promise<NotificacionesMarcadasDto> {
    const { count } = await this.prisma.notificacion.updateMany({
      where: { id_usuario: idUsuario, ...NO_LEIDA },
      data: { leida: true, fecha_lectura: new Date() },
    });
    return { marcadas: count };
  }

  /**
   * Usuarios activos que tienen un permiso de la matriz en el programa, a través de un rol
   * vigente de ese programa o de alcance global. Decide la matriz y no el nombre del rol
   * (HU-01-03): por ejemplo, quienes aprueban proyectos del programa son los que tienen
   * `proyectos.aprobar` allí.
   */
  async usuariosConPermiso(
    modulo: CodigoModulo,
    permiso: CodigoPermiso,
    idPrograma: number | null,
  ): Promise<number[]> {
    const filas = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        usuario_rol_usuario_rol_id_usuarioTousuario: {
          some: {
            activo: true,
            fecha_revocacion: null,
            OR: [{ id_programa: idPrograma }, { id_programa: null }],
            rol: {
              is: {
                activo: true,
                rol_permiso: {
                  some: {
                    modulo: { codigo: modulo },
                    permiso: { codigo: permiso },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return filas.map((fila) => fila.id);
  }
}

function aNotificacion(fila: NotificacionLeida): NotificacionDto {
  return {
    id: fila.id,
    tipo: fila.tipo_notificacion?.codigo ?? null,
    titulo: fila.titulo ?? '',
    mensaje: fila.mensaje ?? '',
    urlDestino: fila.url_destino,
    leida: fila.leida === true,
    fecha: fila.created_at?.toISOString() ?? null,
    fechaLectura: fila.fecha_lectura?.toISOString() ?? null,
  };
}
