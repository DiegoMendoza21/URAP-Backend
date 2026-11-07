import { Injectable } from '@nestjs/common';
import type { NombreRol } from '../auth/roles.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

/**
 * Programas sobre los que un usuario ejerce uno o varios roles (`usuario_rol.id_programa`).
 * `global` indica un rol sin programa, como el del administrador: alcanza a todos.
 */
export interface Alcance {
  global: boolean;
  programas: number[];
}

/** Mismo criterio que el inicio de sesión: rol activo, no revocado y de un catálogo activo. */
const FILTRO_ROLES_VIGENTES = {
  activo: true,
  fecha_revocacion: null,
  rol: { is: { activo: true } },
} as const;

/**
 * Resuelve el alcance por programa de los roles de un usuario. La matriz de permisos
 * (`URAP-34`) dice que los roles se ejercen sobre un programa: alguien que es Departamento
 * en un programa no actúa sobre otro. Cuando HU-01-03 lleve el programa de cada rol en la
 * sesión, este servicio puede leerlo de ahí en lugar de consultar la base.
 */
@Injectable()
export class AlcanceService {
  constructor(private readonly prisma: PrismaService) {}

  async alcance(
    idUsuario: number,
    roles: readonly NombreRol[],
  ): Promise<Alcance> {
    const filas = await this.prisma.usuario_rol.findMany({
      where: {
        ...FILTRO_ROLES_VIGENTES,
        id_usuario: idUsuario,
        rol: { is: { activo: true, nombre: { in: [...roles] } } },
      },
      select: { id_programa: true },
    });
    return {
      global: filas.some((fila) => fila.id_programa === null),
      programas: [
        ...new Set(
          filas
            .map((fila) => fila.id_programa)
            .filter((id): id is number => id !== null),
        ),
      ],
    };
  }

  async alcanzaPrograma(
    idUsuario: number,
    roles: readonly NombreRol[],
    idPrograma: number | null,
  ): Promise<boolean> {
    const { global, programas } = await this.alcance(idUsuario, roles);
    return global || (idPrograma !== null && programas.includes(idPrograma));
  }
}
