import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { AppModule } from '../app.module.js';
import { ContrasenasService } from '../auth/contrasenas.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  ALMACENAMIENTO_DOCUMENTAL,
  type AlmacenamientoDocumental,
} from '../documentos/almacenamiento/almacenamiento-documental.js';
import { USUARIOS_DEMO } from './demostracion.js';
import { leerOpcionesSembrado } from './opciones.js';
import { sembrarDatosIniciales } from './sembrar-datos.js';

/**
 * Carga los datos iniciales: `npm run db:sembrar` (datos base, para cualquier ambiente) o
 * `npm run db:sembrar:demo` (además, los de demostración; nunca en producción). Se puede
 * repetir sin duplicar nada ni pisar lo que ya exista (ver sembrar-datos.ts).
 */
async function sembrar(): Promise<void> {
  // Como prisma7.config.ts: el .env local si existe; en CI las variables llegan del entorno.
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const opciones = leerOpcionesSembrado(process.argv.slice(2), process.env);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    let demostracion;
    if (opciones.demo) {
      // El mismo hash que verifica el inicio de sesión (NFR-005), uno por usuario.
      const contrasenas = app.get(ContrasenasService);
      const hashesUsuarios = new Map<string, string>();
      for (const { correo } of USUARIOS_DEMO) {
        hashesUsuarios.set(
          correo,
          await contrasenas.hashear(opciones.contrasenaDemo),
        );
      }
      demostracion = { hashesUsuarios };
    }

    const { resumen, archivos } = await sembrarDatosIniciales(
      app.get(PrismaService),
      demostracion,
    );
    // Las imágenes de las evidencias de demostración, después de confirmar la transacción. Se
    // vuelven a escribir en cada corrida: son siempre las mismas y así no falta ninguna.
    if (archivos.length > 0) {
      const almacenamiento = app.get<AlmacenamientoDocumental>(
        ALMACENAMIENTO_DOCUMENTAL,
        { strict: false },
      );
      for (const { clave, contenido } of archivos) {
        await almacenamiento.guardar(clave, contenido);
      }
    }
    console.log(
      opciones.demo
        ? 'Datos base y de demostración cargados. Registros en la base:'
        : 'Datos base cargados (sin datos de demostración). Registros en la base:',
    );
    console.table(resumen);
    if (opciones.demo) {
      console.log(
        `Recorrido de demostración: ${archivos.length} imágenes de evidencias guardadas.\n` +
          'Usuarios de demostración (contraseña: CONTRASENA_USUARIOS_DEMO):\n' +
          USUARIOS_DEMO.map(
            ({ correo, roles }) => `  ${correo}  ${roles.join(', ')}`,
          ).join('\n'),
      );
    }
  } finally {
    await app.close();
  }
}

await sembrar();
