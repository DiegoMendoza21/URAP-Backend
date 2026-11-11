import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { contextoActual } from '../common/contexto/contexto-peticion.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  type AccionAuditoria,
  AuditoriaService,
  omitirCamposSensibles,
} from './auditoria.service.js';
import type { ConsultarAuditoriaDto } from './dto/consultar-auditoria.dto.js';
import type {
  DetalleAuditoriaDto,
  PaginaAuditoriaDto,
  RegistroAuditoriaDto,
} from './dto/respuestas.dto.js';

export const MENSAJE_REGISTRO_NO_EXISTE =
  'No existe ese registro de auditoría.';
export const MENSAJE_RANGO_INVERTIDO =
  'La fecha inicial no puede ser posterior a la fecha final.';
export const MENSAJE_FALTA_ENTIDAD =
  'Para ver el historial de un registro, indique también la entidad.';

/** Entidad con la que queda en auditoría la propia consulta de la auditoría. */
export const ENTIDAD_CONSULTA_AUDITORIA = 'auditoria';

/**
 * Consultar la auditoría es una consulta sensible (RF-29, p1: muestra quién hizo qué y desde
 * qué IP), así que deja constancia. Pero una investigación son muchas páginas y detalles
 * seguidos: si cada uno dejara su registro, la tabla se llenaría de registros de sí misma.
 * Queda una constancia por persona en esta ventana, no una por petición.
 */
export const MINUTOS_ENTRE_CONSTANCIAS = 60;

/**
 * La institución está en Colombia, que no cambia de hora en el año: el día del filtro va de
 * las 00:00 a las 24:00 de America/Bogota (UTC−5).
 */
const DESFASE_INSTITUCION = '-05:00';
const UN_DIA_MS = 24 * 60 * 60 * 1000;

const SELECCION_REGISTRO = {
  id: true,
  fecha: true,
  accion: true,
  tabla_afectada: true,
  id_registro: true,
  ip: true,
  valor_anterior: true,
  valor_nuevo: true,
  usuario: { select: { id: true, nombres: true, apellidos: true } },
} satisfies Prisma.auditoriaSelect;

type RegistroLeido = Prisma.auditoriaGetPayload<{
  select: typeof SELECCION_REGISTRO;
}>;

/**
 * Consulta de la auditoría (HU-14-02 y HU-14-03; RF-29, p4). Solo lee: los registros no se
 * modifican ni se eliminan (RF-29, excepción p4), y por eso no hay aquí, ni en el
 * controlador, ninguna operación de escritura sobre ellos.
 */
@Injectable()
export class ConsultaAuditoriaService {
  private readonly logger = new Logger(ConsultaAuditoriaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Listado paginado, del registro más reciente al más antiguo. */
  async listar(consulta: ConsultarAuditoriaDto): Promise<PaginaAuditoriaDto> {
    const { pagina, tamano } = consulta;
    const where = filtro(consulta);
    const [total, registros] = await Promise.all([
      this.prisma.auditoria.count({ where }),
      this.prisma.auditoria.findMany({
        where,
        select: SELECCION_REGISTRO,
        // Por fecha y, dentro del mismo segundo (la columna no guarda milisegundos), por id.
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    await this.dejarConstancia();
    return { elementos: registros.map(aRegistro), pagina, tamano, total };
  }

  /** Un registro con su valor anterior y su valor nuevo (HU-14-03). */
  async obtener(id: number): Promise<DetalleAuditoriaDto> {
    const registro = await this.prisma.auditoria.findUnique({
      where: { id },
      select: SELECCION_REGISTRO,
    });
    if (!registro) {
      throw new NotFoundException(MENSAJE_REGISTRO_NO_EXISTE);
    }
    await this.dejarConstancia();
    return {
      ...aRegistro(registro),
      valorAnterior: aValor(registro.valor_anterior),
      valorNuevo: aValor(registro.valor_nuevo),
    };
  }

  /**
   * Deja en auditoría que la persona consultó la auditoría, como mucho una vez cada
   * MINUTOS_ENTRE_CONSTANCIAS. Nunca lanza: si falla, la consulta sigue (RF-29, excepción p3).
   */
  private async dejarConstancia(): Promise<void> {
    const idUsuario = contextoActual()?.idUsuario;
    if (idUsuario === undefined) {
      return;
    }
    try {
      const reciente = await this.prisma.auditoria.findFirst({
        where: {
          id_usuario: idUsuario,
          accion: 'consulta_sensible' satisfies AccionAuditoria,
          tabla_afectada: ENTIDAD_CONSULTA_AUDITORIA,
          fecha: {
            gte: new Date(Date.now() - MINUTOS_ENTRE_CONSTANCIAS * 60 * 1000),
          },
        },
        select: { id: true },
      });
      if (reciente) {
        return;
      }
    } catch (error) {
      this.logger.error(
        'No se pudo comprobar la última constancia de consulta de la auditoría.',
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }
    await this.auditoria.registrar({
      accion: 'consulta_sensible',
      tablaAfectada: ENTIDAD_CONSULTA_AUDITORIA,
      idRegistro: null,
    });
  }
}

function filtro(consulta: ConsultarAuditoriaDto): Prisma.auditoriaWhereInput {
  const { desde, hasta, usuario, accion, entidad, idRegistro } = consulta;
  if (desde && hasta && desde > hasta) {
    throw new BadRequestException(MENSAJE_RANGO_INVERTIDO);
  }
  if (idRegistro !== undefined && !entidad) {
    throw new BadRequestException(MENSAJE_FALTA_ENTIDAD);
  }

  const where: Prisma.auditoriaWhereInput = {};
  if (desde || hasta) {
    where.fecha = {
      ...(desde && { gte: inicioDelDia(desde) }),
      ...(hasta && { lt: new Date(inicioDelDia(hasta).getTime() + UN_DIA_MS) }),
    };
  }
  if (accion) {
    where.accion = accion;
  }
  if (entidad) {
    where.tabla_afectada = entidad;
  }
  if (idRegistro !== undefined) {
    where.id_registro = idRegistro;
  }
  if (usuario) {
    // Cada palabra debe aparecer en el nombre, los apellidos o el correo: así «ana demo»
    // encuentra a quien tiene «Ana» en los nombres y «Demo» en los apellidos.
    where.usuario = {
      AND: usuario
        .split(/\s+/)
        .map(literal)
        .map((palabra) => ({
          OR: [
            { nombres: { contains: palabra } },
            { apellidos: { contains: palabra } },
            { email: { contains: palabra } },
          ],
        })),
    };
  }
  return where;
}

/**
 * `contains` se traduce a LIKE, donde `%` y `_` son comodines: se escapan para que el guion
 * bajo de un correo busque un guion bajo y no cualquier carácter.
 */
function literal(palabra: string): string {
  return palabra.replace(/[\\%_]/g, '\\$&');
}

function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000${DESFASE_INSTITUCION}`);
}

function aRegistro(registro: RegistroLeido): RegistroAuditoriaDto {
  const { usuario } = registro;
  return {
    id: registro.id,
    fecha: registro.fecha?.toISOString() ?? null,
    accion: (registro.accion ?? '') as AccionAuditoria,
    entidad: registro.tabla_afectada ?? '',
    idRegistro: registro.id_registro,
    usuario: usuario
      ? {
          id: usuario.id,
          nombre: [usuario.nombres, usuario.apellidos]
            .filter(Boolean)
            .join(' ')
            .trim(),
        }
      : null,
    ip: registro.ip,
    campos: [
      ...new Set([
        ...Object.keys(aValor(registro.valor_anterior) ?? {}),
        ...Object.keys(aValor(registro.valor_nuevo) ?? {}),
      ]),
    ],
  };
}

/**
 * El valor guardado, sin campos sensibles y siempre como objeto: lo que no sea un objeto (una
 * lista o un dato suelto) va dentro de `valor`, para que el contrato sea uno solo.
 */
function aValor(
  guardado: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  if (guardado === null || guardado === undefined) {
    return null;
  }
  const limpio = omitirCamposSensibles(guardado as Prisma.InputJsonValue);
  return limpio !== null && typeof limpio === 'object' && !Array.isArray(limpio)
    ? (limpio as Record<string, unknown>)
    : { valor: limpio };
}
