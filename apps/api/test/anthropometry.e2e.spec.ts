import { NotFoundException } from "@nestjs/common";
import { anthropometrySessions, createDb, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole, SaveAnthropometryDto } from "@nutreitor/shared";
import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AnthropometryService } from "../src/modules/patients/anthropometry.service.js";

/**
 * Antropometría ISAK (ADR 0030) contra Postgres real con el rol app: el scoping es el
 * de las mediciones (profesional → asignados), los resultados salen del sexo y la edad
 * de la ficha a la fecha de la medición, y el portal ve sólo lo marcado visible.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo; mujer, 1990-05-12
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin asignar

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let svc: AnthropometryService;

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>, org: AuthOrg = T): Promise<X> {
  return tenantStorage.run(
    { context: { tenantId: org.id, orgId: org.id, region: org.region }, org, user: { id: userId, role } },
    fn,
  );
}
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);

const SESSION: SaveAnthropometryDto = {
  measuredAt: "2026-10-01",
  takes: {
    bodyMass: [56.8],
    stature: [164.0, 164.2],
    triceps: [12.0, 12.2],
    subscapular: [9.5, 9.5],
    biceps: [6.0, 6.1],
    iliacCrest: [13.0, 13.0],
    supraspinale: [8.5, 8.6],
    abdominal: [14.0, 14.2],
    frontThigh: [18.0, 18.4],
    medialCalf: [10.0, 10.0],
    armFlexed: [27.5, 27.5],
    calf: [34.5, 34.5],
    humerus: [6.0, 6.0],
    femur: [8.7, 8.7],
  },
  note: "Pretemporada",
};

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  await owner.delete(anthropometrySessions).where(eq(anthropometrySessions.patientId, D1));
  svc = new AnthropometryService(new TenantDbService(appDb), new AuditService());
});

afterAll(async () => {
  await owner?.delete(anthropometrySessions).where(eq(anthropometrySessions.patientId, D1));
  await appPool?.end();
  await ownerPool?.end();
});

describe("sesiones", () => {
  let id: string;

  it("el profesional asignado carga una sesión y recibe los resultados calculados", async () => {
    const s = await asPro(() => svc.create(D1, SESSION));
    id = s.id;
    expect(s.validated).toBe(true);
    expect(s.kerrBlock).toBe(false);
    // Media de dos tomas: 12,1 + 9,5 + 8,55 + 14,1 + 18,2 + 10,0 = 72,45 → 72,5.
    expect(s.results.sum6).toEqual({ ok: true, value: 72.5 });
    // Ficha: mujer nacida en 1990 → 36 años en la fecha → Durnin-Womersley aplica.
    expect(s.results.fat.durninWomersley.ok).toBe(true);
    expect(s.results.fat.yuhasz.ok).toBe(true);
    expect(s.results.somatotype.ok).toBe(true);
    expect(s.results.kerr).toMatchObject({ ok: false });

    const list = await asPro(() => svc.list(D1));
    expect(list[0]).toMatchObject({ id, measuredByName: "Profesional Demo", note: "Pretemporada" });
  });

  it("editar recalcula; borrar la saca", async () => {
    const edited = await asPro(() =>
      svc.update(D1, id, { ...SESSION, takes: { ...SESSION.takes, triceps: [14.0, 14.0] } }),
    );
    // Tríceps 14,0 en lugar de 12,1: 74,35 → 74,4.
    expect(edited.results.sum6).toEqual({ ok: true, value: 74.4 });
    await asAdmin(() => svc.remove(D1, id));
    expect(await asPro(() => svc.list(D1))).toHaveLength(0);
  });

  it("scoping: el profesional no ve a un paciente que no tiene asignado", async () => {
    await expect(asPro(() => svc.list(D2))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.create(D2, SESSION))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("RLS: otro tenant no ve las sesiones", async () => {
    await asPro(() => svc.create(D1, SESSION));
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) =>
      tx.select().from(anthropometrySessions).where(eq(anthropometrySessions.patientId, D1)),
    );
    expect(leaked).toHaveLength(0);
  });
});

describe("portal", () => {
  it("devuelve sólo lo que el profesional marcó visible", async () => {
    await owner.execute(sql`update patients set clinical_visibility = clinical_visibility || '{"anthroSkinfolds": true}'::jsonb where id = ${D1}`);
    const r = await withTenant(appDb, T.id, (tx) => svc.forPortal(tx, D1, { anthroSkinfolds: true }));
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.sum6).not.toBeNull();
    expect(r[0]).toMatchObject({ fatPct: null, kerr: null, somatotype: null });
    expect(await withTenant(appDb, T.id, (tx) => svc.forPortal(tx, D1, {}))).toEqual([]);
    await owner.execute(sql`update patients set clinical_visibility = clinical_visibility - 'anthroSkinfolds' where id = ${D1}`);
  });
});

