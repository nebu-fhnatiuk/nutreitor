import { createDb, tenantFoods, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { hasCapability, tenantFoodSchema, type MembershipRole } from "@nutreitor/shared";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { FoodsService } from "../src/modules/foods/foods.service.js";

/**
 * Base de alimentos (ADR 0018) contra Postgres real con el rol app: búsqueda sobre
 * el catálogo global (migración 0027) + alimentos propios, aislamiento de los propios
 * entre consultorios y su ciclo de vida (alta, edición, archivado).
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const GHOST_USER = "00000000-0000-0000-0000-0000000000ff";

let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let svc: FoodsService;
const created: string[] = [];

function as<T>(tenant: "demo" | "orgA", userId: string, role: MembershipRole, fn: () => Promise<T>) {
  const org = tenant === "demo" ? SEED.orgDemo : SEED.orgA;
  return tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org: { id: org.id, name: org.name, slug: org.slug, region: org.region },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as("demo", PRO_USER, "professional", fn);

const input = (name: string) =>
  tenantFoodSchema.parse({
    name,
    group: "Preparaciones",
    energyKcal: 250,
    proteinG: 10,
    carbsG: 30,
    fatG: 10,
    portions: [{ label: "1 porción", grams: 150 }],
  });

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  let appDb: Database;
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  svc = new FoodsService(new TenantDbService(appDb), new AuditService());
});

afterAll(async () => {
  // El rol app no tiene DELETE sobre tenant_foods (se archiva): limpieza vía owner.
  if (ownerDb && created.length) {
    await ownerDb.delete(tenantFoods).where(inArray(tenantFoods.id, created));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("Búsqueda en el catálogo global", () => {
  it("no distingue acentos ni mayúsculas: 'limon' encuentra 'Limón (jugo)'", async () => {
    const hits = await asPro(() => svc.search({ q: "limon", limit: 10 }));
    expect(hits.map((h) => h.name)).toContain("Limón (jugo)");
  });

  it("lo que EMPIEZA con el término va primero: 'arroz' arranca con arroces", async () => {
    const hits = await asPro(() => svc.search({ q: "ARROZ", limit: 5 }));
    expect(hits[0]!.name.toLowerCase().startsWith("arroz")).toBe(true);
  });

  it("devuelve nutrientes por 100 g, medidas caseras y atribución a USDA", async () => {
    const [rice] = await asPro(() => svc.search({ q: "arroz blanco", limit: 1 }));
    expect(rice).toMatchObject({
      source: "catalog",
      per100g: { energyKcal: 130, proteinG: 2.69 },
      attribution: "USDA FoodData Central",
    });
    expect(rice!.portions.length).toBeGreaterThan(0);
  });

  it("tolera errores de tipeo por similitud ('almendas' → Almendras)", async () => {
    const hits = await asPro(() => svc.search({ q: "almendas", limit: 5 }));
    expect(hits.map((h) => h.name)).toContain("Almendras");
  });

  it("los comodines de LIKE en la búsqueda se toman literales", async () => {
    const hits = await asPro(() => svc.search({ q: "%%", limit: 5 }));
    expect(hits).toEqual([]);
  });
});

describe("Alimentos propios del consultorio", () => {
  it("el profesional crea uno y aparece en la búsqueda de SU consultorio", async () => {
    const food = await asPro(() => svc.create(input("Tarta de verdura de la casa")));
    created.push(food.id);
    expect(food.source).toBe("tenant");
    const hits = await asPro(() => svc.search({ q: "tarta de verdura", limit: 5 }));
    expect(hits[0]).toMatchObject({ id: food.id, source: "tenant" });
  });

  it("cross-tenant: otro consultorio NO lo ve ni lo puede leer por id", async () => {
    const food = await asPro(() => svc.create(input("Budín secreto demo")));
    created.push(food.id);
    const hits = await as("orgA", PRO_USER, "professional", () =>
      svc.search({ q: "budin secreto", limit: 5 }),
    );
    expect(hits.some((h) => h.id === food.id)).toBe(false);
    await expect(
      as("orgA", PRO_USER, "professional", () => svc.get("tenant", food.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("editar actualiza los valores; archivar lo saca de la búsqueda", async () => {
    const food = await asPro(() => svc.create(input("Guiso de lentejas casero")));
    created.push(food.id);
    const upd = await asPro(() => svc.update(food.id, { ...input("Guiso de lentejas casero"), energyKcal: 180 }));
    expect(upd.per100g.energyKcal).toBe(180);

    await asPro(() => svc.archive(food.id));
    const hits = await asPro(() => svc.search({ q: "guiso de lentejas casero", limit: 5 }));
    expect(hits.some((h) => h.id === food.id)).toBe(false);
    // Sigue legible por id (un plan viejo puede referenciarlo), marcado como archivado.
    const again = await asPro(() => svc.get("tenant", food.id));
    expect(again.archived).toBe(true);
    // Un archivado no se edita ni se re-archiva.
    await expect(asPro(() => svc.update(food.id, input("x")))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.archive(food.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sin membership activo no se puede crear", async () => {
    await expect(
      as("demo", GHOST_USER, "professional", () => svc.create(input("x"))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("el catálogo global no se edita por la API (un id de catálogo no es un propio)", async () => {
    const [rice] = await asPro(() => svc.search({ q: "arroz blanco", limit: 1 }));
    await expect(asPro(() => svc.update(rice!.id, input("Hackeado")))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("Validación y permisos", () => {
  it("rechaza macros que suman más de 100 g cada 100 g", () => {
    const r = tenantFoodSchema.safeParse({ ...input("x"), proteinG: 60, carbsG: 50 });
    expect(r.success).toBe(false);
  });

  it("profesional y admin leen y gestionan; el paciente no", () => {
    for (const role of ["admin", "professional"] as const) {
      expect(hasCapability(role, "food:read")).toBe(true);
      expect(hasCapability(role, "food:manage")).toBe(true);
    }
    expect(hasCapability("patient", "food:read")).toBe(false);
    expect(hasCapability("patient", "food:manage")).toBe(false);
  });
});

describe("Intercambios (API real)", () => {
  it("el arroz sugiere otros cereales con la cantidad que iguala las kcal", async () => {
    const [rice] = await asPro(() => svc.search({ q: "arroz blanco", limit: 1 }));
    const swaps = await asPro(() => svc.swaps("catalog", rice!.id, 160));
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.every((s) => s.food.group === rice!.group && s.food.id !== rice!.id)).toBe(true);
    const target = (rice!.per100g.energyKcal * 160) / 100;
    for (const s of swaps) {
      expect(Math.abs((s.food.per100g.energyKcal * s.grams) / 100 - target)).toBeLessThan(target * 0.02);
    }
  });

  it("una receta sugiere recetas de la misma categoría", async () => {
    const [guiso] = await asPro(() => svc.search({ q: "guiso de lentejas", limit: 1 }));
    const swaps = await asPro(() => svc.swaps(guiso!.source, guiso!.id, guiso!.portions[0]!.grams));
    expect(swaps.every((s) => s.food.group === guiso!.group && (s.food.source === "library" || s.food.source === "recipe"))).toBe(true);
  });
});
