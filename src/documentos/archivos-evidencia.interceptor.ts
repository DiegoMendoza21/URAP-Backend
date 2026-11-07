import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import type { Observable } from 'rxjs';
import {
  PARAMETRO,
  ParametrosService,
} from '../common/parametros/parametros.service.js';

/** Campo del formulario multipart que trae los archivos. */
export const CAMPO_ARCHIVOS = 'archivos';

/**
 * Archivos por cada carga. No es un dato de negocio sino un tope técnico: los archivos se
 * reciben en memoria antes de validarlos, y RF-24 espera de dos a diez evidencias por RAP en
 * todo el período. Para cargar más, se repite la carga.
 */
export const MAXIMO_ARCHIVOS_POR_CARGA = 5;

/** Campos de texto del formulario: idRap, descripcion, fecha e idSesion, con holgura. */
const MAXIMO_CAMPOS = 10;
/** Tamaño máximo de cada campo de texto: la descripción admite 1000 caracteres. */
const TAMANO_MAXIMO_CAMPO = 16 * 1024;

export const MENSAJE_ARCHIVOS_ESPERADOS = `Envíe de 1 a ${MAXIMO_ARCHIVOS_POR_CARGA} archivos en el campo «${CAMPO_ARCHIVOS}».`;
export const MENSAJE_FORMULARIO_INVALIDO =
  'No se pudieron recibir los archivos. Vuelva a intentarlo.';

export function mensajeTamanoExcedido(tamanoMaximoMb: number): string {
  return `Cada archivo puede pesar hasta ${tamanoMaximoMb} MB y al menos uno lo supera. Reduzca su tamaño o elija otro.`;
}

/**
 * Recibe en memoria los archivos de una carga de evidencias (RF-24, p3 y p4), con el tamaño
 * máximo de `parametro_sistema` (`archivo_tamano_maximo_mb`, NFR-019). Lo lee en cada
 * petición, para que el parámetro se pueda cambiar sin desplegar. Si un archivo lo supera,
 * multer deja de leer y la carga completa se rechaza con el límite en el mensaje (p4).
 *
 * El tipo de cada archivo no se valida aquí, sino en el servicio, con su contenido.
 */
@Injectable()
export class ArchivosEvidenciaInterceptor implements NestInterceptor {
  constructor(private readonly parametros: ParametrosService) {}

  async intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Promise<Observable<unknown>> {
    const tamanoMaximoMb = await this.parametros.enteroPositivo(
      PARAMETRO.archivoTamanoMaximoMb,
    );
    const http = contexto.switchToHttp();
    const recibir = multer({
      storage: multer.memoryStorage(),
      // Los navegadores envían el nombre del archivo en UTF-8: «fotografía.jpg» llega bien.
      defParamCharset: 'utf8',
      limits: {
        fileSize: tamanoMaximoMb * 1024 * 1024,
        files: MAXIMO_ARCHIVOS_POR_CARGA,
        fields: MAXIMO_CAMPOS,
        fieldSize: TAMANO_MAXIMO_CAMPO,
      },
    }).array(CAMPO_ARCHIVOS, MAXIMO_ARCHIVOS_POR_CARGA);

    await new Promise<void>((resolver, rechazar) => {
      recibir(
        http.getRequest<Request>(),
        http.getResponse<Response>(),
        (error: unknown) =>
          error ? rechazar(traducir(error, tamanoMaximoMb)) : resolver(),
      );
    });
    return siguiente.handle();
  }
}

function traducir(error: unknown, tamanoMaximoMb: number): Error {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new PayloadTooLargeException(
        mensajeTamanoExcedido(tamanoMaximoMb),
      );
    }
    if (
      error.code === 'LIMIT_FILE_COUNT' ||
      error.code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      return new BadRequestException(MENSAJE_ARCHIVOS_ESPERADOS);
    }
  }
  // Formulario cortado o mal formado, o campos de más: el mensaje de busboy es técnico y en
  // inglés.
  return new BadRequestException(MENSAJE_FORMULARIO_INVALIDO);
}
