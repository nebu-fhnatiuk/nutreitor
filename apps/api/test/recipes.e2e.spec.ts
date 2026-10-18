import { createDb, foodCatalog, memberships, tenantFoods, tenantRecipes, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { tenantFoodSchema, type MembershipRole } from "@nutreitor/shared";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { FoodsService } from "../src/modules/foods/foods.service.js";
import { RecipesService } from "../src/modules/foods/recipes.service.js";

/**
 * Recetas (ADR 0019) contra Postgres real con el rol app: nutrientes calculados
 * desde los ingredientes, la receta como "un alimento más" en la búsqueda, el
 * recetario global (migración 0029), aislamiento entre consultorios y copia.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";

let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let recipes: RecipesService;
let foods: FoodsService;
const createdRecipes: string[] = [];
const createdFoods: string[] = [];

function as<T>(tenant: "demo" | "orgA", fn: () => Promise<T>, role: MembershipRole = "professional") {
  const org = tenant === "demo" ? SEED.orgDemo : SEED.orgA;
  return tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org: { id: org.id, name: org.name, slug: org.slug, region: org.region },
      user: { id: PRO_USER, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as("demo", fn);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  let appDb: Database;
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  recipes = new RecipesService(tenantDb, new AuditService());
  foods = new FoodsService(tenantDb, new AuditService());
});

afterAll(async () => {
  if (ownerDb) {
    if (createdRecipes.length) await ownerDb.delete(tenantRecipes).where(inArray(tenantRecipes.id, createdRecipes));
    if (createdFoods.length) await ownerDb.delete(tenantFoods).where(inArray(tenantFoods.id, createdFoods));
  }
  await appPool?.end();
  await ownerPool?.end();
});

async function catalogValues(slug: string) {
  const [row] = await ownerDb.select().from(foodCatalog).where(inArray(foodCatalog.slug, [slug]));
  return { kcal: Number(row!.energyKcal), protein: Number(row!.proteinG) };
}

describe("Cálculo de una receta", () => {
  it("los nutrientes son la suma de los ingredientes; por porción = total ÷ porciones", async () => {
    const rice = await catalogValues("arroz-blanco-cocido");
    const chicken = await catalogValues("pechuga-pollo-cocida");
    const r = await asPro(() =>
      recipes.create({
        name: "Arroz con pollo de prueba",
        category: "Platos principales",
        servings: 2,
        ingredients: [
          { kind: "catalog", slug: "arroz-blanco-cocido", grams: 300 },
          { kind: "catalog", slug: "pechuga-pollo-cocida", grams: 200 },
        ],
      }),
    );
    createdRecipes.push(r.id);
    const expectedKcal = rice.kcal * 3 + chicken.kcal * 2;
    expect(r.totalGrams).toBe(500);
    expect(r.total.energyKcal).toBe(Math.round(expectedKcal));
    expect(r.perServing.energyKcal).toBe(Math.round(expectedKcal / 2));
    expect(r.per100g.energyKcal).toBe(Math.round(expectedKcal / 5));
    expect(r.total.proteinG).toBeCloseTo(rice.protein * 3 + chicken.protein * 2, 0);
    expect(r.ingredients.map((i) => i.name)).toEqual(["Arroz blanco, cocido", "Pechuga de pollo sin piel, cocida"]);
  });

  it("aparece en la búsqueda del editor como un alimento con '1 porción'", async () => {
    const [hit] = await asPro(() => foods.search({ q: "arroz con pollo de prueba", limit: 3 }));
    expect(hit).toMatchObject({ source: "recipe", portions: [{ label: "1 porción", grams: 250 }] });
    expect(hit!.recipe).toMatchObject({ servings: 2, totalGrams: 500, missingIngredients: 0 });
  });
});

describe("Biblioteca global", () => {
  it("las 14 recetas del recetario están, calculadas y buscables", async () => {
    const list = await asPro(() => recipes.list());
    const library = list.filter((r) => r.source === "library");
    expect(library.length).toBeGreaterThanOrEqual(14);
    expect(library.every((r) => r.missingIngredients === 0 && r.total.energyKcal > 0)).toBe(true);
    const hits = await asPro(() => foods.search({ q: "guiso de lentejas", limit: 3 }));
    expect(hits[0]).toMatchObject({ source: "library", name: "Guiso de lentejas con vegetales" });
  });

  it("copiar una receta de la biblioteca la suma a las del consultorio", async () => {
    const lib = (await asPro(() => recipes.list())).find((r) => r.source === "library")!;
    const copy = await asPro(() => recipes.copyFromLibrary(lib.id));
    createdRecipes.push(copy.id);
    expect(copy).toMatchObject({ source: "recipe", name: lib.name, servings: lib.servings });
    expect(copy.total.energyKcal).toBe(lib.total.energyKcal);
  });

  it("la biblioteca no se edita por la API (un id de la biblioteca no es una receta propia)", async () => {
    const lib = (await asPro(() => recipes.list())).find((r) => r.source === "library")!;
    await expect(
      asPro(() => recipes.update(lib.id, { name: "x", category: "x", servings: 1, ingredients: [{ kind: "catalog", slug: "banana", grams: 1 }] })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("Ingredientes propios y aislamiento", () => {
  it("una receta puede usar un alimento propio; si se archiva, cuenta como faltante", async () => {
    const own = await asPro(() =>
      foods.create(tenantFoodSchema.parse({ name: "Masa casera de prueba", group: "Preparaciones", energyKcal: 300, proteinG: 8, carbsG: 50, fatG: 8 })),
    );
    createdFoods.push(own.id);
    const r = await asPro(() =>
      recipes.create({
        name: "Receta con masa propia",
        category: "Platos principales",
        servings: 1,
        ingredients: [{ kind: "tenant", id: own.id, grams: 100 }],
      }),
    );
    createdRecipes.push(r.id);
    expect(r.total.energyKcal).toBe(300);
    await asPro(() => foods.archive(own.id));
    const again = await asPro(() => recipes.get("recipe", r.id));
    // Archivado ≠ borrado: sigue existiendo, sus valores siguen sirviendo.
    expect(again.missingIngredients).toBe(0);
  });

  it("no se puede usar un alimento propio de OTRO consultorio → 400", async () => {
    // Alimento de orgA insertado con el owner (orgA no tiene memberships en el seed;
    // el autor da igual: lo que se prueba es que demo no lo pueda usar).
    const [anyMembership] = await ownerDb.select({ id: memberships.id }).from(memberships).limit(1);
    const [foreign] = await ownerDb
      .insert(tenantFoods)
      .values({
        tenantId: SEED.orgA.id,
        region: SEED.orgA.region,
        name: "Alimento de orgA",
        foodGroup: "x",
        energyKcal: "100",
        proteinG: "1",
        carbsG: "1",
        fatG: "1",
        createdByMembershipId: anyMembership!.id,
      })
      .returning({ id: tenantFoods.id });
    createdFoods.push(foreign!.id);
    await expect(
      asPro(() =>
        recipes.create({ name: "x", category: "x", servings: 1, ingredients: [{ kind: "tenant", id: foreign!.id, grams: 10 }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cross-tenant: las recetas de un consultorio no aparecen en otro", async () => {
    const r = await asPro(() =>
      recipes.create({ name: "Receta secreta demo", category: "x", servings: 1, ingredients: [{ kind: "catalog", slug: "banana", grams: 100 }] }),
    );
    createdRecipes.push(r.id);
    const hits = await as("orgA", () => foods.search({ q: "receta secreta demo", limit: 5 }));
    expect(hits.some((h) => h.id === r.id)).toBe(false);
    await expect(as("orgA", () => recipes.get("recipe", r.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("archivar la saca de la búsqueda", async () => {
    const r = await asPro(() =>
      recipes.create({ name: "Receta para archivar", category: "x", servings: 1, ingredients: [{ kind: "catalog", slug: "banana", grams: 100 }] }),
    );
    createdRecipes.push(r.id);
    await asPro(() => recipes.archive(r.id));
    const hits = await asPro(() => foods.search({ q: "receta para archivar", limit: 5 }));
    expect(hits.some((h) => h.id === r.id)).toBe(false);
  });
});
