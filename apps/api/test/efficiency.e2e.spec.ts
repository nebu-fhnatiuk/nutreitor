import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { fmtMinutes, type MembershipRole } from "@nutreitor/shared";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { EfficiencyService } from "../src/modules/patients/efficiency.service.js";
import { MealPlansService } from "../src/modules/patients/meal-plans.service.js";

/**
 * Métricas de eficiencia (Fase 4.4) con un profesional propio y datos conocidos:
 * medianas de armado y de respuesta, origen de los planes, adherencia y alcance
 * (la admin ve al equipo; el profesional, sólo lo suyo).
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T = SEED.orgDemo;
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PRO8_USER = "00000000-0000-0000-0000-0000000000f8";
const PRO8 = "00000000-0000-0000-0000-0000000000c8";
const PAT8_USER = "00000000-0000-0000-0000-0000000000e8";
const PAT8_MEMBERSHIP = "00000000-0000-0000-0000-0000000000b8";
const D8 = "00000000-0000-0000-0000-0000000000d8";

let appPool: pg.Pool;
let ownerPool: pg.Pool;
let owner: Database;
let svc: EfficiencyService;
let plans: MealPlansService;

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run(
    {
      context: { tenantId: T.id, orgId: T.id, region: T.region },
      org: { id: T.id, name: T.name, slug: T.slug, region: T.region, status: T.status, kind: T.kind },
      user: { id: userId, role },
    },
    fn,
  );
}
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  const app = createDb(APP_URL);
  appPool = app.pool;
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(app.db);
  svc = new EfficiencyService(tenantDb);
  plans = new MealPlansService(tenantDb, new AuditService());

  // Profesional y paciente propios; se limpia lo de corridas anteriores.
  await owner.execute(sql`insert into users (id, email, full_name, hashed_password) values
    (${PRO8_USER}, 'pro8@demo.test', 'Profesional Ocho', 'x'), (${PAT8_USER}, 'pac8@demo.test', 'Paciente Ocho', 'x')
    on conflict (id) do nothing`);
  await owner.execute(sql`insert into memberships (id, user_id, organization_id, region, role) values
    (${PRO8}, ${PRO8_USER}, ${T.id}, ${T.region}::region, 'professional'),
    (${PAT8_MEMBERSHIP}, ${PAT8_USER}, ${T.id}, ${T.region}::region, 'patient')
    on conflict (id) do nothing`);
  await owner.execute(sql`insert into patients (id, tenant_id, region, full_name, user_id)
    values (${D8}, ${T.id}, ${T.region}::region, 'Paciente Ocho', ${PAT8_USER}) on conflict (id) do nothing`);
  await owner.execute(sql`insert into care_assignments (tenant_id, region, patient_id, membership_id, status)
    select ${T.id}, ${T.region}::region, ${D8}, ${PRO8}, 'active'
    where not exists (select 1 from care_assignments where patient_id = ${D8} and membership_id = ${PRO8} and status = 'active')`);
  await owner.execute(sql`delete from conversations where patient_id = ${D8}`);
  await owner.execute(sql`delete from adherence_meal_logs where patient_id = ${D8}`);
  await owner.execute(sql`update meal_plans set created_at = now() - interval '400 days' where author_membership_id = ${PRO8}`);

  // Planes: 10, 20 y 30 min (+ uno de 3 h que se topea a 2 h) → mediana 25 min.
  const body = { layout: "day" as const, day: { meals: [] } };
  for (const [editSeconds, draftedFrom] of [[600, "scratch"], [1200, "template"], [1800, "nutri"], [10_800, "previous"]] as const) {
    await as(PRO8_USER, "professional", () => plans.save(D8, { title: "Plan", body, editSeconds, draftedFrom }));
  }

  // Conversación: ráfaga respondida a los 30 min, otra a los 90 min, y una pendiente.
  const c = await owner.execute(sql`insert into conversations (tenant_id, region, kind, patient_id, professional_membership_id)
    values (${T.id}, ${T.region}::region, 'patient_professional', ${D8}, ${PRO8}) returning id`);
  const conv = (c.rows[0] as { id: string }).id;
  const msg = (author: string, at: string) => owner.execute(sql`insert into messages
    (tenant_id, region, conversation_id, author_membership_id, body, created_at)
    values (${T.id}, ${T.region}::region, ${conv}, ${author}, 'x', ${at})`);
  await msg(PAT8_MEMBERSHIP, ago(600)); // ráfaga 1…
  await msg(PAT8_MEMBERSHIP, ago(595)); // …(segundo mensaje de la misma ráfaga)
  await msg(PRO8, ago(570)); //           → 30 min
  await msg(PAT8_MEMBERSHIP, ago(300)); // ráfaga 2
  await msg(PRO8, ago(210)); //           → 90 min
  await msg(PAT8_MEMBERSHIP, ago(10)); //  ráfaga 3, sin responder

  // Adherencia: cumplí + en parte + no → 50 %.
  const today = new Date().toISOString().slice(0, 10);
  for (const [meal, status] of [["Desayuno", "done"], ["Almuerzo", "partial"], ["Cena", "skipped"]]) {
    await owner.execute(sql`insert into adherence_meal_logs (tenant_id, region, patient_id, date, meal_name, status)
      values (${T.id}, ${T.region}::region, ${D8}, ${today}, ${meal}, ${status}::adherence_status)`);
  }
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

describe("Eficiencia", () => {
  it("calcula medianas de armado y de respuesta, origen de planes y adherencia", async () => {
    const e = await as(ADMIN_USER, "admin", () => svc.forSession(30));
    const row = e.professionals.find((p) => p.membershipId === PRO8)!;
    expect(row).toMatchObject({
      name: "Profesional Ocho",
      activePatients: 1,
      plans: { saved: 4, measured: 4, medianMinutes: 25, bySource: { scratch: 1, previous: 1, template: 1, nutri: 1 } },
      adherence: { pct: 50, logs: 3 },
      replies: { answered: 2, pending: 1, medianMinutes: 60 },
    });
  });

  it("la admin ve a todo el equipo; el profesional, sólo su fila", async () => {
    const admin = await as(ADMIN_USER, "admin", () => svc.forSession(30));
    expect(admin.professionals.length).toBeGreaterThanOrEqual(2);
    const pro = await as(PRO_USER, "professional", () => svc.forSession(30));
    expect(pro.professionals.map((p) => p.membershipId)).toEqual(["00000000-0000-0000-0000-0000000000c2"]);
    const pro8 = await as(PRO8_USER, "professional", () => svc.forSession(30));
    expect(pro8.professionals.map((p) => p.membershipId)).toEqual([PRO8]);
  });

  it("el tope de sesión de armado es 2 h (editor olvidado abierto)", async () => {
    const r = await owner.execute(sql`select max(edit_seconds) as m from meal_plans where author_membership_id = ${PRO8}`);
    expect(Number((r.rows[0] as { m: number }).m)).toBe(7200);
  });

  it("formatea minutos", () => {
    expect([fmtMinutes(null), fmtMinutes(0.05), fmtMinutes(12), fmtMinutes(80), fmtMinutes(60 * 27)]).toEqual(["—", "< 1 min", "12 min", "1 h 20 min", "1 d 3 h"]);
  });
});
