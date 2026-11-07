import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Claves de `parametro_sistema` que lee el código (HU-03-07, datos iniciales). */
export const PARAMETRO = {
  /** RF-23: días de anticipación con que una sesión se marca «Por vencer». */
  alertaDiasAnticipacion: 'alerta_dias_anticipacion',
  archivoTamanoMaximoMb: 'archivo_tamano_maximo_mb',
  archivoTiposPermitidos: 'archivo_tipos_permitidos',
} as const;

export type ClaveParametro = (typeof PARAMETRO)[keyof typeof PARAMETRO];

/**
 * Lee los parámetros de negocio de `parametro_sistema` (HU-03-07). Nada de esto va en el código:
 * cambian por programa sin desplegar otra versión (CLAUDE.md, «Nada de datos de negocio
 * hardcodeados»). La pantalla para editarlos llega con HU-03-07; los valores iniciales los carga
 * `npm run db:sembrar`.
 *
 * Hay dos maneras de leerlos, según si la operación puede seguir sin el parámetro:
 * - `enteroPositivo` y `lista` fallan con un error genérico si falta o está mal escrito: sin el
 *   tamaño máximo o los tipos permitidos no se puede validar un archivo.
 * - `entero` devuelve nulo: la alerta de «Por vencer» (RF-23) puede omitirse sin impedir que el
 *   calendario se muestre.
 * En los dos casos el problema queda en el registro técnico, porque es de instalación y no del
 * usuario.
 */
@Injectable()
export class ParametrosService {
  private readonly logger = new Logger(ParametrosService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Parámetro entero, cero o mayor. Si no existe o no es un entero válido devuelve nulo y lo
   * deja en el registro técnico: quien lo usa decide cómo seguir sin él, en lugar de suponer un
   * valor que el programa no configuró.
   */
  async entero(clave: ClaveParametro): Promise<number | null> {
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
