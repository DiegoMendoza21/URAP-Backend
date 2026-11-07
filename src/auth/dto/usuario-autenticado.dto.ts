import { ApiProperty } from '@nestjs/swagger';

export class UsuarioAutenticadoDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiProperty({ example: 'Ana María', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Pérez Gómez', nullable: true, type: String })
  apellidos: string | null;

  @ApiProperty({ example: 'docente@unicartagena.edu.co' })
  correo: string;

  @ApiProperty({
    type: [String],
    example: ['Docente', 'Líder RAP'],
    description:
      'Roles activos del usuario. Un usuario puede tener varios a la vez.',
  })
  roles: string[];

  @ApiProperty({
    type: [String],
    example: ['proyectos.actualizar', 'proyectos.leer', 'rap.leer'],
    description:
      'Permisos del usuario como `modulo.permiso`: la unión de los de todos sus roles en la ' +
      'matriz de permisos (HU-01-03). El frontend arma el menú con ellos; la autorización ' +
      'la vuelve a comprobar el backend en cada petición.',
  })
  permisos: string[];
}
