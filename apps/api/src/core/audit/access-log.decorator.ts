import { SetMetadata } from "@nestjs/common";
import type { AccessResource } from "@nutreitor/shared";

export const ACCESS_LOG_KEY = "access_log";

export interface AccessLogSpec {
  resource: AccessResource;
  /** Parámetro de ruta con el id del deportista (`patientId`, `id`…). */
  patientParam?: string;
  /** Parámetro de ruta con el objeto puntual (informe, conversación, grupo). */
  targetParam?: string;
  /** Mensajes: el deportista sale de la conversación, no de la ruta. */
  patientFromConversation?: boolean;
}

/**
 * Marca un GET que devuelve datos de salud: cuando la lectura sale bien, el
 * AccessLogInterceptor deja registro de quién la hizo (KAN-23, ADR 0042).
 */
export const LogsAccess = (resource: AccessResource, opts: Omit<AccessLogSpec, "resource"> = {}) =>
  SetMetadata(ACCESS_LOG_KEY, { resource, ...opts } satisfies AccessLogSpec);
