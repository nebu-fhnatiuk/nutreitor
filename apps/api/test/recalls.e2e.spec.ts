import { NotFoundException } from "@nestjs/common";
import { createDb, dietaryRecalls, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { recallTotals, saveRecallSchema, type AuthOrg, type MembershipRole, type SaveRecallDto } from "@nutreitor/shared";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { RecallsService } from "../src/modules/patients/recalls.service.js";

/**
 * Recordatorio de 24 h (ADR 0033) contra Postgres real con el rol app: totales
 * derivados (parciales si hay texto libre sin macros), edición, borrado, scoping del
 * plan y RLS.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin asignar

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let svc: RecallsService;

const asPro = <X>(fn: () => Promise<X>) =>
  tenantStorage.run(
    { context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: PRO_USER, role: "professional" as MembershipRole } },
    fn,
  );

const DTO: SaveRecallDto = {
  recalledDate: "2026-10-19",
  typical: true,
  dayLabel: "Entrenamiento",
  meals: [
    {
      name: "Desayuno",
      time: "07:30",
      items: [
        { text: "Avena", qty: 60, unit: "g", macros: { kcal: 233, protein_g: 10, carbs_g: 40, fat_g: 4 } },
        { text: "Banana", macros: { kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 } },
      ],
    },
    {
      name: "Durante el entrenamiento",
      items: [{ text: "Bebida deportiva 500 ml", macros: { kcal: 120, carbs_g: 30 } }],
    },
    { name: "Cena", items: [{ text: "Milanesa con puré" }] },
  ],
  note: "Se olvidó del mate con azúcar: agregado en la segunda pasada.",
};

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  await owner.delete(dietaryRecalls).where(eq(dietaryRecalls.patientId, D1));
  svc = new RecallsService(new TenantDbService(appDb), new AuditService());
});

afterAll(async () => {
  await owner?.delete(dietaryRecalls).where(eq(dietaryRecalls.patientId, D1));
  await appPool?.end();
  await ownerPool?.end();
});

describe("totales", () => {
  it("suma los items con macros y marca el total como parcial si hay texto libre", () => {
    const t = recallTotals(DTO.meals);
    expect(t.macros).toMatchObject({ kcal: 458, carbs_g: 97 });
    expect(t).toMatchObject({ items: 4, itemsWithoutMacros: 1 });
    expect(t.byMeal).toEqual([
      { name: "Desayuno", kcal: 338 },
      { name: "Durante el entrenamiento", kcal: 120 },
      { name: "Cena", kcal: null },
    ]);
  });

  it("valida: al menos una comida y fecha bien formada", () => {
    expect(saveRecallSchema.safeParse(DTO).success).toBe(true);
    expect(saveRecallSchema.safeParse({ ...DTO, meals: [] }).success).toBe(false);
    expect(saveRecallSchema.safeParse({ ...DTO, recalledDate: "19/10/2026" }).success).toBe(false);
  });
});

describe("recordatorios", () => {
  let id: string;

  it("el profesional asignado lo carga y lo lista con los totales", async () => {
    const r = await asPro(() => svc.create(D1, DTO));
    id = r.id;
    expect(r.totals.macros?.kcal).toBe(458);
    const list = await asPro(() => svc.list(D1));
    expect(list[0]).toMatchObject({ id, dayLabel: "Entrenamiento", typical: true, recordedByName: "Profesional Demo" });
  });

  it("editar recalcula; borrar lo saca", async () => {
    const meals = DTO.meals.map((m) => (m.name === "Cena" ? { ...m, items: [{ text: "Milanesa con puré", macros: { kcal: 650 } }] } : m));
    const edited = await asPro(() => svc.update(D1, id, { ...DTO, meals }));
    expect(edited.totals).toMatchObject({ itemsWithoutMacros: 0, macros: { kcal: 1108 } });
    await asPro(() => svc.remove(D1, id));
    expect(await asPro(() => svc.list(D1))).toHaveLength(0);
  });

  it("scoping y RLS", async () => {
    await expect(asPro(() => svc.list(D2))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.create(D2, DTO))).rejects.toBeInstanceOf(NotFoundException);
    await asPro(() => svc.create(D1, DTO));
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(dietaryRecalls).where(eq(dietaryRecalls.patientId, D1)));
    expect(leaked).toHaveLength(0);
  });
});
