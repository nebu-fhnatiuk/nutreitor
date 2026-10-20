import { NotFoundException } from "@nestjs/common";
import { anthropometrySessions, createDb, energyRequirements, patientMetrics, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole, SaveEnergyDto } from "@nutreitor/shared";
import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { EnergyService } from "../src/modules/patients/energy.service.js";

/**
 * Requerimiento energético (ADR 0032) contra Postgres real con el rol app: scoping
 * del plan, versiones append-only, contexto precargado desde la antropometría y la
 * evolución, y RLS.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo; mujer, 1990-05-12
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin asignar

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let svc: EnergyService;

const asPro = <X>(fn: () => Promise<X>) =>
  tenantStorage.run(
    { context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: PRO_USER, role: "professional" as MembershipRole } },
    fn,
  );

const DTO: SaveEnergyDto = {
  formula: "mifflin",
  activityFactor: 1.4,
  adjustmentPct: 0,
  weightKg: 56.8,
  heightCm: 164,
  ffmKg: null,
  dayTypes: [{ id: "t", name: "Entrenamiento", choGPerKg: 6, proGPerKg: 1.6, sessions: [{ activity: "running_10", minutes: 60 }] }],
  week: {},
  note: "Pretemporada",
};

async function cleanup() {
  await owner.delete(energyRequirements).where(eq(energyRequirements.patientId, D1));
  await owner.delete(anthropometrySessions).where(eq(anthropometrySessions.patientId, D1));
  // Sólo la medición de prueba (fecha futura para ganarle a las del seed).
  await owner.delete(patientMetrics).where(eq(patientMetrics.measuredAt, "2099-10-10"));
}

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  await cleanup();
  svc = new EnergyService(new TenantDbService(appDb), new AuditService());
});

afterAll(async () => {
  await cleanup();
  await appPool?.end();
  await ownerPool?.end();
});

describe("requerimiento", () => {
  it("guarda versiones (la última primero) y calcula al leer con sexo y edad de la ficha", async () => {
    const a = await asPro(() => svc.create(D1, DTO));
    expect(a.sex).toBe("female");
    expect(a.results.ree.ok).toBe(true);
    await asPro(() => svc.create(D1, { ...DTO, adjustmentPct: -10 }));
    const list = await asPro(() => svc.list(D1));
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ adjustmentPct: -10, createdByName: "Profesional Demo" });
    expect(list[1]).toMatchObject({ id: a.id, note: "Pretemporada" });
  });

  it("append-only: el rol app no puede editar ni borrar", async () => {
    await expect(
      withTenant(appDb, T.id, (tx) => tx.execute(sql`update energy_requirements set note = 'x' where patient_id = ${D1}`)),
    ).rejects.toThrow();
    await expect(
      withTenant(appDb, T.id, (tx) => tx.execute(sql`delete from energy_requirements where patient_id = ${D1}`)),
    ).rejects.toThrow();
  });

  it("scoping y RLS", async () => {
    await expect(asPro(() => svc.list(D2))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.create(D2, DTO))).rejects.toBeInstanceOf(NotFoundException);
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(energyRequirements).where(eq(energyRequirements.patientId, D1)));
    expect(leaked).toHaveLength(0);
  });
});

describe("contexto para precargar", () => {
  it("peso de la medición más reciente; talla y MLG de la antropometría", async () => {
    const membership = await owner.execute(sql`select id from memberships where user_id = ${PRO_USER} limit 1`);
    const membershipId = (membership.rows[0] as { id: string }).id;
    await owner.insert(anthropometrySessions).values({
      tenantId: T.id,
      region: T.region,
      patientId: D1,
      measuredByMembershipId: membershipId,
      measuredAt: "2026-09-01",
      takes: { bodyMass: [56.8], stature: [164.0], triceps: [12], subscapular: [9.5], biceps: [6], iliacCrest: [13] },
    });
    let ctx = await asPro(() => svc.context(D1));
    expect(ctx).toMatchObject({
      sex: "female",
      weightKg: { value: 56.8, source: "anthropometry", date: "2026-09-01" },
      heightCm: { value: 164, source: "anthropometry" },
      ffmKg: { source: "anthropometry" },
    });
    expect(ctx.ffmKg!.value).toBeGreaterThan(38);
    expect(ctx.ffmKg!.value).toBeLessThan(46);

    // Un peso más nuevo en la evolución gana.
    await owner.insert(patientMetrics).values({ tenantId: T.id, region: T.region, patientId: D1, recordedByMembershipId: membershipId, measuredAt: "2099-10-10", weightKg: "57.4" });
    ctx = await asPro(() => svc.context(D1));
    expect(ctx.weightKg).toEqual({ value: 57.4, source: "metric", date: "2099-10-10" });
  });
});
