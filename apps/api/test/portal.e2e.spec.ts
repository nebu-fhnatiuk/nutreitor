import { createDb, patients, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { and, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Portal del paciente: el resolver "mi paciente" filtra por userId además de RLS.
 * Garantiza que un paciente logueado ve SOLO su entidad, no las demás del tenant
 * (que RLS sí dejaría ver), y que cross-tenant no resuelve nada.
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
// patient@demo (cuenta vinculada por el seed a "Paciente Demo Uno").
const patientUserId = "00000000-0000-0000-0000-0000000000f3";
const pacienteUnoId = "00000000-0000-0000-0000-0000000000d1";

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
});

afterAll(async () => {
  await appPool?.end();
});

describe("Portal: resolución de 'mi paciente'", () => {
  it("filtrar por userId resuelve EXACTAMENTE la propia entidad", async () => {
    const mine = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patients).where(eq(patients.userId, patientUserId)),
    );
    expect(mine.length).toBe(1);
    expect(mine[0]!.id).toBe(pacienteUnoId);
  });

  it("el tenant tiene MÁS pacientes que el propio (el filtro por userId realmente acota)", async () => {
    const all = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patients),
    );
    expect(all.length).toBeGreaterThan(1);
  });

  it("cross-tenant: bajo orgA, el userId del paciente de demo no resuelve nada", async () => {
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx
        .select()
        .from(patients)
        .where(and(eq(patients.userId, patientUserId))),
    );
    expect(rows.length).toBe(0);
  });
});
