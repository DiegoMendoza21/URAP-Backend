import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { concatMap, type Observable } from 'rxjs';
import {
  AUDITAR_CONSULTA,
  type OpcionesAuditarConsulta,
} from './auditar-consulta.decorator.js';
import { AuditoriaService } from './auditoria.service.js';

/**
 * Registra en auditoría las consultas sensibles marcadas con @AuditarConsulta(), solo cuando
 * la respuesta es exitosa. Los endpoints sin la marca pasan sin costo adicional.
 */
@Injectable()
export class InterceptorAuditoria implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Observable<unknown> {
    const opciones = this.reflector.getAllAndOverride<
      OpcionesAuditarConsulta | undefined
    >(AUDITAR_CONSULTA, [contexto.getHandler(), contexto.getClass()]);
    if (!opciones) {
      return siguiente.handle();
    }

    const peticion = contexto.switchToHttp().getRequest<Request>();
    const valor: unknown = peticion.params?.[opciones.parametroId];
    const idRegistro =
      typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : null;

    return siguiente.handle().pipe(
      concatMap(async (respuesta: unknown) => {
        await this.auditoria.registrar({
          accion: 'consulta_sensible',
          tablaAfectada: opciones.tabla,
          idRegistro,
        });
        return respuesta;
      }),
    );
  }
}
