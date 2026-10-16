import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  jsonb,
  timestamp,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

import { tenantColumns, timestamps } from "./_shared.js";
import { memberships } from "./memberships.js";
import { organizations } from "./organizations.js";

/** Medida casera de un alimento: "1 taza" = 160 g. */
export interface FoodPortion {
  label: string;
  grams: number;
}

/**
 * Nutrientes por 100 g de porción comestible. Mismas columnas en el catálogo global
 * y en los alimentos propios del tenant, para que la búsqueda y el cálculo las
 * traten igual. `numeric` viaja como string (drizzle); se convierte en el service.
 */
const nutrientColumns = {
  energyKcal: numeric("energy_kcal", { precision: 7, scale: 2 }).notNull(),
  proteinG: numeric("protein_g", { precision: 6, scale: 2 }).notNull(),
  carbsG: numeric("carbs_g", { precision: 6, scale: 2 }).notNull(),
  fatG: numeric("fat_g", { precision: 6, scale: 2 }).notNull(),
  fiberG: numeric("fiber_g", { precision: 6, scale: 2 }),
  sugarsG: numeric("sugars_g", { precision: 6, scale: 2 }),
  satFatG: numeric("sat_fat_g", { precision: 6, scale: 2 }),
  sodiumMg: numeric("sodium_mg", { precision: 8, scale: 2 }),
  portions: jsonb("portions")
    .$type<FoodPortion[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Micronutrientes opcionales (clave → valor por 100 g). */
  extra: jsonb("extra")
    .$type<Record<string, number>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
};

/**
 * Catálogo de REFERENCIA global (ADR 0018): sin tenant y sin PHI, fuera de RLS a
 * propósito. Valores de USDA FoodData Central (CC0) + curado AR (nombre local,
 * grupo, medidas caseras). El rol app sólo tiene SELECT: se carga por seed.
 */
export const foodCatalog = pgTable(
  "food_catalog",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Clave estable del curado (idempotencia del seed). */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    foodGroup: text("food_group").notNull(),
    /** Procedencia del dato nutricional (atribución): "usda" + fdc_id. */
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    ...nutrientColumns,
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
);

/**
 * Alimentos propios de un consultorio (preparaciones, marcas locales, lo que el
 * catálogo no tenga). Tenant-scoped bajo RLS. Sin DELETE: se archiva, porque un
 * plan viejo puede haberlo usado (los macros del item del plan son una copia).
 */
export const tenantFoods = pgTable(
  "tenant_foods",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumns,
    name: text("name").notNull(),
    foodGroup: text("food_group").notNull(),
    ...nutrientColumns,
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("tenant_foods_tenant_idx").on(table.tenantId),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [organizations.id],
      name: "tenant_foods_tenant_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdByMembershipId],
      foreignColumns: [memberships.id],
      name: "tenant_foods_created_by_membership_id_fk",
    }).onDelete("restrict"),
  ],
);
