import {
  careAssignments,
  createDb,
  patientNotes,
  patients,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Núcleo clínico: aislamiento por tenant (RLS) de pacientes/asignaciones/notas,
 * inmutabilidad append-only de notas (GRANT), y unicidad de asignación activa.
 * Corre con el rol app (mismas garantías que la API), igual que los otros e2e.
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

describe("Aislamiento del núcleo clínico (RLS)", () => {
  it("bajo orgA NO se ven asignaciones ni notas de demo", async () => {
    const assignA = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(careAssignments),
    );
    expect(assignA.every((a) => a.tenantId === SEED.orgA.id)).toBe(true);

    const notesA = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(patientNotes),
    );
    expect(notesA.every((n) => n.tenantId === SEED.orgA.id)).toBe(true);
  });

  it("bajo demo SÍ se ven sus asignaciones activas y notas", async () => {
    const active = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .select()
        .from(careAssignments)
        .where(eq(careAssignments.status, "active")),
    );
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.every((a) => a.tenantId === SEED.orgDemo.id)).toBe(true);

    const notes = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patientNotes),
    );
    expect(notes.length).toBeGreaterThanOrEqual(1);
  });

  it("fail-closed: sin contexto de tenant no se ve ningún paciente", async () => {
    const rows = await appDb.select().from(patients);
    expect(rows.length).toBe(0);
  });
});

describe("Notas append-only (GRANT en DB)", () => {
  it("el rol app NO puede UPDATE una nota", async () => {
    const [note] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patientNotes).limit(1),
    );
    expect(note).toBeTruthy();
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) =>
        tx
          .update(patientNotes)
          .set({ content: "HACK" })
          .where(eq(patientNotes.id, note!.id)),
      ),
    ).rejects.toThrow();
  });

  it("el rol app NO puede DELETE una nota", async () => {
    const [note] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(patientNotes).limit(1),
    );
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) =>
        tx.delete(patientNotes).where(eq(patientNotes.id, note!.id)),
      ),
    ).rejects.toThrow();
  });
});

describe("Asignación versionada", () => {
  it("no permite dos asignaciones ACTIVAS para el mismo (paciente, profesional)", async () => {
    const [a] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx
        .select()
        .from(careAssignments)
        .where(eq(careAssignments.status, "active"))
        .limit(1),
    );
    expect(a).toBeTruthy();
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) =>
        tx.insert(careAssignments).values({
          tenantId: SEED.orgDemo.id,
          region: SEED.orgDemo.region,
          patientId: a!.patientId,
          membershipId: a!.membershipId,
          status: "active",
        }),
      ),
    ).rejects.toThrow();
  });

  it("el rol app NO puede DELETE una asignación (sólo cerrar)", async () => {
    const [a] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
      tx.select().from(careAssignments).limit(1),
    );
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) =>
        tx.delete(careAssignments).where(eq(careAssignments.id, a!.id)),
      ),
    ).rejects.toThrow();
  });
});
