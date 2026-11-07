import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RangoEntero {
  minimo: number;
  maximo: number;
}

/**
 * Lectura de los parámetros de negocio de la tabla `parametro_sistema` (CLAUDE.md, «nada de
 * datos de negocio hardcodeados»). La pantalla para editarlos llega con HU-03-07.
 *
 * Los parámetros de seguridad del despliegue (secreto y vigencia del JWT, límites de
 * peticiones) no van aquí: son variables de entorno.
 */
@Injectable()
export class ParametrosService {
  private readonly logger = new Logger(ParametrosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valor entero de un parámetro. Si falta, no es un entero o está fuera del rango, devuelve
   * `null` y lo registra como error técnico: es un problema de configuración que debe
   * corregirse, pero no debe tumbar la operación que lo consulta.
   */
  async leerEntero(clave: string, rango: RangoEntero): Promise<number | null> {
    const parametro = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    const texto = parametro?.valor?.trim() ?? '';
    const valor = /^-?\d+$/.test(texto) ? Number(texto) : Number.NaN;
    if (
      !Number.isSafeInteger(valor) ||
      valor < rango.minimo ||
      valor > rango.maximo
    ) {
      this.logger.error(
        parametro
          ? `El parámetro «${clave}» tiene un valor inválido («${parametro.valor}»): se ` +
              `esperaba un entero entre ${rango.minimo} y ${rango.maximo}.`
          : `Falta el parámetro «${clave}» en parametro_sistema (ver npm run db:sembrar).`,
      );
      return null;
    }
    return valor;
  }
}
