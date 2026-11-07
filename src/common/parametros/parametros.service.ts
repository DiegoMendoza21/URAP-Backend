import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Claves de `parametro_sistema` que lee el código (HU-03-07, datos iniciales). */
export const PARAMETRO = {
  archivoTamanoMaximoMb: 'archivo_tamano_maximo_mb',
  archivoTiposPermitidos: 'archivo_tipos_permitidos',
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
   * Parámetro de tipo entero, mayor que cero. Si falta o está mal escrito es un problema de
   * instalación, no del usuario: queda en el registro técnico y la respuesta es un error
   * genérico.
   */
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
