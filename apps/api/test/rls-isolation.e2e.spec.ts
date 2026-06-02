import { createDb, patients, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test de integración del aislamiento multi-tenant.
 *
 * Prueba la garantía REAL (la da la policy RLS de Postgres, no el código de la
 * app): con el contexto de un tenant es imposible leer o escribir filas de otro,
 * aun forzando el tenant_id ajeno en la query.
 *
 * Requiere un Postgres con migraciones aplicables (rol owner) y la conexión de
 * runtime (rol app, sujeto a RLS). En docker-compose ambas vienen seteadas.
 */

const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} para correr los tests.`);
  return v;
}

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;

beforeAll(async () => {
  // Estado conocido: migrar (incluye roles + RLS) y seedear 2 tenants.
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);

  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

describe("Aislamiento RLS (rol app)", () => {
  it("el owner ve todos los pacientes (bypassa RLS): ground truth = 4", async () => {
    const all = await ownerDb.select().from(patients);
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it("con contexto de la org A sólo se ven pacientes de A", async () => {
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(patients),
    );
    // Conteo robusto a datos acumulados por demos; lo central es que NINGUNA fila
    // sea de otro tenant (no-fuga) y que se vean los seed de A.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((p) => p.tenantId === SEED.orgA.id)).toBe(true);
  });

  it("con contexto de la org B sólo se ven pacientes de B", async () => {
    const rows = await withTenant(appDb, SEED.orgB.id, (tx) =>
      tx.select().from(patients),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((p) => p.tenantId === SEED.orgB.id)).toBe(true);
  });

  it("forzar el id de un paciente de B desde el contexto de A no devuelve nada", async () => {
    const bPatientId = "00000000-0000-0000-0000-0000000000b1";
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(patients).where(eq(patients.id, bPatientId)),
    );
    // La policy filtra la fila aunque la pidamos explícitamente por su PK.
    expect(rows.length).toBe(0);
  });

  it("WITH CHECK: insertar en A con tenant_id de B es rechazado por RLS", async () => {
    await expect(
      withTenant(appDb, SEED.orgA.id, (tx) =>
        tx.insert(patients).values({
          tenantId: SEED.orgB.id, // tenant ajeno: la policy lo bloquea
          region: SEED.orgB.region,
          fullName: "Inyectado cross-tenant",
        }),
      ),
    ).rejects.toThrow();
  });

  it("fail-closed: sin contexto de tenant no se ve nada", async () => {
    // Query directa sin withTenant → el GUC no está seteado → current_setting
    // devuelve NULL → la policy deniega todo.
    const rows = await appDb.select().from(patients);
    expect(rows.length).toBe(0);
  });
});
