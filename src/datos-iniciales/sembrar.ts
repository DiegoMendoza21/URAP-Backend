import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { AppModule } from '../app.module.js';
import { ContrasenasService } from '../auth/contrasenas.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { USUARIOS_DEMO } from './demostracion.js';
import { sembrarDatosIniciales } from './sembrar-datos.js';

const LONGITUD_MINIMA_CONTRASENA = 12;

/**
 * Carga los datos iniciales y de demostración: `npm run db:sembrar`. Se puede repetir sin
 * duplicar nada ni pisar lo que ya exista (ver sembrar-datos.ts).
 */
async function sembrar(): Promise<void> {
  // Como prisma7.config.ts: el .env local si existe; en CI las variables llegan del entorno.
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const contrasena = process.env.CONTRASENA_USUARIOS_DEMO ?? '';
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    throw new Error(
      `CONTRASENA_USUARIOS_DEMO falta o tiene menos de ${LONGITUD_MINIMA_CONTRASENA} ` +
        'caracteres. Defínala en el .env (ver .env.example).',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    // El mismo hash que verifica el inicio de sesión (NFR-005), uno por usuario.
    const contrasenas = app.get(ContrasenasService);
    const hashes = new Map<string, string>();
    for (const { correo } of USUARIOS_DEMO) {
      hashes.set(correo, await contrasenas.hashear(contrasena));
    }

    const resumen = await sembrarDatosIniciales(app.get(PrismaService), hashes);
    console.log('Datos iniciales cargados. Registros en la base:');
    console.table(resumen);
    console.log(
      'Usuarios de demostración (contraseña: CONTRASENA_USUARIOS_DEMO):\n' +
        USUARIOS_DEMO.map(
          ({ correo, roles }) => `  ${correo}  ${roles.join(', ')}`,
        ).join('\n'),
    );
  } finally {
    await app.close();
  }
}

await sembrar();
