import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDb, foodCatalog, tenantFoods, tenantRecipes, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { tenantFoodSchema, updatePatientSchema, type MembershipRole } from "@nutreitor/shared";
import { inArray, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { FoodsService } from "../src/modules/foods/foods.service.js";
import { RecipesService } from "../src/modules/foods/recipes.service.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { PatientNotesService } from "../src/modules/patients/patient-notes.service.js";
import { PatientsService } from "../src/modules/patients/patients.service.js";

/**
 * Alérgenos estructurados (KAN-105, migración 0055) contra Postgres real con el rol
 * app: el catálogo coincide con la curación validada, los alimentos propios y las
 * recetas los exponen (las recetas heredan de sus ingredientes), y la ficha guarda
 * las casillas con CHECK sobre las claves válidas.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T = SEED.orgDemo;
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo

const here = dirname(fileURLToPath(import.meta.url));
const curation = JSON.parse(readFileSync(join(here, "../../../packages/db/catalog/foods-ar.curation.json"), "utf8")) as {
  foods: { slug: string; allergens: string[] }[];
};

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let foods: FoodsService;
let recipes: RecipesService;
let patientsSvc: PatientsService;
const createdFoods: string[] = [];
const createdRecipes: string[] = [];

const asPro = <X>(fn: () => Promise<X>) =>
  tenantStorage.run(
    {
      context: { tenantId: T.id, orgId: T.id, region: T.region },
      org: { id: T.id, name: T.name, slug: T.slug, region: T.region, status: T.status, kind: T.kind },
      user: { id: PRO_USER, role: "professional" as MembershipRole },
    },
    fn,
  );

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  foods = new FoodsService(tenantDb, audit);
  recipes = new RecipesService(tenantDb, audit);
  patientsSvc = new PatientsService(tenantDb, audit, new CareAssignmentsService(tenantDb, audit), new PatientNotesService(tenantDb, audit));
});

afterAll(async () => {
  if (owner) {
    if (createdRecipes.length) await owner.delete(tenantRecipes).where(inArray(tenantRecipes.id, createdRecipes));
    if (createdFoods.length) await owner.delete(tenantFoods).where(inArray(tenantFoods.id, createdFoods));
  }
  await asPro(() => patientsSvc.update(D1, { allergyFlags: [] })).catch(() => {});
  await appPool?.end();
  await ownerPool?.end();
});

describe("catálogo", () => {
  it("los alérgenos en la base coinciden con la curación validada (foods-ar.curation.json)", async () => {
    const rows = await owner.select({ slug: foodCatalog.slug, allergens: foodCatalog.allergens }).from(foodCatalog);
    const inDb = Object.fromEntries(rows.map((r) => [r.slug, r.allergens]));
    for (const f of curation.foods) expect(inDb[f.slug], f.slug).toEqual(f.allergens);
    expect(curation.foods.filter((f) => f.allergens.length)).toHaveLength(40);
  });

  it("la búsqueda devuelve los alérgenos", async () => {
    const [hummus] = await asPro(() => foods.search({ q: "hummus", limit: 1 }));
    expect(hummus).toMatchObject({ source: "catalog", allergens: ["sesamo"] });
  });

  it("la base rechaza claves que no están en la lista", async () => {
    await expect(owner.execute(sql`update food_catalog set allergens = '{gato}' where slug = 'hummus'`)).rejects.toThrow();
  });
});

describe("alimentos propios y recetas", () => {
  it("un alimento propio guarda sus alérgenos sin repetidos y en orden", async () => {
    const f = await asPro(() =>
      foods.create(
        tenantFoodSchema.parse({
          name: "Barrita casera de maní (prueba)",
          group: "Preparaciones",
          energyKcal: 420,
          proteinG: 15,
          carbsG: 40,
          fatG: 20,
          allergens: ["mani", "leche", "mani"],
        }),
      ),
    );
    createdFoods.push(f.id);
    expect(f.allergens).toEqual(["leche", "mani"]);
  });

  it("una receta hereda la unión de los alérgenos de sus ingredientes", async () => {
    const [own] = createdFoods;
    const r = await asPro(() =>
      recipes.create({
        name: "Tarta de prueba con barrita",
        category: "Platos principales",
        servings: 4,
        ingredients: [
          { kind: "catalog", slug: "harina-de-trigo", grams: 200 },
          { kind: "catalog", slug: "huevo-entero", grams: 100 },
          { kind: "tenant", id: own!, grams: 50 },
        ],
      }),
    );
    createdRecipes.push(r.id);
    const [hit] = await asPro(() => foods.search({ q: "tarta de prueba con barrita", limit: 1 }));
    expect(hit).toMatchObject({ source: "recipe", allergens: ["tacc", "leche", "huevo", "mani"] });
  });

  it("las recetas de la biblioteca también: tarta de acelga y ricota", async () => {
    const [hit] = await asPro(() => foods.search({ q: "tarta de acelga", limit: 1 }));
    expect(hit).toMatchObject({ source: "library", allergens: ["tacc", "leche", "huevo", "lactosa"] });
  });
});

describe("ficha", () => {
  it("guarda las casillas (normalizadas por el schema, como en el controller) y las devuelve", async () => {
    const dto = updatePatientSchema.parse({ allergyFlags: ["celiaquia", "mani", "mani"] });
    const p = await asPro(() => patientsSvc.update(D1, dto));
    expect(p.clinical!.allergyFlags).toEqual(["mani", "celiaquia"]);
  });

  it("null limpia las casillas", async () => {
    const p = await asPro(() => patientsSvc.update(D1, { allergyFlags: null }));
    expect(p.clinical!.allergyFlags).toEqual([]);
  });

  it("la base rechaza casillas que no existen", async () => {
    await expect(
      withTenant(appDb, T.id, (tx) => tx.execute(sql`update patients set allergy_flags = '{gato}' where id = ${D1}`)),
    ).rejects.toThrow();
  });
});
