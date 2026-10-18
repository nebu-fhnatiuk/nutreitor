import { createDb } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Si Postgres corta una conexión inactiva del pool (reinicio/failover de RDS, red,
 * DROP DATABASE ... WITH (FORCE)), el proceso NO se cae y la próxima query
 * reconecta. Antes el 'error' del pool quedaba sin manejar y Node tiraba la API.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;

const app = createDb(APP_URL);
const owner = createDb(OWNER_URL);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
});

afterAll(async () => {
  await app.pool.end();
  await owner.pool.end();
});

describe("Resiliencia del pool de Postgres", () => {
  it("una conexión cortada por el servidor no tira el proceso y el pool reconecta", async () => {
    // Abrir (y dejar inactiva) una conexión del pool de la app.
    await app.db.execute(sql`select 1`);
    expect(app.pool.idleCount).toBeGreaterThan(0);

    // Cortarla desde el servidor, como haría un reinicio o un failover.
    const killed = await owner.db.execute(sql`
      select count(pg_terminate_backend(pid))::int as n from pg_stat_activity
      where usename = 'nutreitor_app' and datname = current_database()`);
    expect((killed.rows[0] as { n: number }).n).toBeGreaterThan(0);

    // Dar tiempo a que el pool reciba el 'error' (sin handler, acá moría el proceso).
    await new Promise((r) => setTimeout(r, 300));

    const res = await app.db.execute(sql`select 1 as ok`);
    expect((res.rows[0] as { ok: number }).ok).toBe(1);
  });
});
