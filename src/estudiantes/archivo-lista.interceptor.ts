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

/** Campo del formulario multipart que trae el archivo. */
export const CAMPO_ARCHIVO = 'archivo';

export const MENSAJE_UN_SOLO_ARCHIVO = `Envíe un solo archivo, en el campo «${CAMPO_ARCHIVO}».`;
export const MENSAJE_FORMULARIO_INVALIDO =
  'No se pudo recibir el archivo. Vuelva a intentarlo.';

/**
 * Recibe el archivo de la lista en memoria, con el tamaño máximo de `parametro_sistema`
 * (`archivo_tamano_maximo_mb`, NFR-019). El `FileInterceptor` de Nest fija el límite al
 * declarar la ruta; este lo lee en cada petición, para que el parámetro se pueda cambiar sin
 * desplegar. El archivo no se guarda: se lee y se descarta (la base guarda los estudiantes,
 * no el archivo).
 */
@Injectable()
export class ArchivoListaInterceptor implements NestInterceptor {
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
      limits: {
        fileSize: tamanoMaximoMb * 1024 * 1024,
        files: 1,
        fields: 0,
      },
    }).single(CAMPO_ARCHIVO);

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
        `El archivo supera el tamaño máximo permitido de ${tamanoMaximoMb} MB.`,
      );
    }
    return new BadRequestException(MENSAJE_UN_SOLO_ARCHIVO);
  }
  // Formulario cortado o mal formado: el mensaje de busboy es técnico y en inglés.
  return new BadRequestException(MENSAJE_FORMULARIO_INVALIDO);
}
