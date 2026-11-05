import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { VariablesEntorno } from '../common/configuracion/variables-entorno.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AutenticacionGuard } from './autenticacion.guard.js';
import { ContrasenasService } from './contrasenas.service.js';

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
