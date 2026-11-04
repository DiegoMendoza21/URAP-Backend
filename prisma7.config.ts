import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no carga el .env por su cuenta. Node lo lee sin dependencias extra; en CI y en
// producción las variables llegan del entorno y el archivo no existe.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Base auxiliar que `prisma migrate dev` vacía y reconstruye para detectar diferencias.
    // Solo existe en desarrollo; `migrate deploy` (producción) no la usa.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
