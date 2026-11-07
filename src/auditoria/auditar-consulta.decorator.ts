import { SetMetadata } from '@nestjs/common';

export const AUDITAR_CONSULTA = 'urap:auditar-consulta';

export interface OpcionesAuditarConsulta {
  /** Tabla o entidad consultada, como se registra en `auditoria.tabla_afectada`. */
  tabla: string;
  /** Parámetro de la ruta con el id del registro consultado. Por defecto, `id`. */
  parametroId: string;
}

/**
 * Marca un endpoint como consulta sensible (RF-29, NFR-020): cada respuesta exitosa deja un
 * evento `consulta_sensible` en auditoría con el usuario, la IP y el id consultado. Por
 * ejemplo, las inasistencias (RF-22), las evidencias (RF-24) y las valoraciones individuales
 * (RF-30). Lo registra InterceptorAuditoria.
 */
export const AuditarConsulta = (tabla: string, parametroId = 'id') =>
  SetMetadata(AUDITAR_CONSULTA, {
    tabla,
    parametroId,
  } satisfies OpcionesAuditarConsulta);
