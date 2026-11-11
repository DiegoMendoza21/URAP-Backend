import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const TAMANO_PAGINA_POR_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;

export const ESTADOS_USUARIO = ['activo', 'inactivo'] as const;
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];

/** Recorta espacios; una cadena vacía cuenta como no indicada. */
function recortar({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const texto = value.trim();
  return texto === '' ? undefined : texto;
}

/** El correo se guarda y se compara en minúsculas. */
function correoNormalizado({ value }: { value: unknown }): unknown {
  const texto = recortar({ value });
  return typeof texto === 'string' ? texto.toLowerCase() : texto;
}

/** Filtros del listado de usuarios (HU-02-04; RF-02, p2): programa, rol y estado. */
export class ConsultarUsuariosDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser 1 o mayor.' })
  pagina: number = 1;

  @ApiPropertyOptional({
    example: TAMANO_PAGINA_POR_DEFECTO,
    default: TAMANO_PAGINA_POR_DEFECTO,
    maximum: TAMANO_PAGINA_MAXIMO,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de página debe ser 1 o mayor.' })
  @Max(TAMANO_PAGINA_MAXIMO, {
    message: `El tamaño de página no puede superar ${TAMANO_PAGINA_MAXIMO}.`,
  })
  tamano: number = TAMANO_PAGINA_POR_DEFECTO;

  @ApiPropertyOptional({
    example: 1,
    description: 'Usuarios del programa o con un rol vigente en él',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El programa no es válido.' })
  @Min(1, { message: 'El programa no es válido.' })
  idPrograma?: number;

  @ApiPropertyOptional({ example: 3, description: 'Con ese rol vigente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El rol no es válido.' })
  @Min(1, { message: 'El rol no es válido.' })
  idRol?: number;

  @ApiPropertyOptional({ enum: ESTADOS_USUARIO })
  @IsOptional()
  @Transform(recortar)
  @IsIn(ESTADOS_USUARIO, {
    message: 'El estado debe ser «activo» o «inactivo».',
  })
  estado?: EstadoUsuario;

  @ApiPropertyOptional({
    example: 'Demo',
    description:
      'Texto que debe aparecer en el nombre, los apellidos o el correo',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El texto de búsqueda no es válido.' })
  @MaxLength(100, {
    message: 'El texto de búsqueda no puede superar 100 caracteres.',
  })
  buscar?: string;
}

/** Un rol y el programa sobre el que se ejerce (`usuario_rol`). */
export class RolParaAsignarDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt({ message: 'Seleccione el rol.' })
  @Min(1, { message: 'Seleccione el rol.' })
  idRol: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 1,
    description:
      'Programa sobre el que se ejerce el rol. Vacío: el rol alcanza a todos los programas, como el del Administrador',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El programa del rol no es válido.' })
  @Min(1, { message: 'El programa del rol no es válido.' })
  idPrograma?: number | null;
}

const clavePar = (par: RolParaAsignarDto) =>
  `${par?.idRol}@${par?.idPrograma ?? ''}`;

/** Datos de la persona. Los comparten la creación y la edición. */
class DatosUsuarioDto {
  @ApiProperty({ example: 'Persona' })
  @Transform(recortar)
  @IsString({ message: 'Indique los nombres.' })
  @MinLength(2, { message: 'Los nombres deben tener al menos 2 caracteres.' })
  @MaxLength(100, { message: 'Los nombres no pueden superar 100 caracteres.' })
  nombres: string;

  @ApiProperty({ example: 'De Prueba' })
  @Transform(recortar)
  @IsString({ message: 'Indique los apellidos.' })
  @MinLength(2, { message: 'Los apellidos deben tener al menos 2 caracteres.' })
  @MaxLength(100, {
    message: 'Los apellidos no pueden superar 100 caracteres.',
  })
  apellidos: string;

  @ApiProperty({
    example: '1000000001',
    description:
      'Documento de identidad. Dato personal: solo lo ve quien administra',
  })
  @Transform(recortar)
  @IsString({ message: 'Indique el documento de identidad.' })
  @Matches(/^[A-Za-z0-9-]{4,20}$/, {
    message:
      'El documento debe tener entre 4 y 20 caracteres: números, letras o guiones, sin espacios ni puntos.',
  })
  identificacion: string;

  @ApiProperty({ example: 'persona.prueba@urap.local' })
  @Transform(correoNormalizado)
  @IsEmail({}, { message: 'El correo institucional no es válido.' })
  @MaxLength(255, { message: 'El correo no puede superar 255 caracteres.' })
  correo: string;

  @ApiProperty({ example: 1, description: 'Programa al que pertenece' })
  @Type(() => Number)
  @IsInt({ message: 'Seleccione el programa.' })
  @Min(1, { message: 'Seleccione el programa.' })
  idPrograma: number;
}

export class CrearUsuarioDto extends DatosUsuarioDto {
  @ApiProperty({
    type: [RolParaAsignarDto],
    description: 'Uno o varios roles, cada uno con su programa (RF-02, p4)',
  })
  @IsArray({ message: 'Asigne al menos un rol.' })
  @ArrayMinSize(1, { message: 'Asigne al menos un rol.' })
  @ArrayMaxSize(20, {
    message: 'No se pueden asignar más de 20 roles a la vez.',
  })
  @ValidateNested({ each: true })
  @Type(() => RolParaAsignarDto)
  roles: RolParaAsignarDto[];
}

/** Edición (HU-02-02): solo llegan los campos que cambian. Los roles tienen sus propias rutas. */
export class EditarUsuarioDto {
  @ApiPropertyOptional({ example: 'Persona' })
  @ValidateIf((_, valor) => valor !== undefined)
  @Transform(recortar)
  @IsString({ message: 'Indique los nombres.' })
  @MinLength(2, { message: 'Los nombres deben tener al menos 2 caracteres.' })
  @MaxLength(100, { message: 'Los nombres no pueden superar 100 caracteres.' })
  nombres?: string;

  @ApiPropertyOptional({ example: 'De Prueba' })
  @ValidateIf((_, valor) => valor !== undefined)
  @Transform(recortar)
  @IsString({ message: 'Indique los apellidos.' })
  @MinLength(2, { message: 'Los apellidos deben tener al menos 2 caracteres.' })
  @MaxLength(100, {
    message: 'Los apellidos no pueden superar 100 caracteres.',
  })
  apellidos?: string;

  @ApiPropertyOptional({ example: '1000000001' })
  @ValidateIf((_, valor) => valor !== undefined)
  @Transform(recortar)
  @IsString({ message: 'Indique el documento de identidad.' })
  @Matches(/^[A-Za-z0-9-]{4,20}$/, {
    message:
      'El documento debe tener entre 4 y 20 caracteres: números, letras o guiones, sin espacios ni puntos.',
  })
  identificacion?: string;

  @ApiPropertyOptional({ example: 'persona.prueba@urap.local' })
  @ValidateIf((_, valor) => valor !== undefined)
  @Transform(correoNormalizado)
  @IsEmail({}, { message: 'El correo institucional no es válido.' })
  @MaxLength(255, { message: 'El correo no puede superar 255 caracteres.' })
  correo?: string;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((_, valor) => valor !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'Seleccione el programa.' })
  @Min(1, { message: 'Seleccione el programa.' })
  idPrograma?: number;
}

export class CambiarEstadoUsuarioDto {
  @ApiProperty({
    example: false,
    description: '`false` inactiva al usuario; `true` lo reactiva',
  })
  @IsBoolean({ message: 'Indique si el usuario queda activo o inactivo.' })
  activo: boolean;
}

export class RolVigenteDto {
  @ApiProperty({ example: 41, description: 'Identificador de la asignación' })
  id: number;

  @ApiProperty({ example: 3 })
  idRol: number;

  @ApiProperty({ example: 'Docente responsable' })
  rol: string;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  idPrograma: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Administración Industrial',
    description: 'Vacío: el rol alcanza a todos los programas',
  })
  programa: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaAsignacion: string | null;
}

export class UsuarioDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiProperty({ example: 'Persona' })
  nombres: string;

  @ApiProperty({ example: 'De Prueba' })
  apellidos: string;

  @ApiProperty({ example: 'persona.prueba@urap.local' })
  correo: string;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  idPrograma: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Administración Industrial',
  })
  programa: string | null;

  @ApiProperty({ example: true })
  activo: boolean;

  @ApiProperty({
    type: [RolVigenteDto],
    description: 'Roles vigentes: activos, sin revocar y de un rol activo',
  })
  roles: RolVigenteDto[];
}

export class PaginaUsuariosDto {
  @ApiProperty({ type: [UsuarioDto] })
  elementos: UsuarioDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ example: 42 })
  total: number;
}

export class DetalleUsuarioDto extends UsuarioDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '1000000001',
    description:
      'Documento de identidad. Solo llega a quien administra usuarios; a los demás, vacío',
  })
  identificacion: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  ultimoAcceso: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Si la cuenta está bloqueada por intentos fallidos, hasta cuándo',
  })
  bloqueadoHasta: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaCreacion: string | null;
}

export class UsuarioCreadoDto {
  @ApiProperty({ type: DetalleUsuarioDto })
  usuario: DetalleUsuarioDto;

  @ApiProperty({
    example: 'Kp7m-Xw3q-Rt9z-Hn4c',
    description:
      'Contraseña temporal. Se devuelve solo esta vez: no se guarda en claro y no se puede volver a consultar',
  })
  contrasenaTemporal: string;
}

export class ContrasenaTemporalDto {
  @ApiProperty({
    example: 'Kp7m-Xw3q-Rt9z-Hn4c',
    description: 'Se devuelve solo esta vez',
  })
  contrasenaTemporal: string;
}

export const TIPOS_EVENTO_ROL = ['asignacion', 'revocacion'] as const;

/** Un momento del historial de roles de un usuario (HU-02-07). */
export class EventoRolDto {
  @ApiProperty({ example: 41, description: 'Identificador de la asignación' })
  idAsignacion: number;

  @ApiProperty({ enum: TIPOS_EVENTO_ROL, example: 'asignacion' })
  tipo: (typeof TIPOS_EVENTO_ROL)[number];

  @ApiProperty({ example: 3 })
  idRol: number;

  @ApiProperty({ example: 'Docente responsable' })
  rol: string;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  idPrograma: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Administración Industrial',
    description: 'Vacío: el rol alcanza a todos los programas',
  })
  programa: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fecha: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Administrador Demo',
    description:
      'Quién asignó o revocó el rol. Vacío si no quedó registrado (roles de la carga inicial)',
  })
  realizadoPor: string | null;
}

export class HistorialRolesDto {
  @ApiProperty({
    type: [EventoRolDto],
    description: 'Del más reciente al más antiguo, hasta 200 eventos',
  })
  eventos: EventoRolDto[];
}

export class OpcionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administración Industrial' })
  nombre: string;
}

export class OpcionesUsuariosDto {
  @ApiProperty({
    type: [OpcionDto],
    description: 'Programas activos que el usuario alcanza',
  })
  programas: OpcionDto[];

  @ApiProperty({ type: [OpcionDto], description: 'Roles activos' })
  roles: OpcionDto[];
}

export { clavePar };
