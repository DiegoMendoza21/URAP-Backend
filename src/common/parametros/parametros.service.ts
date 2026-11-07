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
  evidenciaTiposPermitidos: 'evidencia_tipos_permitidos',
} as const;

export type ClaveParametro = (typeof PARAMETRO)[keyof typeof PARAMETRO];

/**
 * Lee los parámetros de negocio de `parametro_sistema`. Nada de esto va en el código:
 * cambian por programa sin desplegar otra versión (CLAUDE.md, «Nada de datos de negocio
 * hardcodeados»). Si un parámetro falta o está mal escrito es un problema de instalación,
 * no del usuario: queda en el registro técnico y la respuesta es un error genérico.
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
