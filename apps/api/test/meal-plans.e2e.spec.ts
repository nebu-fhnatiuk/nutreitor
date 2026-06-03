import {
  careAssignments,
  createDb,
  mealPlans,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { and, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Planes alimentarios versionados: aislamiento por tenant (RLS), unicidad de UN
 * plan activo por paciente, y que el rol app NO puede borrar (sin DELETE → historia
 * inmutable). El versionado en sí (supersede + nueva versión) lo hace el service;
 * acá se validan las garantías de DB.
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

async function activeMembershipId(): Promise<string> {
  const [a] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
    tx
      .select({ membershipId: careAssignments.membershipId })
      .from(careAssignments)
      .where(eq(careAssignments.status, "active"))
      .limit(1),
  );
  return a!.membershipId;
}

describe("Planes alimentarios versionados", () => {
  it("el seed deja UN plan activo por paciente, visible sólo en su tenant", async () => {
    const active = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .select()
        .from(mealPlans)
        .where(
          and(
            eq(mealPlans.patientId, pacienteUnoId),
            eq(mealPlans.status, "active"),
          ),
        ),
    );
    expect(active.length).toBe(1);

    const other = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(mealPlans),
    );
    expect(other.every((p) => p.tenantId === SEED.orgA.id)).toBe(true);
  });

  it("no permite dos planes ACTIVOS para el mismo paciente (unique parcial)", async () => {
    const membershipId = await activeMembershipId();
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) =>
        tx.insert(mealPlans).values({
          tenantId: SEED.orgDemo.id,
          region: SEED.orgDemo.region,
          patientId: pacienteUnoId,
          authorMembershipId: membershipId,
          version: 999,
          status: "active",
          title: "Duplicado activo",
        }),
      ),
    ).rejects.toThrow();
  });

  it("el rol app NO puede DELETE un plan (historia inmutable)", async () => {
    const [p] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(mealPlans).where(eq(mealPlans.patientId, pacienteUnoId)).limit(1),
    );
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) =>
        tx.delete(mealPlans).where(eq(mealPlans.id, p!.id)),
      ),
    ).rejects.toThrow();
  });

  it("fail-closed: sin contexto de tenant no se ve ningún plan", async () => {
    const rows = await appDb.select().from(mealPlans);
    expect(rows.length).toBe(0);
  });
});
