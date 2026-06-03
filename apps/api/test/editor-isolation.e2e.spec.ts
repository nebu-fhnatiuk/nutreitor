import { createDb, professionalProfiles, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Aislamiento de las MUTACIONES del editor (PR 2). Las escrituras de perfil/roster
 * corren con `tenantDb.run` → mismo `withTenant` + RLS que se ejercita acá: un
 * tenant ajeno no puede tocar los perfiles de otro (defensa real, no sólo WHERE).
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

async function demoProfile() {
  const [p] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
    tx
      .select()
      .from(professionalProfiles)
      .where(eq(professionalProfiles.profileSlug, "profesional-demo"))
      .limit(1),
  );
  return p;
}

describe("Aislamiento de mutaciones del editor (professional_profiles vía RLS)", () => {
  it("un tenant ajeno NO puede actualizar el perfil de demo (0 filas)", async () => {
    const p = await demoProfile();
    expect(p).toBeTruthy();

    const updated = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx
        .update(professionalProfiles)
        .set({ headline: "HACK" })
        .where(eq(professionalProfiles.id, p!.id))
        .returning(),
    );
    expect(updated.length).toBe(0);

    const after = await demoProfile();
    expect(after!.headline).not.toBe("HACK");
  });

  it("bajo su propio tenant SÍ puede actualizar visibilidad (con restauración)", async () => {
    const p = await demoProfile();
    const updated = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .update(professionalProfiles)
        .set({ visibility: { headline: true, credentials: true } })
        .where(eq(professionalProfiles.id, p!.id))
        .returning(),
    );
    expect(updated.length).toBe(1);
    expect(updated[0]!.visibility.credentials).toBe(true);

    // Restaurar la visibilidad original (no contaminar la demo para otros tests).
    await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .update(professionalProfiles)
        .set({ visibility: p!.visibility })
        .where(eq(professionalProfiles.id, p!.id)),
    );
  });
});
