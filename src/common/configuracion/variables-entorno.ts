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
   * Cuántos balanceadores hay delante del servidor de Next.js del frontend, que reenvía cada
   * petición sin agregar su propia entrada a X-Forwarded-For. Con 0, Express toma la IP de la
   * conexión directa: en local es la del usuario, pero en el despliegue sería la de Next.js
   * para todos. Con N, toma la IP del cliente de X-Forwarded-For después de saltar N
   * proxies. Un valor mayor que los balanceadores reales permite falsificar la IP que queda
   * en la sesión y en la auditoría, y saltarse el límite de intentos por IP.
   */
  @IsInt({ message: 'PROXIES_CONFIABLES debe ser un número entero' })
  @Min(0, { message: 'PROXIES_CONFIABLES no puede ser negativo' })
  @Max(10, { message: 'PROXIES_CONFIABLES no puede ser mayor que 10' })
  PROXIES_CONFIABLES: number = 0;

  /**
   * Límite de peticiones de inicio de sesión por IP dentro de la ventana (HU-01-04). Frena las
   * ráfagas con correos inventados, que el bloqueo por cuenta no alcanza. Es un ajuste del
   * despliegue, no un parámetro de negocio: por eso va aquí y no en parametro_sistema.
   */
  @IsInt({ message: 'INICIO_SESION_LIMITE_POR_IP debe ser un número entero' })
  @Min(1, { message: 'INICIO_SESION_LIMITE_POR_IP debe ser mayor que cero' })
  @Max(1000, {
    message: 'INICIO_SESION_LIMITE_POR_IP no puede ser mayor que 1000',
  })
  INICIO_SESION_LIMITE_POR_IP: number = 10;

  /** Ventana, en segundos, del límite de peticiones de inicio de sesión por IP. */
  @IsInt({
    message: 'INICIO_SESION_VENTANA_SEGUNDOS debe ser un número entero',
  })
  @Min(1, { message: 'INICIO_SESION_VENTANA_SEGUNDOS debe ser mayor que cero' })
  @Max(3600, {
    message: 'INICIO_SESION_VENTANA_SEGUNDOS no puede ser mayor que 3600',
  })
  INICIO_SESION_VENTANA_SEGUNDOS: number = 60;

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

/**
 * Parámetro de `DATABASE_URL` con la ruta del certificado de la CA del servidor MySQL. Es el
 * nombre que usa el CLI de Prisma, así que la misma URL sirve para `migrate deploy` y para la
 * API. Con él, la conexión va cifrada y verificada (NFR-006).
 */
export const PARAMETRO_CERTIFICADO_CA = 'sslcert';

export const MENSAJE_BASE_SIN_TLS =
  'En producción, DATABASE_URL debe terminar en ?sslcert=<ruta del certificado de la CA del servidor>&sslaccept=strict: la conexión con la base va cifrada y verificada (NFR-006). Ver docs/despliegue.md.';

/**
 * Sin el valor de la URL, que lleva la contraseña: este mensaje termina en el registro del
 * contenedor.
 */
export const MENSAJE_URL_BASE_ILEGIBLE =
  'DATABASE_URL no se puede leer: revise que la contraseña no tenga @ : / ? # sin codificar (%40, %3A, %2F, %3F, %23).';

/** Carpeta del almacenamiento documental cuando ALMACENAMIENTO_DIRECTORIO no está definida. */
export const ALMACENAMIENTO_DIRECTORIO_DESARROLLO = 'almacenamiento';

export function validarVariablesEntorno(
  entrada: Record<string, unknown>,
): VariablesEntorno {
  const variables = plainToInstance(VariablesEntorno, entrada, {
    enableImplicitConversion: true,
  });
  const errores = validateSync(variables, { skipMissingProperties: false });

  const mensajes = errores.flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  if (typeof variables.DATABASE_URL === 'string') {
    // Una URL que no se puede leer se rechaza aquí, con un mensaje fijo: si llegara a
    // `new URL()` en PrismaService, Node imprimiría el error con la URL y su contraseña.
    if (!URL.canParse(variables.DATABASE_URL)) {
      mensajes.push(MENSAJE_URL_BASE_ILEGIBLE);
    } else if (
      variables.NODE_ENV === Entorno.Produccion &&
      !conTlsVerificado(variables.DATABASE_URL)
    ) {
      mensajes.push(MENSAJE_BASE_SIN_TLS);
    }
  }
  if (mensajes.length > 0) {
    throw new Error(`Variables de entorno inválidas: ${mensajes.join('; ')}`);
  }
  return variables;
}

/**
 * Si la URL de la base pide la conexión cifrada y verificada: la ruta de la CA (`sslcert`) y
 * `sslaccept=strict`. La API verifica el certificado aunque falte `sslaccept`, pero el CLI de
 * Prisma (`migrate deploy`) usa la misma URL y, sin `strict`, acepta cualquier certificado.
 */
function conTlsVerificado(textoUrl: string): boolean {
  const parametros = new URL(textoUrl).searchParams;
  return (
    Boolean(parametros.get(PARAMETRO_CERTIFICADO_CA)) &&
    parametros.get('sslaccept') === 'strict'
  );
}
