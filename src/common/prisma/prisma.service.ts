import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import {
  Entorno,
  PARAMETRO_CERTIFICADO_CA,
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
  return new PrismaMariaDb(
    opcionesConexion(
      config.get('DATABASE_URL', { infer: true }),
      config.get('NODE_ENV', { infer: true }),
    ),
  );
}

/**
 * Opciones del conector a partir de `DATABASE_URL`. Si la URL trae `sslcert` (la ruta del
 * certificado de la CA del servidor, el mismo parámetro que entiende el CLI de Prisma en
 * `migrate deploy`), la conexión va cifrada y se verifica el certificado del servidor: es el
 * caso de Amazon RDS (NFR-006). En producción es obligatorio (ver `validarVariablesEntorno`).
 *
 * MySQL 8.4 autentica con caching_sha2_password: sin TLS, el conector tiene que pedirle la
 * llave pública al servidor. Eso solo se permite fuera de producción, contra la base local.
 */
export function opcionesConexion(
  textoUrl: string,
  entorno: Entorno,
  leerArchivo: (ruta: string) => string = (ruta) => readFileSync(ruta, 'utf8'),
): ConstructorParameters<typeof PrismaMariaDb>[0] {
  const url = new URL(textoUrl);
  const certificado = url.searchParams.get(PARAMETRO_CERTIFICADO_CA);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ...(certificado
      ? {
          ssl: { ca: leerArchivo(certificado), rejectUnauthorized: true },
          allowPublicKeyRetrieval: false,
        }
      : { allowPublicKeyRetrieval: entorno !== Entorno.Produccion }),
  };
}
