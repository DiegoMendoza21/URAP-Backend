import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const TAMANO_PAGINA_POR_DEFECTO = 20;
export const TAMANO_PAGINA_MAXIMO = 100;

/** Recorta espacios; una cadena vacía cuenta como no indicada. */
function recortar({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const texto = value.trim();
  return texto === '' ? undefined : texto;
}

export class ConsultarRolesDto {
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
}

/** Un permiso sobre un módulo, con los códigos del catálogo. */
export class PermisoAsignadoDto {
  @ApiProperty({ example: 'proyectos', description: 'Código del módulo' })
  @IsString({ message: 'Indique el módulo de cada permiso.' })
  @IsNotEmpty({ message: 'Indique el módulo de cada permiso.' })
  modulo: string;

  @ApiProperty({
    example: 'leer',
    description:
      'Código del permiso: leer, crear, actualizar, eliminar, generar, administrar o aprobar',
  })
  @IsString({ message: 'Indique el permiso de cada módulo.' })
  @IsNotEmpty({ message: 'Indique el permiso de cada módulo.' })
  permiso: string;
}

const clavePermiso = (permiso: PermisoAsignadoDto) =>
  `${permiso?.modulo}.${permiso?.permiso}`;

class ConPermisosDto {
  @ApiProperty({
    type: [PermisoAsignadoDto],
    description:
      'Permisos del rol por módulo. Debe incluir al menos un permiso de lectura (RF-03, p4).',
  })
  @IsArray({ message: 'Indique los permisos del rol.' })
  @ArrayMinSize(1, {
    message: 'El rol debe conservar al menos un permiso de lectura.',
  })
  @ArrayUnique(clavePermiso, {
    message: 'Un permiso no puede repetirse en el mismo módulo.',
  })
  @ValidateNested({ each: true })
  @Type(() => PermisoAsignadoDto)
  permisos: PermisoAsignadoDto[];
}

export class CrearRolDto extends ConPermisosDto {
  @ApiProperty({ example: 'Coordinación de prácticas' })
  @Transform(recortar)
  @IsString({ message: 'El nombre del rol es obligatorio.' })
  @MinLength(3, {
    message: 'El nombre del rol debe tener al menos 3 caracteres.',
  })
  @MaxLength(100, {
    message: 'El nombre del rol no puede superar 100 caracteres.',
  })
  nombre: string;

  @ApiPropertyOptional({ example: 'Acompaña las prácticas profesionales.' })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser un texto.' })
  @MaxLength(255, {
    message: 'La descripción no puede superar 255 caracteres.',
  })
  descripcion?: string;
}

export class EditarRolDto {
  @ApiPropertyOptional({
    example: 'Coordinación de prácticas',
    description: 'Los seis roles del sistema (RF-03) no se pueden renombrar.',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'El nombre del rol debe ser un texto.' })
  @MinLength(3, {
    message: 'El nombre del rol debe tener al menos 3 caracteres.',
  })
  @MaxLength(100, {
    message: 'El nombre del rol no puede superar 100 caracteres.',
  })
  nombre?: string;

  @ApiPropertyOptional({ example: 'Acompaña las prácticas profesionales.' })
  @IsOptional()
  @Transform(recortar)
  @IsString({ message: 'La descripción debe ser un texto.' })
  @MaxLength(255, {
    message: 'La descripción no puede superar 255 caracteres.',
  })
  descripcion?: string;
}

export class ReemplazarPermisosDto extends ConPermisosDto {}

// --- Respuestas ---

export class RolDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'Coordinación de prácticas' })
  nombre: string;

  @ApiProperty({
    example: 'Acompaña las prácticas profesionales.',
    nullable: true,
    type: String,
  })
  descripcion: string | null;

  @ApiProperty({ example: true })
  activo: boolean;

  @ApiProperty({
    example: false,
    description:
      'Uno de los seis roles de RF-03: no se puede renombrar ni inactivar.',
  })
  sistema: boolean;

  @ApiProperty({
    example: 3,
    description: 'Usuarios activos con el rol asignado y vigente',
  })
  usuariosActivos: number;

  @ApiProperty({ type: [PermisoAsignadoDto] })
  permisos: PermisoAsignadoDto[];
}

export class PaginaRolesDto {
  @ApiProperty({ type: [RolDto] })
  elementos: RolDto[];

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 20 })
  tamano: number;

  @ApiProperty({ example: 6 })
  total: number;
}

export class ElementoCatalogoDto {
  @ApiProperty({ example: 'proyectos' })
  codigo: string;

  @ApiProperty({ example: 'Proyectos docentes' })
  nombre: string;
}

export class MatrizPermisosDto {
  @ApiProperty({
    type: [ElementoCatalogoDto],
    description: 'Filas de la matriz, en su orden',
  })
  modulos: ElementoCatalogoDto[];

  @ApiProperty({
    type: [ElementoCatalogoDto],
    description:
      'Columnas: leer, crear, actualizar, eliminar, generar, administrar y aprobar',
  })
  permisos: ElementoCatalogoDto[];

  @ApiProperty({
    type: [RolDto],
    description: 'Todos los roles, activos e inactivos, con sus permisos',
  })
  roles: RolDto[];
}
