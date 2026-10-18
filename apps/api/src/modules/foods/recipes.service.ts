import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { recipeLibrary, tenantFoods, tenantRecipes, type RecipeIngredient, type TenantTx } from "@nutreitor/db";
import type { RecipeDto, TenantRecipeDto } from "@nutreitor/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { resolvePatientAccess } from "../patients/patient-access.js";
import { computeRecipes } from "./recipe-nutrition.js";

type LibraryRow = typeof recipeLibrary.$inferSelect;
type TenantRow = typeof tenantRecipes.$inferSelect;

/**
 * Recetas (ADR 0019): la biblioteca global (sólo lectura) + las del consultorio
 * (RLS, sin DELETE: se archivan). Los nutrientes se calculan al servir. Una receta
 * de la biblioteca se puede copiar al consultorio para adaptarla.
 */
@Injectable()
export class RecipesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Biblioteca + propias activas, por nombre. */
  async list(): Promise<RecipeDto[]> {
    return this.tenantDb.run(async (tx) => {
      const [library, own] = await Promise.all([
        tx.select().from(recipeLibrary).orderBy(asc(recipeLibrary.name)),
        tx.select().from(tenantRecipes).where(isNull(tenantRecipes.archivedAt)).orderBy(asc(tenantRecipes.name)),
      ]);
      return this.toDtos(tx, [
        ...own.map((row) => ({ row, source: "recipe" as const })),
        ...library.map((row) => ({ row, source: "library" as const })),
      ]);
    });
  }

  async get(source: "recipe" | "library", id: string): Promise<RecipeDto> {
    return this.tenantDb.run(async (tx) => {
      if (source === "library") {
        const [row] = await tx.select().from(recipeLibrary).where(eq(recipeLibrary.id, id)).limit(1);
        if (!row) throw new NotFoundException();
        return (await this.toDtos(tx, [{ row, source }]))[0]!;
      }
      const [row] = await tx.select().from(tenantRecipes).where(eq(tenantRecipes.id, id)).limit(1);
      if (!row) throw new NotFoundException();
      return (await this.toDtos(tx, [{ row, source }]))[0]!;
    });
  }

  async create(dto: TenantRecipeDto): Promise<RecipeDto> {
    return this.tenantDb.run(async (tx) => {
      const membershipId = await this.requireMembership(tx);
      await this.assertOwnIngredients(tx, dto.ingredients);
      const ctx = getTenantContext();
      const [row] = await tx
        .insert(tenantRecipes)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          createdByMembershipId: membershipId,
          name: dto.name,
          category: dto.category,
          servings: dto.servings,
          ingredients: dto.ingredients,
          steps: dto.steps ?? null,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "recipe.created",
        targetType: "recipe",
        targetId: row!.id,
        metadata: { name: row!.name },
      });
      const [out] = await this.toDtos(tx, [{ row: row!, source: "recipe" }]);
      return out!;
    });
  }

  async update(id: string, dto: TenantRecipeDto): Promise<RecipeDto> {
    return this.tenantDb.run(async (tx) => {
      await this.requireMembership(tx);
      await this.assertOwnIngredients(tx, dto.ingredients);
      const [row] = await tx
        .update(tenantRecipes)
        .set({
          name: dto.name,
          category: dto.category,
          servings: dto.servings,
          ingredients: dto.ingredients,
          steps: dto.steps ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(tenantRecipes.id, id), isNull(tenantRecipes.archivedAt)))
        .returning();
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "recipe.updated", targetType: "recipe", targetId: id });
      const [out] = await this.toDtos(tx, [{ row, source: "recipe" }]);
      return out!;
    });
  }

  async archive(id: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      await this.requireMembership(tx);
      const done = await tx
        .update(tenantRecipes)
        .set({ archivedAt: new Date() })
        .where(and(eq(tenantRecipes.id, id), isNull(tenantRecipes.archivedAt)))
        .returning({ id: tenantRecipes.id });
      if (done.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "recipe.archived", targetType: "recipe", targetId: id });
    });
  }

  /** Copia una receta de la biblioteca a las del consultorio (para adaptarla). */
  async copyFromLibrary(libraryId: string): Promise<RecipeDto> {
    const original = await this.tenantDb.run(async (tx) => {
      const [row] = await tx.select().from(recipeLibrary).where(eq(recipeLibrary.id, libraryId)).limit(1);
      return row;
    });
    if (!original) throw new NotFoundException();
    return this.create({
      name: original.name,
      category: original.category,
      servings: original.servings,
      ingredients: original.ingredients,
      steps: original.steps,
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async requireMembership(tx: TenantTx): Promise<string> {
    const { membershipId } = await resolvePatientAccess(tx);
    if (!membershipId) throw new ForbiddenException("No tenés un membership activo.");
    return membershipId;
  }

  /**
   * Un ingrediente propio tiene que ser un alimento ACTIVO de este consultorio. RLS
   * ya oculta los de otro tenant; esto además da un 400 claro en vez de guardar una
   * referencia rota.
   */
  private async assertOwnIngredients(tx: TenantTx, ingredients: RecipeIngredient[]): Promise<void> {
    const ids = [...new Set(ingredients.filter((i) => i.kind === "tenant").map((i) => i.id))];
    if (!ids.length) return;
    const found = await tx
      .select({ id: tenantFoods.id })
      .from(tenantFoods)
      .where(and(inArray(tenantFoods.id, ids), isNull(tenantFoods.archivedAt)));
    if (found.length !== ids.length) {
      throw new BadRequestException("Algún ingrediente propio no existe o está archivado.");
    }
  }

  private async toDtos(
    tx: TenantTx,
    items: ({ row: LibraryRow; source: "library" } | { row: TenantRow; source: "recipe" })[],
  ): Promise<RecipeDto[]> {
    const computed = await computeRecipes(
      tx,
      items.map((i) => i.row),
    );
    return items.map((i, idx) => {
      const c = computed[idx]!;
      return {
        id: i.row.id,
        source: i.source,
        name: i.row.name,
        category: i.row.category,
        servings: i.row.servings,
        steps: i.row.steps,
        ingredients: c.ingredients,
        totalGrams: c.totalGrams,
        total: c.total,
        per100g: c.per100g,
        perServing: c.perServing,
        missingIngredients: c.missingIngredients,
        archived: i.source === "recipe" ? (i.row as TenantRow).archivedAt !== null : false,
      };
    });
  }
}
