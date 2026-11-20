import { BadRequestException } from "@nestjs/common";
import { createDb, mealPlans, planAlertReviews, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { DayPlan, MealPlanBody, MembershipRole, SaveEnergyDto } from "@nutreitor/shared";
import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { EnergyService } from "../src/modules/patients/energy.service.js";
import { MealPlansService } from "../src/modules/patients/meal-plans.service.js";

/**
 * Alertas del plan registradas al guardar (KAN-97, ADR 0051), contra Postgres real con
 * el rol app: la API recalcula las alertas con el requerimiento vigente, guarda cada
 * una con la decisión del profesional, exige motivo para mantener una importante, y
 * la tabla es append-only y aislada por RLS.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T = SEED.orgDemo;
const PRO_USER = "00000000-0000-0000-0000-00000000a971";
const PRO = "00000000-0000-0000-0000-00000000a972";
const PATIENT = "00000000-0000-0000-0000-00000000a973";

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let plans: MealPlansService;
let energy: EnergyService;

const asPro = <X>(fn: () => Promise<X>) =>
  tenantStorage.run(
    {
      context: { tenantId: T.id, orgId: T.id, region: T.region },
      org: { id: T.id, name: T.name, slug: T.slug, region: T.region, status: T.status, kind: T.kind },
      user: { id: PRO_USER, role: "professional" as MembershipRole },
    },
    fn,
  );

// 60 kg, 48 kg de MLG; entrenamiento de fútbol de 90 min = 540 kcal de ejercicio.
const REQUIREMENT: SaveEnergyDto = {
  formula: "mifflin",
  activityFactor: 1.4,
  adjustmentPct: 0,
  weightKg: 60,
  heightCm: 165,
  ffmKg: 48,
  dayTypes: [
    { id: "t", name: "Entrenamiento", sessions: [{ activity: "football_training", minutes: 90 }], choGPerKg: 7, proGPerKg: 1.6 },
    { id: "r", name: "Descanso", sessions: [], choGPerKg: 4, proGPerKg: 1.6 },
  ],
  week: { mon: "t", sun: "r" },
  note: null,
};

const day = (kcal: number, protein_g: number, carbs_g: number, fat_g: number): DayPlan => ({
  meals: [{ name: "Día", items: [{ text: "Total del día", macros: { kcal, protein_g, carbs_g, fat_g } }] }],
});

// Lunes: DE (1900 − 540) / 48 = 28,3 → C2; proteína 1,0 g/kg → C4; grasa 14 % → C6.
// Domingo: limpio.
const BODY: MealPlanBody = { layout: "week", days: { mon: day(1900, 60, 400, 30), sun: day(2200, 96, 240, 61) } };

const save = (alertReviews?: { rule: "C2" | "C4" | "C5"; day: "mon" | "sun"; reason?: string | null }[]) =>
  asPro(() => plans.save(PATIENT, { title: "Plan", body: BODY, ...(alertReviews ? { alertReviews } : {}) }));

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  plans = new MealPlansService(tenantDb, new AuditService());
  energy = new EnergyService(tenantDb, new AuditService());

  await owner.execute(sql`insert into users (id, email, full_name, hashed_password)
    values (${PRO_USER}, 'pro-alertas@demo.test', 'Profesional Alertas', 'x') on conflict (id) do nothing`);
  await owner.execute(sql`insert into memberships (id, user_id, organization_id, region, role)
    values (${PRO}, ${PRO_USER}, ${T.id}, ${T.region}::region, 'professional') on conflict (id) do nothing`);
  await owner.execute(sql`insert into patients (id, tenant_id, region, full_name, sex, birth_date)
    values (${PATIENT}, ${T.id}, ${T.region}::region, 'Deportista Alertas', 'female', '2000-01-01') on conflict (id) do nothing`);
  await owner.execute(sql`insert into care_assignments (tenant_id, region, patient_id, membership_id, status)
    select ${T.id}, ${T.region}::region, ${PATIENT}, ${PRO}, 'active'
    where not exists (select 1 from care_assignments where patient_id = ${PATIENT} and membership_id = ${PRO} and status = 'active')`);
  // Corridas anteriores: los planes (en cascada, sus alertas) y los requerimientos.
  await owner.execute(sql`delete from meal_plans where patient_id = ${PATIENT}`);
  await owner.execute(sql`delete from energy_requirements where patient_id = ${PATIENT}`);
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

describe("sin requerimiento", () => {
  it("solo evalúa lo que no depende del requerimiento: la grasa en % de la energía", async () => {
    const plan = await save();
    expect(plan.alertReviews!.map((a) => `${a.day}:${a.rule}`)).toEqual(["mon:C6"]);
  });
});

describe("con requerimiento", () => {
  beforeAll(async () => {
    await asPro(() => energy.create(PATIENT, REQUIREMENT));
  });

  it("recalcula las alertas y las guarda sin revisar, importantes primero", async () => {
    const plan = await save();
    expect(plan.alertReviews!.map((a) => `${a.day}:${a.rule}:${a.decision}`)).toEqual([
      "mon:C2:unreviewed",
      "mon:C4:unreviewed",
      "mon:C6:unreviewed",
    ]);
    expect(plan.alertReviews![0]).toMatchObject({ level: "important", source: expect.stringContaining("REDs") });
  });

  it("mantener una importante sin motivo da 400 y no guarda la versión", async () => {
    const before = await owner.select().from(mealPlans).where(eq(mealPlans.patientId, PATIENT));
    await expect(save([{ rule: "C2", day: "mon" }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(save([{ rule: "C2", day: "mon", reason: "   " }])).rejects.toBeInstanceOf(BadRequestException);
    const after = await owner.select().from(mealPlans).where(eq(mealPlans.patientId, PATIENT));
    expect(after).toHaveLength(before.length);
  });

  it("guarda las decisiones; las de alertas que ya no existen se ignoran", async () => {
    const plan = await save([
      { rule: "C2", day: "mon", reason: "Semana de descarga, se compensa el miércoles." },
      { rule: "C4", day: "mon" },
      { rule: "C5", day: "sun", reason: "No aplica" },
    ]);
    expect(plan.alertReviews).toEqual([
      expect.objectContaining({ rule: "C2", decision: "kept", reason: "Semana de descarga, se compensa el miércoles." }),
      expect.objectContaining({ rule: "C4", decision: "kept", reason: null }),
      expect.objectContaining({ rule: "C6", decision: "unreviewed", reason: null }),
    ]);
    // Las versiones anteriores conservan su propia foto.
    const list = await asPro(() => plans.list(PATIENT));
    expect(list[1]!.alertReviews!.every((a) => a.decision === "unreviewed")).toBe(true);
  });

  it("append-only: el rol app no puede editar ni borrar", async () => {
    await expect(
      withTenant(appDb, T.id, (tx) => tx.execute(sql`update plan_alert_reviews set reason = 'x' where patient_id = ${PATIENT}`)),
    ).rejects.toThrow();
    await expect(
      withTenant(appDb, T.id, (tx) => tx.execute(sql`delete from plan_alert_reviews where patient_id = ${PATIENT}`)),
    ).rejects.toThrow();
  });

  it("RLS: otra organización no las ve", async () => {
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(planAlertReviews).where(eq(planAlertReviews.patientId, PATIENT)),
    );
    expect(leaked).toHaveLength(0);
  });
});
