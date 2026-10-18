import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { adherenceScore, isLoggableDate, isoDay, type MembershipRole } from "@nutreitor/shared";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AdherenceService } from "../src/modules/patients/adherence.service.js";
import { MealPlansService } from "../src/modules/patients/meal-plans.service.js";

/**
 * Adherencia (Fase 4.3): el paciente registra sólo sobre SU ficha, comidas de SU plan
 * y en una ventana corta; el profesional lee sólo a sus asignados.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;

const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3"; // patient@demo → ficha d1
const D1 = "00000000-0000-0000-0000-0000000000d1";
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2";
const A1_OTHER_TENANT = "00000000-0000-0000-0000-0000000000a1";

let appDb: Database;
let appPool: pg.Pool;
let svc: AdherenceService;
let plans: MealPlansService;

function as<T>(userId: string, role: MembershipRole, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(
    {
      context: { tenantId: SEED.orgDemo.id, orgId: SEED.orgDemo.id, region: SEED.orgDemo.region },
      org: { id: SEED.orgDemo.id, name: SEED.orgDemo.name, slug: SEED.orgDemo.slug, region: SEED.orgDemo.region, status: SEED.orgDemo.status, kind: SEED.orgDemo.kind },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as(PRO_USER, "professional", fn);
const asPatient = <T>(fn: () => Promise<T>) => as(PATIENT_USER, "patient", fn);

const today = new Date().toISOString().slice(0, 10);
const range = { from: isoDay(new Date(), -7), to: isoDay(new Date(), 1) };

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  const tenantDb = new TenantDbService(appDb);
  svc = new AdherenceService(tenantDb);
  plans = new MealPlansService(tenantDb, new AuditService());
  await asPro(() =>
    plans.save(D1, {
      title: "Plan adherencia",
      body: {
        layout: "day",
        day: {
          meals: [
            { name: "Desayuno", items: [{ text: "Avena" }] },
            { name: "Cena", items: [{ text: "Merluza" }] },
          ],
        },
      },
    }),
  );
});

afterAll(async () => {
  await appPool?.end();
});

describe("Adherencia — paciente", () => {
  it("marca una comida de su plan y la corrige (upsert por fecha + comida)", async () => {
    await asPatient(() => svc.logMeal({ date: today, mealName: "Desayuno", status: "partial" }));
    const log = await asPatient(() =>
      svc.logMeal({ date: today, mealName: "Desayuno", status: "done", note: "con fruta" }),
    );
    expect(log).toEqual({ date: today, mealName: "Desayuno", status: "done", note: "con fruta" });
    const mine = await asPatient(() => svc.mine({ from: today, to: today }));
    expect(mine.logs.filter((l) => l.mealName === "Desayuno")).toHaveLength(1);
  });

  it("rechaza una comida que no está en su plan y fechas fuera de la ventana", async () => {
    await expect(
      asPatient(() => svc.logMeal({ date: today, mealName: "Almuerzo", status: "done" })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      asPatient(() => svc.logMeal({ date: isoDay(new Date(), -10), mealName: "Cena", status: "done" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("registra la sensación del día y la corrige", async () => {
    await asPatient(() => svc.checkin({ date: today, hunger: 4, energy: 2, mood: 3 }));
    const c = await asPatient(() => svc.checkin({ date: today, hunger: 3, energy: 4, mood: 5, note: "bien" }));
    expect(c).toEqual({ date: today, hunger: 3, energy: 4, mood: 5, note: "bien" });
  });
});

describe("Adherencia — profesional", () => {
  it("el profesional asignado ve lo que registró el paciente", async () => {
    const a = await asPro(() => svc.forPatient(D1, range));
    expect(a.logs.some((l) => l.date === today && l.mealName === "Desayuno" && l.status === "done")).toBe(true);
    expect(a.checkins.some((c) => c.date === today && c.mood === 5)).toBe(true);
  });

  it("no ve a un paciente no asignado ni de otro tenant → 404", async () => {
    for (const id of [D2_UNASSIGNED, A1_OTHER_TENANT]) {
      await expect(asPro(() => svc.forPatient(id, range))).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

describe("Adherencia — lógica pura", () => {
  it("puntaje: cumplí 1, en parte ½, no 0; sin registros es null (no 0 %)", () => {
    expect(adherenceScore([{ status: "done" }, { status: "partial" }, { status: "skipped" }, { status: "done" }]).pct).toBe(63);
    expect(adherenceScore([]).pct).toBeNull();
  });

  it("ventana: hoy y los últimos días, con un día de tolerancia por zona horaria", () => {
    expect(isLoggableDate("2026-10-18", "2026-10-18")).toBe(true);
    expect(isLoggableDate("2026-10-19", "2026-10-18")).toBe(true);
    expect(isLoggableDate("2026-10-14", "2026-10-18")).toBe(true);
    expect(isLoggableDate("2026-10-13", "2026-10-18")).toBe(false);
    expect(isLoggableDate("2026-10-20", "2026-10-18")).toBe(false);
  });
});
