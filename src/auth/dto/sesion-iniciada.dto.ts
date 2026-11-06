import { ApiProperty } from '@nestjs/swagger';
import { UsuarioAutenticadoDto } from './usuario-autenticado.dto.js';

export class SesionIniciadaDto {
  @ApiProperty({
    description:
      'Token JWT. Se envía en cada petición protegida en el encabezado ' +
      '`Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;

  @ApiProperty({
    description: 'Fecha y hora en que vence el token (NFR-003)',
    example: '2026-11-06T02:15:00.000Z',
  })
  expiraEn: string;

  @ApiProperty({ type: UsuarioAutenticadoDto })
  usuario: UsuarioAutenticadoDto;
}
