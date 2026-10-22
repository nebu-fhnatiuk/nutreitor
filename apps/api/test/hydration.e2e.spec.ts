import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createDb, sweatTests, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { saveSweatTestSchema, sweatTestResults, type AuthOrg, type MembershipRole, type SaveSweatTestDto } from "@nutreitor/shared";
import { inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { HydrationService } from "../src/modules/patients/hydration.service.js";

/**
 * Prueba de sudoración (ADR 0036). Los valores esperados salen de una implementación
 * independiente en Python. Contra Postgres real: carga individual y por plantel (todo
 * o nada), scoping y RLS.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin asignar

describe("cálculo", () => {
  it("futbolista, 90 min con calor: tasa alta, más de 2 % y sodio", () => {
    expect(sweatTestResults({ preWeightKg: 74.2, postWeightKg: 72.5, durationMin: 90, fluidIntakeMl: 750, urineMl: 0 })).toMatchObject({
      weightLossKg: 1.7,
      sweatLossL: 2.45,
      sweatRateLh: 1.63,
      dehydrationPct: 2.3,
      replacementPct: 31,
      plan: { beforeMl: [350, 500], duringMlPerHour: 650, afterMl: [2150, 2550], suggestSodium: true },
    });
  });

  it("corredora, 60 min: dentro del 2 %, no hace falta tomar más", () => {
    const r = sweatTestResults({ preWeightKg: 56.8, postWeightKg: 56.3, durationMin: 60, fluidIntakeMl: 500, urineMl: 100 });
    expect(r).toMatchObject({ sweatLossL: 0.9, sweatRateLh: 0.9, dehydrationPct: 0.9, warnings: [] });
    // 1,25 × 0,5 kg = 625 ml → redondeado a 50 ml (mitad hacia arriba) = 650.
    expect(r.plan).toMatchObject({ duringMlPerHour: 0, afterMl: [650, 750], suggestSodium: false });
  });

  it("si ganó peso, avisa del riesgo de hiponatremia y no sugiere reponer después", () => {
    const r = sweatTestResults({ preWeightKg: 80, postWeightKg: 80.3, durationMin: 120, fluidIntakeMl: 2500, urineMl: 200 });
    expect(r.warnings[0]).toContain("hiponatremia");
    expect(r.plan.afterMl).toEqual([0, 0]);
  });

  it("rechaza diferencias de peso imposibles", () => {
    const base = { measuredOn: "2026-10-22", durationMin: 90, preWeightKg: 74.2, postWeightKg: 72.5, fluidIntakeMl: 750, urineMl: 0 };
    expect(saveSweatTestSchema.safeParse(base).success).toBe(true);
    expect(saveSweatTestSchema.safeParse({ ...base, postWeightKg: 64.2 }).success).toBe(false);
    expect(saveSweatTestSchema.safeParse({ ...base, durationMin: 5 }).success).toBe(false);
  });
});

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let svc: HydrationService;

const as = <X>(userId: string, role: MembershipRole, fn: () => Promise<X>) =>
  tenantStorage.run({ context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: userId, role } }, fn);
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);

const DTO: SaveSweatTestDto = {
  measuredOn: "2026-10-22",
  sessionLabel: "Entrenamiento con calor",
  durationMin: 90,
  temperatureC: 31,
  humidityPct: 60,
  preWeightKg: 74.2,
  postWeightKg: 72.5,
  fluidIntakeMl: 750,
  urineMl: 0,
};

describe("pruebas", () => {
  beforeAll(async () => {
    await runMigrations(OWNER_URL);
    await runSeed(OWNER_URL);
    ({ db: appDb, pool: appPool } = createDb(APP_URL));
    ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
    await owner.delete(sweatTests).where(inArray(sweatTests.patientId, [D1, D2]));
    svc = new HydrationService(new TenantDbService(appDb), new AuditService());
  });

  afterAll(async () => {
    await owner?.delete(sweatTests).where(inArray(sweatTests.patientId, [D1, D2]));
    await appPool?.end();
    await ownerPool?.end();
  });

  it("individual: alta con resultados, edición y borrado", async () => {
    const t = await asPro(() => svc.create(D1, DTO));
    expect(t).toMatchObject({ temperatureC: 31, preWeightKg: 74.2, results: { sweatRateLh: 1.63 } });
    const edited = await asPro(() => svc.update(D1, t.id, { ...DTO, fluidIntakeMl: 1500 }));
    expect(edited.results.dehydrationPct).toBe(2.3); // la pérdida de peso no cambia
    expect(edited.results.sweatLossL).toBe(3.2);
    await asPro(() => svc.remove(D1, t.id));
    expect(await asPro(() => svc.list(D1))).toHaveLength(0);
  });

  it("plantel: todo o nada; el profesional sólo carga a sus asignados", async () => {
    const entry = { preWeightKg: 74.2, postWeightKg: 72.5, fluidIntakeMl: 750, urineMl: 0 };
    const session = { measuredOn: "2026-10-22", durationMin: 90 };
    await expect(
      asPro(() => svc.createForGroup(SEED.groupDemo, { ...session, entries: [{ patientId: D1, ...entry }, { patientId: D2, ...entry }] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await asAdmin(() => svc.list(D1))).toHaveLength(0);

    expect(
      await asAdmin(() => svc.createForGroup(SEED.groupDemo, { ...session, entries: [{ patientId: D1, ...entry }, { patientId: D2, ...entry, postWeightKg: 73.7 }] })),
    ).toEqual({ created: 2 });
    const pro = await asPro(() => svc.groupSummary(SEED.groupDemo));
    expect(pro.map((r) => r.patientId)).toEqual([D1]);
    expect(pro[0]!.last).toMatchObject({ groupId: SEED.groupDemo, results: { sweatRateLh: 1.63 } });
    const admin = await asAdmin(() => svc.groupSummary(SEED.groupDemo));
    expect(admin.find((r) => r.patientId === D2)?.last?.results.dehydrationPct).toBe(0.7);
  });

  it("scoping y RLS", async () => {
    await expect(asPro(() => svc.list(D2))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.create(D2, DTO))).rejects.toBeInstanceOf(NotFoundException);
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(sweatTests).where(inArray(sweatTests.patientId, [D1, D2])));
    expect(leaked).toHaveLength(0);
  });
});
