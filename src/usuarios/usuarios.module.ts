import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProyectosDocentesModule } from '../proyectos-docentes/proyectos-docentes.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';

/**
 * Usuarios, roles y permisos (RF-02, RF-03). De `AuthModule` sale el hash de contraseñas y
 * de `ProyectosDocentesModule`, el alcance por programa de quien consulta o administra.
 */
@Module({
  imports: [AuthModule, ProyectosDocentesModule],
  controllers: [RolesController, UsuariosController],
  providers: [RolesService, UsuariosService],
})
export class UsuariosModule {}
