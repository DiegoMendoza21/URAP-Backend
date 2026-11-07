import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Lectura de los parámetros de negocio de `parametro_sistema` (HU-03-07): el umbral de alerta,
 * los intentos de inicio de sesión, el tamaño de archivo… Nunca se escriben en el código
 * (CLAUDE.md, «Nada de datos de negocio hardcodeados»). La pantalla para editarlos llega con
 * HU-03-07; los valores iniciales los carga `npm run db:sembrar`.
 */
@Injectable()
export class ParametrosService {
  private readonly logger = new Logger(ParametrosService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
