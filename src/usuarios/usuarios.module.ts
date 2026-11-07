import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

/** Usuarios, roles y permisos (RF-02, RF-03). Por ahora, roles y matriz de permisos. */
@Module({
  controllers: [RolesController],
  providers: [RolesService],
})
export class UsuariosModule {}
