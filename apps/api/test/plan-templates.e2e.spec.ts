import { createDb, planTemplates, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { hasCapability, savePlanTemplateSchema } from "@nutreitor/shared";
import { NotFoundException } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { PlanTemplatesService } from "../src/modules/patients/plan-templates.service.js";

/** Plantillas de planes (Fase 4.2) contra Postgres real con el rol app. */
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let svc: PlanTemplatesService;
const created: string[] = [];

function as<T>(tenant: "demo" | "orgA", fn: () => Promise<T>) {
  const org = tenant === "demo" ? SEED.orgDemo : SEED.orgA;
  return tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org: { id: org.id, name: org.name, slug: org.slug, region: org.region, status: org.status, kind: org.kind },
      user: { id: PRO_USER, role: "professional" },
    },
    fn,
  );
}

const body = {
  layout: "day",
  day: { meals: [{ name: "Desayuno", items: [{ text: "Avena", qty: 40, unit: "g", macros: { kcal: 150 } }] }] },
  targets: { kcal: 1800 },
};

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_OWNER_URL!);
  await runSeed(process.env.DATABASE_OWNER_URL!);
  let appDb: Database;
  ({ db: appDb, pool: appPool } = createDb(process.env.DATABASE_URL!));
  ({ db: ownerDb, pool: ownerPool } = createDb(process.env.DATABASE_OWNER_URL!));
  svc = new PlanTemplatesService(new TenantDbService(appDb), new AuditService());
});

afterAll(async () => {
  if (ownerDb && created.length) await ownerDb.delete(planTemplates).where(inArray(planTemplates.id, created));
  await appPool?.end();
  await ownerPool?.end();
});

describe("Plantillas de planes", () => {
  it("se guarda una plantilla con el cuerpo del plan y aparece en la lista", async () => {
    const t = await as("demo", () => svc.create(savePlanTemplateSchema.parse({ name: "Plan base 1800", body })));
    created.push(t.id);
    expect(t).toMatchObject({ name: "Plan base 1800", authorName: "Profesional Demo" });
    expect(t.body.layout).toBe("day");
    const list = await as("demo", () => svc.list());
    expect(list.map((x) => x.id)).toContain(t.id);
  });

  it("acepta un cuerpo legacy (sin layout) y lo normaliza", () => {
    const parsed = savePlanTemplateSchema.parse({ name: "Legacy", body: { meals: [] } });
    expect(parsed.body.layout).toBe("day");
  });

  it("cross-tenant: otro consultorio no la ve ni la puede archivar", async () => {
    const t = await as("demo", () => svc.create(savePlanTemplateSchema.parse({ name: "Plantilla demo", body })));
    created.push(t.id);
    const other = await as("orgA", () => svc.list());
    expect(other.some((x) => x.id === t.id)).toBe(false);
    await expect(as("orgA", () => svc.archive(t.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("archivar la saca de la lista; re-archivar → 404", async () => {
    const t = await as("demo", () => svc.create(savePlanTemplateSchema.parse({ name: "Para archivar", body })));
    created.push(t.id);
    await as("demo", () => svc.archive(t.id));
    expect((await as("demo", () => svc.list())).some((x) => x.id === t.id)).toBe(false);
    await expect(as("demo", () => svc.archive(t.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("el paciente no lee ni escribe plantillas (capacidades)", () => {
    expect(hasCapability("patient", "plan:read")).toBe(false);
    expect(hasCapability("patient", "plan:write")).toBe(false);
  });
});
