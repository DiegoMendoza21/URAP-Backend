import { ApiProperty } from '@nestjs/swagger';

export class EstadoSaludDto {
  @ApiProperty({ enum: ['disponible'], example: 'disponible' })
  estado: 'disponible';

  @ApiProperty({ example: '2026-11-03T21:15:00.000Z' })
  fecha: string;
}
