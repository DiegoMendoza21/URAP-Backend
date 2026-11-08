import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type {
  CodigoModulo,
  CodigoPermiso,
} from '../datos-iniciales/catalogos.js';

/** Códigos de `tipo_notificacion` que usa el código (catálogo en `datos-iniciales`). */
export const NOTIFICACION = {
  proyectoEnviado: 'proyecto_enviado',
  proyectoAprobado: 'proyecto_aprobado',
  proyectoDevuelto: 'proyecto_devuelto',
} as const;

/** `notificacion.estado_envio` de una notificación recién creada (DBML v2.4). */
const ENVIO_PENDIENTE = 'pendiente';

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
 * Notificaciones dentro del sistema (RF-26). Por ahora solo las registra en `notificacion`,
 * con `estado_envio` «pendiente»: la bandeja del usuario y el envío por correo llegan con
 * EP-13. Así, quien genera el evento (por ejemplo, la revisión del proyecto docente) ya deja
 * el aviso para cuando exista dónde verlo.
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
