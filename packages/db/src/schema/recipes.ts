import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";

/**
 * Ingrediente de una receta (ADR 0019). Del catálogo por `slug` (estable entre
 * bases: los ids del catálogo cambian por entorno) o un alimento propio del
 * consultorio por `id`. Las recetas de la biblioteca global sólo usan el catálogo.
 */
export type RecipeIngredient =
  | { kind: "catalog"; slug: string; grams: number }
  | { kind: "tenant"; id: string; grams: number };

const recipeColumns = {
  name: text("name").notNull(),
  category: text("category").notNull(),
  /** Porciones que rinde la receta. */
  servings: integer("servings").notNull(),
  ingredients: jsonb("ingredients").$type<RecipeIngredient[]>().notNull(),
  steps: text("steps"),
};

/**
 * Recetario de REFERENCIA global: sin tenant ni PHI, fuera de RLS a propósito, el
 * rol app sólo lee. Se carga por migración generada. Los nutrientes no se guardan:
 * se calculan desde los ingredientes al servir.
 */
export const recipeLibrary = pgTable("recipe_library", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  ...recipeColumns,
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/** Recetas propias del consultorio, bajo RLS. Sin DELETE: se archivan. */
export const tenantRecipes = pgTable(
  "tenant_recipes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    ...recipeColumns,
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("tenant_recipes_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "tenant_recipes_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdByMembershipId],
      foreignColumns: [memberships.id],
      name: "tenant_recipes_created_by_membership_id_fk",
    }).onDelete("restrict"),
  ],
);
