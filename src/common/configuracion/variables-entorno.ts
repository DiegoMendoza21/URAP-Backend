// La conversión implícita de tipos lee los metadatos de diseño de cada propiedad.
import 'reflect-metadata';
import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum Entorno {
  Desarrollo = 'development',
  Pruebas = 'test',
  Produccion = 'production',
}

/**
 * Variables de entorno de la API (plantilla en .env.example). Se validan al arrancar:
 * si falta una o es inválida, la API no inicia. Las credenciales y secretos viven aquí,
 * nunca en el código ni en tablas editables (NFR-003, NFR-015).
 */
export class VariablesEntorno {
  @IsEnum(Entorno, {
    message: `NODE_ENV debe ser uno de: ${Object.values(Entorno).join(', ')}`,
  })
  NODE_ENV: Entorno = Entorno.Desarrollo;

  @IsInt({ message: 'PUERTO debe ser un número entero' })
  @Min(1, { message: 'PUERTO debe estar entre 1 y 65535' })
  @Max(65535, { message: 'PUERTO debe estar entre 1 y 65535' })
  PUERTO: number = 3001;

  @Matches(/^mysql:\/\/.+/, {
    message:
      'DATABASE_URL debe tener la forma mysql://usuario:clave@host:puerto/base',
  })
  DATABASE_URL: string;

  @IsString({ message: 'JWT_SECRETO es obligatorio' })
  @MinLength(32, { message: 'JWT_SECRETO debe tener al menos 32 caracteres' })
  JWT_SECRETO: string;

  @IsInt({
    message: 'JWT_EXPIRACION_MINUTOS debe ser un número entero de minutos',
  })
  @Min(1, { message: 'JWT_EXPIRACION_MINUTOS debe ser mayor que cero' })
  JWT_EXPIRACION_MINUTOS: number;

  /**
   * Cuántos proxies hay delante de la API (por ejemplo, el balanceador de carga del
   * despliegue). Con 0, Express toma la IP de la conexión directa. Con N, toma la IP del
   * cliente del encabezado X-Forwarded-For después de saltar N proxies. Un valor mayor que
   * los proxies reales permite falsificar la IP que queda en la sesión.
   */
  @IsInt({ message: 'PROXIES_CONFIABLES debe ser un número entero' })
  @Min(0, { message: 'PROXIES_CONFIABLES no puede ser negativo' })
  @Max(10, { message: 'PROXIES_CONFIABLES no puede ser mayor que 10' })
  PROXIES_CONFIABLES: number = 0;

  /** Orígenes autorizados por CORS (NFR-006). En el .env van separados por coma. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((origen) => origen.trim())
          .filter(Boolean)
      : value,
  )
  @ArrayNotEmpty({ message: 'CORS_ORIGENES debe declarar al menos un origen' })
  @IsUrl(
    { require_tld: false, require_protocol: true },
    {
      each: true,
      message: 'CORS_ORIGENES debe contener URLs como http://localhost:3000',
    },
  )
  CORS_ORIGENES: string[];

  /**
   * Carpeta del almacenamiento documental en disco (RF-24, NFR-007): ahí quedan las evidencias
   * y la base guarda solo su referencia. Debe estar fuera de cualquier carpeta servida por web
   * y, en un despliegue, en un volumen persistente. Es obligatoria en producción; en
   * desarrollo y pruebas, si falta, se usa `almacenamiento/` dentro del proyecto.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @ValidateIf(
    (variables: VariablesEntorno) =>
      variables.NODE_ENV === Entorno.Produccion ||
      variables.ALMACENAMIENTO_DIRECTORIO !== undefined,
  )
  @IsString({
    message: 'ALMACENAMIENTO_DIRECTORIO debe ser una ruta de carpeta',
  })
  @IsNotEmpty({
    message:
      'ALMACENAMIENTO_DIRECTORIO es obligatoria en producción: indique la carpeta del volumen persistente de los archivos',
  })
  ALMACENAMIENTO_DIRECTORIO?: string;
}

/** Carpeta del almacenamiento documental cuando ALMACENAMIENTO_DIRECTORIO no está definida. */
export const ALMACENAMIENTO_DIRECTORIO_DESARROLLO = 'almacenamiento';

export function validarVariablesEntorno(
  entrada: Record<string, unknown>,
): VariablesEntorno {
  const variables = plainToInstance(VariablesEntorno, entrada, {
    enableImplicitConversion: true,
  });
  const errores = validateSync(variables, { skipMissingProperties: false });

  if (errores.length > 0) {
    const detalle = errores
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('; ');
    throw new Error(`Variables de entorno inválidas: ${detalle}`);
  }
  return variables;
}
