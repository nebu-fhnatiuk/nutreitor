import { z } from "zod";

/**
 * Contexto de tenant que viaja con cada request autenticado.
 *
 * Es el ÚNICO origen del `tenant_id` que llega a la base. Se deriva del token de
 * auth (claims), nunca de un parámetro del request. El backend lo guarda en un
 * AsyncLocalStorage y lo inyecta en la sesión de Postgres por transacción.
 */
export const tenantContextSchema = z.object({
  /** ID del tenant (= organizations.id). Va al GUC app.current_tenant_id. */
  tenantId: z.string().uuid(),
  /** ID de la organización. En el modelo POOL coincide con tenantId. */
  orgId: z.string().uuid(),
  /** Región de residencia de datos del tenant (default de las filas nuevas). */
  region: z.string().min(1),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;

/**
 * Claims del JWT (stub de dev y, con el mismo shape, el auth real a futuro).
 * El verificador cambia (Cognito/Auth0); la extracción del contexto no.
 */
export const tenantClaimsSchema = z.object({
  sub: z.string().optional(),
  org_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  region: z.string().min(1),
});

export type TenantClaims = z.infer<typeof tenantClaimsSchema>;

/** Mapea los claims del token al TenantContext del runtime. */
export function claimsToContext(claims: TenantClaims): TenantContext {
  return {
    tenantId: claims.tenant_id,
    orgId: claims.org_id,
    region: claims.region,
  };
}
