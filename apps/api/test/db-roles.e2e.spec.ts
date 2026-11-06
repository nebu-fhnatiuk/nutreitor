import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed } from "@nutreitor/db/seed";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { controlUrl } from "./test-db.js";

/**
 * Roles de la base como en RDS (KAN-88, ADR 0049): el owner no es superusuario, toda
 * tabla con RLS le deja una policy explícita, y el plano de control ve entre tenants
 * sólo las tablas de plataforma, nunca datos clínicos.
 */
const OWNER_URL = process.env.DATABASE_OWNER_URL!;

/** Las únicas tablas con RLS que el plano de control ve entre tenants. */
const CONTROL_TABLES = [
  "audit_log",
  "invitations",
  "memberships",
  "organizations",
  "patients",
  "professional_profiles",
  "refresh_tokens",
].sort();

let owner: Database;
let ownerPool: pg.Pool;
let control: Database;
let controlPool: pg.Pool;

const rows = async <T>(db: Database, q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  ({ db: control, pool: controlPool } = createDb(controlUrl()));
});

afterAll(async () => {
  await ownerPool?.end();
  await controlPool?.end();
});

describe("owner (usuario maestro de RDS)", () => {
  it("no es superusuario ni ignora RLS: CI y desarrollo se comportan como RDS", async () => {
    const [r] = await rows<{ rolsuper: boolean; rolbypassrls: boolean }>(
      owner,
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("toda tabla con RLS tiene su policy owner_all", async () => {
    const missing = await rows<{ relname: string }>(
      owner,
      sql`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
            and not exists (select 1 from pg_policies p where p.tablename = c.relname and p.policyname = 'owner_all')`,
    );
    expect(missing).toEqual([]);
  });
});

describe("plano de control (nutreitor_control)", () => {
  it("la policy control_plane está sólo en las tablas de plataforma", async () => {
    const tables = await rows<{ tablename: string }>(
      owner,
      sql`select tablename from pg_policies where policyname = 'control_plane' order by 1`,
    );
    expect(tables.map((t) => t.tablename)).toEqual(CONTROL_TABLES);
  });

  it("ve las organizaciones de todos los tenants", async () => {
    const [r] = await rows<{ n: number }>(control, sql`select count(*)::int as n from organizations`);
    expect(r!.n).toBeGreaterThanOrEqual(2);
  });

  it("no lee datos clínicos: ni notas ni columnas de la ficha", async () => {
    await expect(control.execute(sql`select 1 from patient_notes limit 1`)).rejects.toThrow(/permission denied/);
    await expect(control.execute(sql`select full_name from patients limit 1`)).rejects.toThrow(/permission denied/);
    await expect(control.execute(sql`select 1 from anthropometry_sessions limit 1`)).rejects.toThrow(/permission denied/);
  });

  it("no tiene DDL", async () => {
    await expect(control.execute(sql`create table control_probe (id int)`)).rejects.toThrow(/permission denied/);
  });
});
