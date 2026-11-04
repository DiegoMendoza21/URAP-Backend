import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { EstadoSaludDto } from './dto/estado-salud.dto.js';

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verificar(): Promise<EstadoSaludDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        'La base de datos no respondió a la verificación de salud',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'La base de datos no está disponible.',
      );
    }
    return { estado: 'disponible', fecha: new Date().toISOString() };
  }
}
