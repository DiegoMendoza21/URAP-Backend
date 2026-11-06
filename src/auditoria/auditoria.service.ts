import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Acciones de auditoría, con el vocabulario del modelo de datos (DBML, tabla `auditoria`). */
export type AccionAuditoria =
  'crear' | 'actualizar' | 'eliminar' | 'aprobar' | 'consulta_sensible';

export interface EventoAuditoria {
  /** Usuario responsable. Nulo cuando la acción la toma el propio sistema. */
  idUsuario: number | null;
  accion: AccionAuditoria;
  tablaAfectada: string;
  idRegistro: number | null;
  valorAnterior?: Prisma.InputJsonValue;
  valorNuevo?: Prisma.InputJsonValue;
  ip?: string;
}

/**
 * Registro de auditoría (RF-29, NFR-008). Versión mínima, creada con HU-01-04 para dejar
 * constancia del bloqueo de una cuenta: escribe un evento en la tabla `auditoria`.
 *
 * HU-14-01 la amplía con el registro automático de las acciones relevantes y HU-14-02 con
 * la consulta. Los registros no se modifican ni se eliminan (RF-29, p4).
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda el evento. Nunca lanza: si la auditoría falla, queda constancia en el registro
   * técnico y la operación del usuario sigue (RF-29, excepción p3).
   */
  async registrar(evento: EventoAuditoria): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: {
          id_usuario: evento.idUsuario,
          accion: evento.accion,
          tabla_afectada: evento.tablaAfectada,
          id_registro: evento.idRegistro,
          valor_anterior: evento.valorAnterior,
          valor_nuevo: evento.valorNuevo,
          fecha: new Date(),
          ip: evento.ip?.slice(0, 255) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar en auditoría la acción «${evento.accion}» sobre ` +
          `${evento.tablaAfectada} ${evento.idRegistro ?? ''}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
