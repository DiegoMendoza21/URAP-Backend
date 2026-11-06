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
}
