import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class IniciarSesionDto {
  @ApiProperty({
    example: 'docente@unicartagena.edu.co',
    description: 'Correo institucional con el que está registrado el usuario',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo institucional no es válido.' })
  @MaxLength(255, {
    message: 'El correo institucional no puede superar 255 caracteres.',
  })
  correo: string;

  @ApiProperty({ example: 'Contraseña-Segura-2026', format: 'password' })
  @IsString({ message: 'La contraseña es obligatoria.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  // Acota el trabajo de scrypt ante cuerpos enormes; ninguna contraseña legítima llega aquí.
  @MaxLength(128, { message: 'La contraseña no puede superar 128 caracteres.' })
  contrasena: string;
}
