import {
  createDb,
  mealPlans,
  memberships,
  patientMetrics,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { MembershipRole } from "@nutreitor/shared";
import { NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { MealPlansService } from "../src/modules/patients/meal-plans.service.js";
import { MetricsService } from "../src/modules/patients/metrics.service.js";

/**
 * Autorización de SERVICIO de planes y métricas (no sólo a nivel tabla): el scoping
 * assigned-only de `resolvePatientAccess`/`assertCanAccessPatient`. Profesional sólo
 * sobre pacientes ASIGNADOS; admin sin restricción; otro tenant inaccesible.
 *
 * Nota: para el no-asignado el service tira 404 (no Forbidden) a propósito — no revela
 * la existencia del paciente a quien no lo atiende (mismo criterio que el resto).
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const D1_ASSIGNED = "00000000-0000-0000-0000-0000000000d1";
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2";
const A1_OTHER_TENANT = "00000000-0000-0000-0000-0000000000a1";

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let plans: MealPlansService;
let metrics: MetricsService;

function as<T>(userId: string, role: MembershipRole, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(
    {
      context: { tenantId: SEED.orgDemo.id, orgId: SEED.orgDemo.id, region: SEED.orgDemo.region },
      org: { id: SEED.orgDemo.id, name: SEED.orgDemo.name, slug: SEED.orgDemo.slug, region: SEED.orgDemo.region },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as(PRO_USER, "professional", fn);
const asAdmin = <T>(fn: () => Promise<T>) => as(ADMIN_USER, "admin", fn);

const dayBody = { layout: "day" as const, day: { meals: [] } };
const planDto = (title: string) => ({ title, body: dayBody });
const metricDto = () => ({ measuredAt: "2026-06-06", weightKg: 70 });

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  plans = new MealPlansService(tenantDb, new AuditService());
  metrics = new MetricsService(tenantDb, new AuditService());
  // Sanity: d2 NO debe tener asignación activa (premisa de los tests).
  const assigned = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
    tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, PRO_USER)).limit(1),
  );
  if (assigned.length !== 1) throw new Error("seed inesperado: falta el membership del pro");
});

afterAll(async () => {
  // Limpieza: este test crea un plan y una métrica para D2 (caso "admin sin
  // restricción"). Las borramos vía owner (el rol app no tiene DELETE de planes) para
  // no contaminar a otros e2e que asumen que D2 no tiene datos clínicos.
  if (ownerDb) {
    await ownerDb.delete(patientMetrics).where(eq(patientMetrics.patientId, D2_UNASSIGNED));
    await ownerDb.delete(mealPlans).where(eq(mealPlans.patientId, D2_UNASSIGNED));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("Planes — autorización de servicio (assigned-only)", () => {
  it("el profesional guarda un plan sobre un paciente ASIGNADO", async () => {
    const plan = await asPro(() => plans.save(D1_ASSIGNED, planDto("Plan pro asignado")));
    expect(plan.status).toBe("active");
    expect(plan.title).toBe("Plan pro asignado");
  });

  it("el profesional NO puede guardar un plan sobre un paciente NO asignado → 404", async () => {
    await expect(asPro(() => plans.save(D2_UNASSIGNED, planDto("x")))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("el admin guarda un plan sobre cualquier paciente del tenant (sin restricción)", async () => {
    const plan = await asAdmin(() => plans.save(D2_UNASSIGNED, planDto("Plan admin libre")));
    expect(plan.status).toBe("active");
  });

  it("cross-tenant: el profesional NO accede a un paciente de otro tenant → 404", async () => {
    await expect(asPro(() => plans.save(A1_OTHER_TENANT, planDto("x")))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(asPro(() => plans.list(A1_OTHER_TENANT))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("Métricas — autorización de servicio (assigned-only)", () => {
  it("el profesional registra una métrica sobre un paciente ASIGNADO", async () => {
    const m = await asPro(() => metrics.record(D1_ASSIGNED, metricDto()));
    expect(m.weightKg).toBe(70);
  });

  it("el profesional NO puede registrar sobre un paciente NO asignado → 404", async () => {
    await expect(asPro(() => metrics.record(D2_UNASSIGNED, metricDto()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("el admin registra sobre cualquier paciente del tenant", async () => {
    const m = await asAdmin(() => metrics.record(D2_UNASSIGNED, metricDto()));
    expect(m.weightKg).toBe(70);
  });

  it("cross-tenant: el profesional NO registra sobre un paciente de otro tenant → 404", async () => {
    await expect(asPro(() => metrics.record(A1_OTHER_TENANT, metricDto()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3"; // patient@demo → ficha d1
const asPatient = <T>(fn: () => Promise<T>) => as(PATIENT_USER, "patient", fn);

describe("Métricas — editar/borrar y acceso por id (IDOR)", () => {
  it("el profesional NO puede editar ni borrar una métrica de un paciente NO asignado → 404", async () => {
    const m = await asAdmin(() => metrics.record(D2_UNASSIGNED, metricDto()));
    await expect(
      asPro(() => metrics.update(D2_UNASSIGNED, m.id, { weightKg: 1 })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => metrics.remove(D2_UNASSIGNED, m.id))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [after] = await ownerDb.select().from(patientMetrics).where(eq(patientMetrics.id, m.id));
    expect(Number(after!.weightKg)).toBe(70);
  });

  it("IDOR: una métrica de OTRO paciente no se toca por la ruta de uno asignado → 404", async () => {
    // El pro tiene acceso a D1; el metricId es de D2. El chequeo de acceso pasa (D1),
    // así que lo que frena es que la métrica tiene que pertenecer al paciente de la ruta.
    const ajena = await asAdmin(() => metrics.record(D2_UNASSIGNED, metricDto()));
    await expect(
      asPro(() => metrics.update(D1_ASSIGNED, ajena.id, { weightKg: 1 })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => metrics.remove(D1_ASSIGNED, ajena.id))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [after] = await ownerDb
      .select()
      .from(patientMetrics)
      .where(eq(patientMetrics.id, ajena.id));
    expect(after).toBeDefined();
    expect(Number(after!.weightKg)).toBe(70);
  });

  it("el profesional SÍ edita y borra una métrica propia de un paciente asignado", async () => {
    const m = await asPro(() => metrics.record(D1_ASSIGNED, metricDto()));
    const upd = await asPro(() => metrics.update(D1_ASSIGNED, m.id, { weightKg: 71.5 }));
    expect(upd.weightKg).toBe(71.5);
    await asPro(() => metrics.remove(D1_ASSIGNED, m.id));
    const rows = await ownerDb.select().from(patientMetrics).where(eq(patientMetrics.id, m.id));
    expect(rows).toHaveLength(0);
  });
});

describe("Planes — listar y archivar (assigned-only)", () => {
  it("el profesional NO lista ni archiva planes de un paciente NO asignado → 404", async () => {
    await asAdmin(() => plans.save(D2_UNASSIGNED, planDto("Plan admin D2")));
    await expect(asPro(() => plans.list(D2_UNASSIGNED))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => plans.archiveActive(D2_UNASSIGNED))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const active = await ownerDb
      .select({ status: mealPlans.status })
      .from(mealPlans)
      .where(eq(mealPlans.patientId, D2_UNASSIGNED));
    expect(active.some((p) => p.status === "active")).toBe(true);
  });

  it("el profesional SÍ lista los planes de un paciente asignado", async () => {
    const list = await asPro(() => plans.list(D1_ASSIGNED));
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("Defensa en profundidad: el rol paciente en los services clínicos", () => {
  // El CapabilityGuard ya frena al paciente en el controller (no tiene plan:* ni
  // metric:*). Esto verifica la segunda capa: aun saltándose el guard, el service
  // no le abre la ficha (no tiene asignaciones como profesional) — ni la PROPIA.
  it("un paciente NO lista planes ni métricas por los endpoints del profesional → 404", async () => {
    await expect(asPatient(() => plans.list(D1_ASSIGNED))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(asPatient(() => metrics.list(D1_ASSIGNED))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(asPatient(() => metrics.record(D1_ASSIGNED, metricDto()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
