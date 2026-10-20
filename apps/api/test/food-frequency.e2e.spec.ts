import { NotFoundException } from "@nestjs/common";
import { createDb, foodFrequencySurveys, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import {
  ffqItemResults,
  gapaComparison,
  saveFoodFrequencySchema,
  wholeGrainShare,
  type AuthOrg,
  type FfqAnswers,
  type MembershipRole,
} from "@nutreitor/shared";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { FoodFrequencyService } from "../src/modules/patients/food-frequency.service.js";

/**
 * Frecuencia de consumo (ADR 0034): conversión de frecuencias a porciones, comparación
 * con las GAPA y, contra Postgres real, alta/edición/borrado con scoping y RLS.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo; mujer
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin asignar

const ANSWERS: FfqAnswers = {
  vegetables: { frequency: "daily1", portions: 2 },
  fruits: { frequency: "weekly2to4", portions: 1 },
  dairy: { frequency: "daily2to3", portions: 1 },
  fish: { frequency: "monthly", portions: 1 },
  redMeat: { frequency: "weekly5to6", portions: 1 },
  eggs: { frequency: "daily1", portions: 2 },
  water: { frequency: "daily6plus", portions: 1 },
  sugaryDrinks: { frequency: "daily1", portions: 1 },
  sweetsSnacks: { frequency: "weekly2to4", portions: 1 },
  alcohol: { frequency: "daily1", portions: 2 },
  wholeGrains: { frequency: "weekly2to4", portions: 1 },
  refinedGrains: { frequency: "daily1", portions: 2 },
};

describe("cálculo", () => {
  it("frecuencia × porciones → por semana y por día", () => {
    const byKey = new Map(ffqItemResults(ANSWERS).map((r) => [r.key, r]));
    expect(byKey.get("vegetables")).toMatchObject({ timesPerWeek: 7, portionsPerWeek: 14, portionsPerDay: 2 });
    expect(byKey.get("fruits")).toMatchObject({ portionsPerWeek: 3, portionsPerDay: 0.4 });
    expect(byKey.get("fish")).toMatchObject({ timesPerWeek: 0.5 });
    expect(byKey.has("legumes")).toBe(false);
  });

  it("comparación con las GAPA (mujer)", () => {
    const g = Object.fromEntries(gapaComparison(ANSWERS, "female").map((r) => [r.id, r]));
    expect(g.vegFruit).toMatchObject({ value: 2.4, status: "below" });
    expect(g.dairy).toMatchObject({ value: 2.5, status: "below" });
    expect(g.fish).toMatchObject({ value: 0.5, status: "below" });
    expect(g.redMeat).toMatchObject({ value: 5.5, status: "above" });
    expect(g.eggs).toMatchObject({ value: 2, status: "above" });
    expect(g.water).toMatchObject({ value: 6, status: "below" });
    expect(g.optional).toMatchObject({ value: 1.4, status: "above" });
    expect(g.alcohol).toMatchObject({ value: 2, status: "above" });
  });

  it("el tope de alcohol depende del sexo; lo no contestado no se evalúa; integrales sobre el total", () => {
    expect(gapaComparison(ANSWERS, "male").find((r) => r.id === "alcohol")?.status).toBe("ok");
    expect(gapaComparison({ fruits: ANSWERS.fruits }, null).find((r) => r.id === "dairy")?.status).toBe("unanswered");
    expect(wholeGrainShare(ANSWERS)).toBe(18);
    expect(wholeGrainShare({})).toBeNull();
  });

  it("validación: al menos un grupo, claves del catálogo", () => {
    expect(saveFoodFrequencySchema.safeParse({ answeredOn: "2026-10-20", answers: ANSWERS }).success).toBe(true);
    expect(saveFoodFrequencySchema.safeParse({ answeredOn: "2026-10-20", answers: {} }).success).toBe(false);
    expect(saveFoodFrequencySchema.safeParse({ answeredOn: "2026-10-20", answers: { pizza: { frequency: "daily1", portions: 1 } } }).success).toBe(false);
  });
});

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let svc: FoodFrequencyService;

const asPro = <X>(fn: () => Promise<X>) =>
  tenantStorage.run(
    { context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: PRO_USER, role: "professional" as MembershipRole } },
    fn,
  );

describe("cuestionarios", () => {
  beforeAll(async () => {
    await runMigrations(OWNER_URL);
    await runSeed(OWNER_URL);
    ({ db: appDb, pool: appPool } = createDb(APP_URL));
    ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
    await owner.delete(foodFrequencySurveys).where(eq(foodFrequencySurveys.patientId, D1));
    svc = new FoodFrequencyService(new TenantDbService(appDb), new AuditService());
  });

  afterAll(async () => {
    await owner?.delete(foodFrequencySurveys).where(eq(foodFrequencySurveys.patientId, D1));
    await appPool?.end();
    await ownerPool?.end();
  });

  it("alta con resultados (sexo de la ficha), edición y borrado", async () => {
    const s = await asPro(() => svc.create(D1, { answeredOn: "2026-10-20", answers: ANSWERS }));
    expect(s.gapa.find((r) => r.id === "alcohol")?.status).toBe("above"); // mujer
    expect(s.wholeGrainPct).toBe(18);
    const edited = await asPro(() =>
      svc.update(D1, s.id, { answeredOn: "2026-10-20", answers: { ...ANSWERS, fish: { frequency: "weekly2to4", portions: 1 } } }),
    );
    expect(edited.gapa.find((r) => r.id === "fish")?.status).toBe("ok");
    expect((await asPro(() => svc.list(D1)))[0]).toMatchObject({ id: s.id, recordedByName: "Profesional Demo" });
    await asPro(() => svc.remove(D1, s.id));
    expect(await asPro(() => svc.list(D1))).toHaveLength(0);
  });

  it("scoping y RLS", async () => {
    await expect(asPro(() => svc.list(D2))).rejects.toBeInstanceOf(NotFoundException);
    await asPro(() => svc.create(D1, { answeredOn: "2026-10-20", answers: ANSWERS }));
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(foodFrequencySurveys).where(eq(foodFrequencySurveys.patientId, D1)));
    expect(leaked).toHaveLength(0);
  });
});
