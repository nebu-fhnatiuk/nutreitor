import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { foodCatalog, recipeLibrary, tenantFoods, tenantRecipes, type TenantTx } from "@nutreitor/db";
import type {
  FoodDto,
  FoodNutrients,
  FoodSearchQuery,
  FoodSource,
  TenantFoodDto,
} from "@nutreitor/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { resolvePatientAccess } from "../patients/patient-access.js";
import { computeRecipes, type ComputedRecipe } from "./recipe-nutrition.js";

type CatalogRow = typeof foodCatalog.$inferSelect;
type TenantRow = typeof tenantFoods.$inferSelect;

/**
 * Base de alimentos (ADR 0018). La búsqueda une el catálogo global (sin RLS, sólo
 * lectura) con los alimentos propios del consultorio (RLS): ambos se leen en la
 * misma transacción tenant-scoped, así que un alimento propio de otro tenant nunca
 * aparece. Los propios se archivan en vez de borrarse (un plan viejo puede usarlos).
 */
@Injectable()
export class FoodsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Búsqueda sin acentos ni mayúsculas ("limon" encuentra "Limón"). Orden: empieza
   * con lo buscado > lo contiene > parecido (trigramas); a igual puntaje, primero los
   * alimentos propios del consultorio.
   */
  async search({ q, limit }: FoodSearchQuery): Promise<FoodDto[]> {
    const term = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    return this.tenantDb.run(async (tx) => {
      const res = await tx.execute(sql`
        with candidates as (
          select 'catalog' as source, id, name from food_catalog
          union all
          select 'tenant' as source, id, name from tenant_foods where archived_at is null
          union all
          select 'library' as source, id, name from recipe_library
          union all
          select 'recipe' as source, id, name from tenant_recipes where archived_at is null
        ), scored as (
          select source, id, name,
            immutable_unaccent(lower(name)) as norm,
            immutable_unaccent(lower(${q})) as nq
          from candidates
        )
        select source, id from scored
        where norm like '%' || immutable_unaccent(lower(${term})) || '%'
           or similarity(norm, nq) > 0.3
        order by
          (norm like immutable_unaccent(lower(${term})) || '%') desc,
          (norm like '%' || immutable_unaccent(lower(${term})) || '%') desc,
          similarity(norm, nq) desc,
          (source in ('tenant', 'recipe')) desc,
          name
        limit ${limit}`);
      const hits = res.rows as { source: FoodSource; id: string }[];
      return this.load(tx, hits);
    });
  }

  async get(source: FoodSource, id: string): Promise<FoodDto> {
    return this.tenantDb.run(async (tx) => {
      const [food] = await this.load(tx, [{ source, id }]);
      if (!food) throw new NotFoundException();
      return food;
    });
  }

  async create(dto: TenantFoodDto): Promise<FoodDto> {
    return this.tenantDb.run(async (tx) => {
      const membershipId = await this.requireMembership(tx);
      const ctx = getTenantContext();
      const [row] = await tx
        .insert(tenantFoods)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          createdByMembershipId: membershipId,
          ...toColumns(dto),
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "food.created",
        targetType: "food",
        targetId: row!.id,
        metadata: { name: row!.name },
      });
      return fromTenant(row!);
    });
  }

  async update(id: string, dto: TenantFoodDto): Promise<FoodDto> {
    return this.tenantDb.run(async (tx) => {
      await this.requireMembership(tx);
      const [row] = await tx
        .update(tenantFoods)
        .set({ ...toColumns(dto), updatedAt: new Date() })
        .where(and(eq(tenantFoods.id, id), isNull(tenantFoods.archivedAt)))
        .returning();
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "food.updated",
        targetType: "food",
        targetId: id,
      });
      return fromTenant(row);
    });
  }

  async archive(id: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      await this.requireMembership(tx);
      const archived = await tx
        .update(tenantFoods)
        .set({ archivedAt: new Date() })
        .where(and(eq(tenantFoods.id, id), isNull(tenantFoods.archivedAt)))
        .returning({ id: tenantFoods.id });
      if (archived.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "food.archived",
        targetType: "food",
        targetId: id,
      });
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async requireMembership(tx: TenantTx): Promise<string> {
    const { membershipId } = await resolvePatientAccess(tx);
    if (!membershipId) throw new ForbiddenException("No tenés un membership activo.");
    return membershipId;
  }

  /** Trae las filas completas respetando el orden de `hits`. */
  private async load(
    tx: TenantTx,
    hits: { source: FoodSource; id: string }[],
  ): Promise<FoodDto[]> {
    const catalogIds = hits.filter((h) => h.source === "catalog").map((h) => h.id);
    const tenantIds = hits.filter((h) => h.source === "tenant").map((h) => h.id);
    const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
    const [catalogRows, tenantRows] = await Promise.all([
      catalogIds.filter(isUuid).length
        ? tx.select().from(foodCatalog).where(sql`${foodCatalog.id} in ${catalogIds.filter(isUuid)}`)
        : Promise.resolve([] as CatalogRow[]),
      tenantIds.filter(isUuid).length
        ? tx.select().from(tenantFoods).where(sql`${tenantFoods.id} in ${tenantIds.filter(isUuid)}`)
        : Promise.resolve([] as TenantRow[]),
    ]);
    const byKey = new Map<string, FoodDto>();
    for (const r of catalogRows) byKey.set(`catalog:${r.id}`, fromCatalog(r));
    for (const r of tenantRows) byKey.set(`tenant:${r.id}`, fromTenant(r));

    // Recetas (ADR 0019): misma forma que un alimento, nutrientes calculados.
    const libraryIds = hits.filter((h) => h.source === "library" && isUuid(h.id)).map((h) => h.id);
    const recipeIds = hits.filter((h) => h.source === "recipe" && isUuid(h.id)).map((h) => h.id);
    const [libraryRows, recipeRows] = await Promise.all([
      libraryIds.length ? tx.select().from(recipeLibrary).where(inArray(recipeLibrary.id, libraryIds)) : [],
      recipeIds.length ? tx.select().from(tenantRecipes).where(inArray(tenantRecipes.id, recipeIds)) : [],
    ]);
    const recipes = [
      ...libraryRows.map((r) => ({ row: r, source: "library" as const, archived: false })),
      ...recipeRows.map((r) => ({ row: r, source: "recipe" as const, archived: r.archivedAt !== null })),
    ];
    const computed = await computeRecipes(tx, recipes.map((r) => r.row));
    recipes.forEach((r, i) => byKey.set(`${r.source}:${r.row.id}`, recipeToFood(r, computed[i]!)));
    return hits.map((h) => byKey.get(`${h.source}:${h.id}`)).filter((f): f is FoodDto => !!f);
  }
}

const n = (v: string | null): number | null => (v === null ? null : Number(v));
const s = (v: number | null | undefined): string | null => (v == null ? null : String(v));

function nutrients(r: CatalogRow | TenantRow): FoodNutrients {
  return {
    energyKcal: Number(r.energyKcal),
    proteinG: Number(r.proteinG),
    carbsG: Number(r.carbsG),
    fatG: Number(r.fatG),
    fiberG: n(r.fiberG),
    sugarsG: n(r.sugarsG),
    satFatG: n(r.satFatG),
    sodiumMg: n(r.sodiumMg),
  };
}

function fromCatalog(r: CatalogRow): FoodDto {
  return {
    id: r.id,
    slug: r.slug,
    source: "catalog",
    name: r.name,
    group: r.foodGroup,
    per100g: nutrients(r),
    portions: r.portions,
    extra: r.extra,
    attribution: r.source === "usda" ? "USDA FoodData Central" : r.source,
    archived: false,
  };
}

function fromTenant(r: TenantRow): FoodDto {
  return {
    id: r.id,
    source: "tenant",
    name: r.name,
    group: r.foodGroup,
    per100g: nutrients(r),
    portions: r.portions,
    extra: r.extra,
    attribution: null,
    archived: r.archivedAt !== null,
  };
}

function toColumns(dto: TenantFoodDto) {
  return {
    name: dto.name,
    foodGroup: dto.group,
    energyKcal: String(dto.energyKcal),
    proteinG: String(dto.proteinG),
    carbsG: String(dto.carbsG),
    fatG: String(dto.fatG),
    fiberG: s(dto.fiberG),
    sugarsG: s(dto.sugarsG),
    satFatG: s(dto.satFatG),
    sodiumMg: s(dto.sodiumMg),
    portions: dto.portions,
  };
}

/** Una receta servida como alimento: "1 porción" = peso total ÷ porciones. */
export function recipeToFood(
  r: { row: { id: string; name: string; category: string; servings: number }; source: "recipe" | "library"; archived: boolean },
  c: ComputedRecipe,
): FoodDto {
  const portion = c.totalGrams > 0 ? Math.round((c.totalGrams / r.row.servings) * 10) / 10 : 0;
  return {
    id: r.row.id,
    source: r.source,
    name: r.row.name,
    group: r.row.category,
    per100g: c.per100g,
    portions: portion > 0 ? [{ label: "1 porción", grams: portion }] : [],
    extra: {},
    attribution: c.ingredients.some((i) => i.kind === "catalog") ? "USDA FoodData Central" : null,
    archived: r.archived,
    recipe: {
      servings: r.row.servings,
      totalGrams: c.totalGrams,
      missingIngredients: c.missingIngredients,
      ingredients: c.ingredients
        .filter((i) => i.name !== null && c.totalGrams > 0)
        .map((i) => ({
          name: i.name!,
          group: i.group ?? "Otros",
          gramsPer100g: Math.round((i.grams / c.totalGrams) * 100 * 100) / 100,
        })),
    },
  };
}
