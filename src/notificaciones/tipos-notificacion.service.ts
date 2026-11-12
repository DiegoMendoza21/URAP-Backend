import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';
import { RANGO_PARAMETRO } from '../common/parametros/rangos-parametros.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type {
  ActualizarTipoNotificacionDto,
  ConfiguracionNotificacionesDto,
  TipoNotificacionDto,
} from './dto/tipos.dto.js';

export const MENSAJE_TIPO_NOTIFICACION_NO_EXISTE =
  'El tipo de notificación no existe.';
export const MENSAJE_TIPO_SIN_CAMBIOS =
  'Indique qué quiere cambiar del tipo de notificación.';

const SELECCION_TIPO = {
  id: true,
  codigo: true,
  nombre: true,
  activo: true,
  envia_email: true,
} as const;

/**
 * RF-26, HU-13-04: qué eventos generan notificación, si salen también por correo y cada cuánto
 * se recuerdan las sesiones pendientes. Se guarda en la base y rige desde el siguiente aviso,
 * sin redesplegar: `NotificacionesService.notificar` lee `activo` en cada aviso.
 */
@Injectable()
export class TiposNotificacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async consultar(): Promise<ConfiguracionNotificacionesDto> {
    const [tipos, dias] = await Promise.all([
      this.prisma.tipo_notificacion.findMany({
        select: SELECCION_TIPO,
        orderBy: { id: 'asc' },
      }),
      this.parametros.leerEntero(
        PARAMETRO.recordatorioSesionesDias,
        RANGO_PARAMETRO[PARAMETRO.recordatorioSesionesDias],
      ),
    ]);
    return { tipos: tipos.map(aTipo), recordatorioSesionesDias: dias };
  }

  async actualizar(
    codigo: string,
    cambios: ActualizarTipoNotificacionDto,
  ): Promise<TipoNotificacionDto> {
    if (cambios.activo === undefined && cambios.enviaEmail === undefined) {
      throw new BadRequestException(MENSAJE_TIPO_SIN_CAMBIOS);
    }
    const actual = await this.prisma.tipo_notificacion.findUnique({
      where: { codigo },
      select: SELECCION_TIPO,
    });
    if (!actual) {
      throw new NotFoundException(MENSAJE_TIPO_NOTIFICACION_NO_EXISTE);
    }
    const antes = aTipo(actual);
    const anterior: Record<string, boolean> = {};
    const nuevo: Record<string, boolean> = {};
    for (const campo of ['activo', 'enviaEmail'] as const) {
      const valor = cambios[campo];
      if (valor !== undefined && valor !== antes[campo]) {
        anterior[campo] = antes[campo];
        nuevo[campo] = valor;
      }
    }
    if (Object.keys(nuevo).length === 0) {
      return antes;
    }
    const guardado = await this.prisma.tipo_notificacion.update({
      where: { id: actual.id },
      data: {
        ...(nuevo.activo !== undefined && { activo: nuevo.activo }),
        ...(nuevo.enviaEmail !== undefined && {
          envia_email: nuevo.enviaEmail,
        }),
      },
      select: SELECCION_TIPO,
    });
    await this.auditoria.registrar({
      accion: 'actualizar',
      tablaAfectada: 'tipo_notificacion',
      idRegistro: actual.id,
      valorAnterior: anterior,
      valorNuevo: nuevo,
    });
    return aTipo(guardado);
  }
}

/** Los vacíos valen lo que dice el DBML: `activo` y `envia_email` son verdaderos por defecto. */
function aTipo(fila: {
  codigo: string | null;
  nombre: string | null;
  activo: boolean | null;
  envia_email: boolean | null;
}): TipoNotificacionDto {
  return {
    codigo: fila.codigo ?? '',
    nombre: fila.nombre ?? fila.codigo ?? '',
    activo: fila.activo !== false,
    enviaEmail: fila.envia_email !== false,
  };
}
