import { z } from "zod";

import { regionSchema } from "./region.js";

/**
 * Contexto de tenant que viaja con cada request autenticado.
 *
 * Es el ÚNICO origen del `tenant_id` que llega a la base. Se deriva del token de
 * auth + el subdominio resuelto, nunca de un parámetro del request. El backend lo
 * guarda en un AsyncLocalStorage y lo inyecta en la sesión de Postgres por
 * transacción (`SET LOCAL app.current_tenant_id`).
 */
export const tenantContextSchema = z.object({
  /** ID del tenant (= organizations.id). Va al GUC app.current_tenant_id. */
  tenantId: z.string().uuid(),
  /** ID de la organización. En el modelo POOL coincide con tenantId. */
  orgId: z.string().uuid(),
  /** Región de residencia de datos del tenant (default de las filas nuevas). */
  region: regionSchema,
});

export type TenantContext = z.infer<typeof tenantContextSchema>;
