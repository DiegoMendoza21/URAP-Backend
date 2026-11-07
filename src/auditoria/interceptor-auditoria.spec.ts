import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditarConsulta } from './auditar-consulta.decorator.js';
import type { AuditoriaService } from './auditoria.service.js';
import { InterceptorAuditoria } from './interceptor-auditoria.js';

class ControladorDePrueba {
  @AuditarConsulta('inasistencia')
  consultarInasistencias(): void {}

  @AuditarConsulta('evidencia_rap', 'idEvidencia')
  consultarEvidencia(): void {}

  consultaComun(): void {}
}

function contexto(metodo: string, params: Record<string, string> = {}) {
  return {
    getHandler: () =>
      (ControladorDePrueba.prototype as unknown as Record<string, unknown>)[
        metodo
      ],
    getClass: () => ControladorDePrueba,
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  } as unknown as ExecutionContext;
}

const respuesta = (valor: unknown): CallHandler => ({
  handle: () => of(valor),
});

describe('InterceptorAuditoria', () => {
  const auditoria = { registrar: vi.fn().mockResolvedValue(undefined) };
  const interceptor = new InterceptorAuditoria(
    new Reflector(),
    auditoria as unknown as AuditoriaService,
  );

  beforeEach(() => {
    auditoria.registrar.mockClear();
  });

  it('registra la consulta sensible con el id de la ruta y devuelve la respuesta intacta', async () => {
    const resultado = await firstValueFrom(
      interceptor.intercept(
        contexto('consultarInasistencias', { id: '42' }),
        respuesta(['datos']),
      ),
    );

    expect(resultado).toEqual(['datos']);
    expect(auditoria.registrar).toHaveBeenCalledWith({
      accion: 'consulta_sensible',
      tablaAfectada: 'inasistencia',
      idRegistro: 42,
    });
  });

  it('usa el parámetro de ruta indicado en el decorador', async () => {
    await firstValueFrom(
      interceptor.intercept(
        contexto('consultarEvidencia', { idEvidencia: '8' }),
        respuesta({}),
      ),
    );

    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        tablaAfectada: 'evidencia_rap',
        idRegistro: 8,
      }),
    );
  });

  it('sin un id numérico en la ruta registra la consulta con id nulo', async () => {
    await firstValueFrom(
      interceptor.intercept(contexto('consultarInasistencias'), respuesta([])),
    );

    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ idRegistro: null }),
    );
  });

  it('no registra nada en un endpoint sin @AuditarConsulta()', async () => {
    await firstValueFrom(
      interceptor.intercept(contexto('consultaComun'), respuesta('ok')),
    );

    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('no registra la consulta si la respuesta falla', async () => {
    const fallo: CallHandler = {
      handle: () => throwError(() => new Error('sin permiso')),
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(contexto('consultarInasistencias'), fallo),
      ),
    ).rejects.toThrow('sin permiso');
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });
});
