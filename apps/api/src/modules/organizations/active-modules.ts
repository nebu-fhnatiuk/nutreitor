import { orgModules, type TenantTx } from "@nutreitor/db";
import { eq } from "drizzle-orm";

/**
 * Claves de los módulos/complementos ACTIVOS de la org del contexto (bajo RLS).
 * Lo usan `/me` y el portal para gatear features en la UI; el corte real lo hace el
 * ModuleGuard en el servidor. Ver ADR 0016.
 */
export async function loadActiveModuleKeys(tx: TenantTx): Promise<string[]> {
  const rows = await tx
    .select({ module: orgModules.module })
    .from(orgModules)
    .where(eq(orgModules.status, "active"));
  return rows.map((r) => r.module);
}
