import {
  careAssignments,
  createDb,
  patientMetrics,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { and, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Métricas (serie temporal): aislamiento por tenant (RLS) y mutabilidad (a
 * diferencia de las notas append-only, acá el rol app SÍ puede UPDATE/DELETE).
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
const pacienteUnoId = "00000000-0000-0000-0000-0000000000d1";

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
});

afterAll(async () => {
  await appPool?.end();
});

/** Inserta una medición demo bajo el tenant demo (reusa una asignación para el autor). */
async function insertDemoMetric(measuredAt: string, weight: string) {
  return withTenant(appDb, SEED.orgDemo.id, async (tx) => {
    const [a] = await tx
      .select({ membershipId: careAssignments.membershipId })
      .from(careAssignments)
      .where(eq(careAssignments.status, "active"))
      .limit(1);
    const [row] = await tx
      .insert(patientMetrics)
      .values({
        tenantId: SEED.orgDemo.id,
        region: SEED.orgDemo.region,
        patientId: pacienteUnoId,
        recordedByMembershipId: a!.membershipId,
        measuredAt,
        weightKg: weight,
      })
      .returning();
    return row!;
  });
}

describe("Métricas (serie temporal)", () => {
  it("se insertan y se ven bajo el tenant; NO bajo otro tenant", async () => {
    await insertDemoMetric("2026-06-01", "67.50");
    const demo = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patientMetrics),
    );
    expect(demo.length).toBeGreaterThanOrEqual(1);
    expect(demo.every((m) => m.tenantId === SEED.orgDemo.id)).toBe(true);

    const other = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(patientMetrics),
    );
    expect(other.every((m) => m.tenantId === SEED.orgA.id)).toBe(true);
  });

  it("son EDITABLES y BORRABLES por el rol app (a diferencia de las notas)", async () => {
    const m = await insertDemoMetric("2026-06-02", "67.00");

    const updated = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .update(patientMetrics)
        .set({ weightKg: "66.40" })
        .where(eq(patientMetrics.id, m.id))
        .returning(),
    );
    expect(updated[0]!.weightKg).toBe("66.40");

    const deleted = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .delete(patientMetrics)
        .where(eq(patientMetrics.id, m.id))
        .returning({ id: patientMetrics.id }),
    );
    expect(deleted.length).toBe(1);
  });

  it("fail-closed: sin contexto de tenant no se ve ninguna medición", async () => {
    const rows = await appDb.select().from(patientMetrics);
    expect(rows.length).toBe(0);
  });

  it("limpieza de las mediciones de prueba insertadas", async () => {
    await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .delete(patientMetrics)
        .where(and(eq(patientMetrics.patientId, pacienteUnoId))),
    );
    const left = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patientMetrics),
    );
    expect(left.length).toBe(0);
  });
});
