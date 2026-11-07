import type { PrismaService } from '../../src/common/prisma/prisma.service.js';

/**
 * Borra los datos de prueba de unos usuarios ficticios: auditoría, sesiones, roles y el
 * usuario. La auditoría va primero porque referencia al usuario (RF-29): en la aplicación los
 * usuarios se inactivan y nunca se borran, pero las pruebas sí limpian lo que crean.
 */
export async function borrarUsuariosDePrueba(
  prisma: PrismaService,
  idsUsuarios: number[],
): Promise<void> {
  const idsSesiones = (
    await prisma.sesion.findMany({
      where: { id_usuario: { in: idsUsuarios } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  await prisma.auditoria.deleteMany({
    where: {
      OR: [
        { id_usuario: { in: idsUsuarios } },
        { tabla_afectada: 'usuario', id_registro: { in: idsUsuarios } },
        { tabla_afectada: 'sesion', id_registro: { in: idsSesiones } },
      ],
    },
  });
  await prisma.sesion.deleteMany({
    where: { id_usuario: { in: idsUsuarios } },
  });
  await prisma.usuario_rol.deleteMany({
    where: { id_usuario: { in: idsUsuarios } },
  });
  await prisma.usuario.deleteMany({ where: { id: { in: idsUsuarios } } });
}
