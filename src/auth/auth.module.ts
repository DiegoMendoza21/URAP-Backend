import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { VariablesEntorno } from '../common/configuracion/variables-entorno.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AutenticacionGuard } from './autenticacion.guard.js';
import { ContrasenasService } from './contrasenas.service.js';

export const MENSAJE_DEMASIADOS_INTENTOS =
  'Se hicieron demasiados intentos de inicio de sesión desde esta conexión. ' +
  'Espere un momento e intente de nuevo.';

@Module({
  imports: [
    // Secreto y vigencia salen del entorno, nunca de parametro_sistema (NFR-003).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<VariablesEntorno, true>) => ({
        secret: config.get('JWT_SECRETO', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_EXPIRACION_MINUTOS', { infer: true }) * 60,
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Límite de peticiones por IP (HU-01-04). Solo se aplica donde se usa ThrottlerGuard:
    // hoy, el inicio de sesión. Guarda los contadores en memoria, lo que basta con una sola
    // instancia de la API; con varias, cada una cuenta por su lado.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<VariablesEntorno, true>) => ({
        throttlers: [
          {
            ttl:
              config.get('INICIO_SESION_VENTANA_SEGUNDOS', { infer: true }) *
              1000,
            limit: config.get('INICIO_SESION_LIMITE_POR_IP', { infer: true }),
          },
        ],
        errorMessage: MENSAJE_DEMASIADOS_INTENTOS,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ContrasenasService,
    { provide: APP_GUARD, useClass: AutenticacionGuard },
  ],
  // HU-02-01 (crear usuarios) usa el mismo hash de contraseñas.
  exports: [ContrasenasService],
})
export class AuthModule {}
