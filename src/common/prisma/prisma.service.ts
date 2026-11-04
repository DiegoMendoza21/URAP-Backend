import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import {
  Entorno,
  type VariablesEntorno,
} from '../configuracion/variables-entorno.js';

/**
 * Cliente de Prisma compartido por toda la API: una sola instancia y un solo pool de
 * conexiones. Los modelos viven en prisma/schema.prisma y cambian solo por migración.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<VariablesEntorno, true>) {
    super({ adapter: crearAdaptador(config) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function crearAdaptador(
  config: ConfigService<VariablesEntorno, true>,
): PrismaMariaDb {
  const url = new URL(config.get('DATABASE_URL', { infer: true }));

  return new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    // MySQL 8.4 autentica con caching_sha2_password: sin TLS, el conector tiene que pedirle
    // la llave pública al servidor. Eso solo es aceptable contra la base local. En
    // producción queda apagado porque la conexión con RDS debe ir cifrada (NFR-006).
    allowPublicKeyRetrieval:
      config.get('NODE_ENV', { infer: true }) !== Entorno.Produccion,
  });
}
