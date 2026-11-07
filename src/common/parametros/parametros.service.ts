import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RangoEntero {
  minimo: number;
  maximo: number;
}

/** Claves de `parametro_sistema` que lee el código (HU-03-07, datos iniciales). */
export const PARAMETRO = {
  archivoTamanoMaximoMb: 'archivo_tamano_maximo_mb',
  archivoTiposPermitidos: 'archivo_tipos_permitidos',
  evidenciaTiposPermitidos: 'evidencia_tipos_permitidos',
} as const;

export type ClaveParametro = (typeof PARAMETRO)[keyof typeof PARAMETRO];

/**
 * Lee los parámetros de negocio de `parametro_sistema` (HU-03-07): el umbral de alerta, los
 * intentos de inicio de sesión, el tamaño de archivo… Nada de esto va en el código: cambian por
 * programa sin desplegar otra versión (CLAUDE.md, «Nada de datos de negocio hardcodeados»). La
 * pantalla para editarlos llega con HU-03-07; los valores iniciales los carga
 * `npm run db:sembrar`.
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

  /** Parámetro de tipo entero, mayor que cero. */
  async enteroPositivo(clave: ClaveParametro): Promise<number> {
    const valor = await this.leer(clave);
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0) {
      return this.fallar(clave, `no es un entero positivo: «${valor}»`);
    }
    return numero;
  }

  /** Parámetro de tipo lista, separado por comas. Los elementos van en minúscula. */
  async lista(clave: ClaveParametro): Promise<string[]> {
    const valor = await this.leer(clave);
    return valor
      .split(',')
      .map((elemento) => elemento.trim().toLowerCase())
      .filter((elemento) => elemento !== '');
  }

  /**
   * Valor entero, cero o mayor, de un parámetro. Si no existe o no es un entero válido devuelve
   * nulo y lo deja en el registro técnico: quien lo usa decide cómo seguir sin él, en lugar de
   * suponer un valor que el programa no configuró.
   */
  async entero(clave: string): Promise<number | null> {
    const parametro = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    const texto = parametro?.valor?.trim() ?? '';
    if (!/^\d+$/.test(texto)) {
      this.logger.error(
        parametro
          ? `El parámetro «${clave}» no es un entero válido: «${parametro.valor ?? ''}».`
          : `Falta el parámetro «${clave}». Corra npm run db:sembrar.`,
      );
      return null;
    }
    return Number(texto);
  }

  private async leer(clave: ClaveParametro): Promise<string> {
    const fila = await this.prisma.parametro_sistema.findUnique({
      where: { clave },
      select: { valor: true },
    });
    if (fila?.valor == null) {
      return this.fallar(clave, 'no existe. Corra npm run db:sembrar');
    }
    return fila.valor;
  }

  private fallar(clave: string, motivo: string): never {
    this.logger.error(`El parámetro «${clave}» ${motivo}.`);
    throw new InternalServerErrorException();
  }
}
