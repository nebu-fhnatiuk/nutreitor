import { createDb, professionalProfiles, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Aislamiento multi-tenant de la CAPA PÚBLICA: los perfiles públicos de un tenant
 * no se ven bajo el contexto de otro. La API pública corre con `runAs(orgId)`
 * (mismo `withTenant` + RLS que acá), así que esto cubre su garantía de fondo.
 * El seed deja profiles en orgDemo; orgA no tiene → sirve de "otro tenant".
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

let appDb: Database;
let appPool: pg.Pool;

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
});

afterAll(async () => {
  await appPool?.end();
});

describe("Aislamiento público (professional_profiles vía RLS)", () => {
  it("bajo el contexto de orgA NO se ven los profiles de demo", async () => {
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(professionalProfiles),
    );
    expect(rows.every((p) => p.organizationId === SEED.orgA.id)).toBe(true);
  });

  it("el profileSlug de demo NO es accesible bajo el contexto de orgA", async () => {
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx
        .select()
        .from(professionalProfiles)
        .where(eq(professionalProfiles.profileSlug, "profesional-demo")),
    );
    expect(rows.length).toBe(0);
  });

  it("bajo el contexto de demo SÍ se ven sus profiles", async () => {
    const rows = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .select()
        .from(professionalProfiles)
        .where(eq(professionalProfiles.organizationId, SEED.orgDemo.id)),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((p) => p.organizationId === SEED.orgDemo.id)).toBe(true);
  });

  it("fail-closed: sin contexto de tenant no se ve ningún profile", async () => {
    const rows = await appDb.select().from(professionalProfiles);
    expect(rows.length).toBe(0);
  });
});
