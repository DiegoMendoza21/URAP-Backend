import { Injectable, Logger } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** `reporte_academico.tipo` de cada reporte (RF-28, p6; RF-32; el tablero de RF-25). */
export const TIPO_REPORTE = {
  cumplimiento: 'cumplimiento_periodo',
  contribucion: 'contribucion_rac_rap',
  ejecucion: 'ejecucion_contenidos',
  logro: 'medicion_rap',
  seguimiento: 'seguimiento',
} as const;

export interface GeneracionReporte {
  tipo: string;
  nombre: string;
  idPrograma: number | null;
  idPeriodo: number | null;
  /** Los filtros aplicados, para saber después qué se generó (HU-12-06). */
  parametros: Prisma.InputJsonValue;
  fecha: Date;
}

/**
 * HU-12-06 (RF-28, p6): la constancia de cada reporte generado, con el usuario y la fecha. La
 * usan los reportes académicos (RF-28) y el de logro de los RAP (RF-32).
 */
@Injectable()
export class RegistroReportesService {
  private readonly logger = new Logger(RegistroReportesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Registra la generación del reporte en `reporte_academico`, y la creación de esa fila en la
   * auditoría (AuditoriaService, con la IP). Un fallo al registrar no impide entregar el
   * reporte.
   */
  async registrar(idUsuario: number, datos: GeneracionReporte): Promise<void> {
    let idReporte: number;
    try {
      const reporte = await this.prisma.reporte_academico.create({
        data: {
          id_generado_por: idUsuario,
          id_programa: datos.idPrograma,
          id_periodo: datos.idPeriodo,
          tipo: datos.tipo,
          nombre: datos.nombre,
          parametros: datos.parametros,
          fecha_generacion: datos.fecha,
        },
        select: { id: true },
      });
      idReporte = reporte.id;
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la generación del reporte «${datos.tipo}».`,
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }
    // Después de confirmar la fila; AuditoriaService nunca lanza (RF-29, excepción de p3).
    await this.auditoria.registrar({
      accion: 'crear',
      tablaAfectada: 'reporte_academico',
      idRegistro: idReporte,
      valorNuevo: { tipo: datos.tipo, parametros: datos.parametros },
    });
  }
}
