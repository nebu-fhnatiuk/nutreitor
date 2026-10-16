import { createDb, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Aislamiento multi-tenant RECORRIENDO EL CATÁLOGO, no tabla por tabla. Cada tabla
 * que el rol app puede tocar tiene que tener RLS forzado con una policy atada a
 * `app.current_tenant_id`, cerrarse sin contexto (fail-closed) y no mostrar filas de
 * otro tenant. Una tabla nueva que se olvide de RLS rompe este test sin que nadie
 * tenga que acordarse de sumarla acá.
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

/**
 * Tablas GLOBALES a propósito (sin RLS). Cada entrada necesita una justificación y
 * declara si el rol app puede escribirla:
 * - users: identidad global (sólo credencial + nombre, sin PHI); el acceso queda
 *   gateado por `memberships`, que sí está bajo RLS. Ver ADR 0003.
 * - food_catalog: catálogo de referencia nutricional (USDA + curado AR), sin tenant
 *   ni PHI. El runtime sólo lo lee; se carga por seed. Ver ADR 0018.
 */
const GLOBAL_TABLE_RULES: Record<string, { readOnly: boolean }> = {
  users: { readOnly: false },
  food_catalog: { readOnly: true },
};
const GLOBAL_TABLES = new Set(Object.keys(GLOBAL_TABLE_RULES));

/** Columna que ata la fila al tenant, en orden de preferencia. */
const TENANT_COLUMNS = ["tenant_id", "organization_id"] as const;

interface TableInfo {
  name: string;
  rls: boolean;
  force: boolean;
  tenantColumn: string;
  /** Policies de la tabla: expresión USING y WITH CHECK. */
  policies: { qual: string | null; withCheck: string | null }[];
}

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let tables: TableInfo[];

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));

  // Toda tabla de `public` sobre la que el rol app tiene ALGÚN privilegio.
  const res = await ownerDb.execute(sql`
    select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force,
      (select array_agg(col.column_name::text) from information_schema.columns col
        where col.table_schema = 'public' and col.table_name = c.relname) as columns,
      (select coalesce(json_agg(json_build_object('qual', p.qual, 'withCheck', p.with_check)), '[]')
        from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('nutreitor_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    order by 1`);
  tables = (res.rows as Record<string, unknown>[]).map((r) => {
    const columns = r.columns as string[];
    const tenantColumn =
      r.name === "organizations" ? "id" : (TENANT_COLUMNS.find((c) => columns.includes(c)) ?? "");
    return {
      name: r.name as string,
      rls: r.rls as boolean,
      force: r.force as boolean,
      tenantColumn,
      policies: r.policies as TableInfo["policies"],
    };
  });
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

const tenantTables = () => tables.filter((t) => !GLOBAL_TABLES.has(t.name));
const ref = (t: TableInfo) => sql.identifier(t.name);
const col = (t: TableInfo) => sql.identifier(t.tenantColumn);

async function count(db: Database | Parameters<Parameters<typeof withTenant>[2]>[0], q: ReturnType<typeof sql>) {
  const res = await db.execute(q);
  return Number((res.rows[0] as { n: string }).n);
}

describe("Catálogo RLS (toda tabla que toca el rol app)", () => {
  it("el catálogo no está vacío y las tablas globales existen", () => {
    expect(tenantTables().length).toBeGreaterThanOrEqual(15);
    for (const g of GLOBAL_TABLES) expect(tables.map((t) => t.name)).toContain(g);
  });

  it("las tablas globales de solo lectura no son escribibles por el rol app", async () => {
    const escribibles: string[] = [];
    for (const [name, rule] of Object.entries(GLOBAL_TABLE_RULES)) {
      if (!rule.readOnly) continue;
      const res = await ownerDb.execute(
        sql`select has_table_privilege('nutreitor_app', ${name}, 'INSERT, UPDATE, DELETE, TRUNCATE') as w`,
      );
      if ((res.rows[0] as { w: boolean }).w) escribibles.push(name);
    }
    expect(escribibles).toEqual([]);
  });

  it("toda tabla no global tiene una columna de tenant", () => {
    const sinColumna = tenantTables().filter((t) => !t.tenantColumn).map((t) => t.name);
    expect(sinColumna).toEqual([]);
  });

  it("toda tabla no global tiene RLS habilitado y FORZADO (aplica también al owner de la tabla)", () => {
    const flojas = tenantTables()
      .filter((t) => !t.rls || !t.force)
      .map((t) => `${t.name} (rls=${t.rls}, force=${t.force})`);
    expect(flojas).toEqual([]);
  });

  it("toda policy filtra por app.current_tenant_id en USING y en WITH CHECK", () => {
    const malas: string[] = [];
    for (const t of tenantTables()) {
      if (t.policies.length === 0) malas.push(`${t.name}: sin policies`);
      for (const p of t.policies) {
        // Sin WITH CHECK explícito, Postgres usa el USING también para escribir.
        const check = p.withCheck ?? p.qual;
        if (!p.qual?.includes("app.current_tenant_id")) malas.push(`${t.name}: USING`);
        if (!check?.includes("app.current_tenant_id")) malas.push(`${t.name}: WITH CHECK`);
      }
    }
    expect(malas).toEqual([]);
  });

  it("fail-closed: sin contexto de tenant, el rol app no ve NINGUNA fila de ninguna tabla", async () => {
    const conFilas: string[] = [];
    for (const t of tenantTables()) {
      const n = await count(appDb, sql`select count(*) as n from ${ref(t)}`);
      if (n > 0) conFilas.push(`${t.name}: ${n}`);
    }
    expect(conFilas).toEqual([]);
  });

  it("con contexto de un tenant, ninguna tabla devuelve filas de otro tenant", async () => {
    const fugas: string[] = [];
    for (const tenant of [SEED.orgA.id, SEED.orgDemo.id]) {
      for (const t of tenantTables()) {
        const n = await withTenant(appDb, tenant, (tx) =>
          count(tx, sql`select count(*) as n from ${ref(t)} where ${col(t)} <> ${tenant}::uuid`),
        );
        if (n > 0) fugas.push(`${t.name} bajo ${tenant}: ${n}`);
      }
    }
    expect(fugas).toEqual([]);
  });

  it("el chequeo de fuga no es vacío: hay datos de demo que orgA no ve", async () => {
    // Si el seed no dejara filas de otro tenant, el test anterior pasaría trivialmente.
    const conDatosDeDemo: string[] = [];
    for (const t of tenantTables()) {
      const n = await count(
        ownerDb,
        sql`select count(*) as n from ${ref(t)} where ${col(t)} = ${SEED.orgDemo.id}::uuid`,
      );
      if (n > 0) conDatosDeDemo.push(t.name);
    }
    for (const name of ["patients", "memberships", "meal_plans", "care_assignments"]) {
      expect(conDatosDeDemo).toContain(name);
    }
  });
});
