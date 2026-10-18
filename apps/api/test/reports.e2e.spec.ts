import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { monthLabel, monthRange, type MembershipRole } from "@nutreitor/shared";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { ReportsService } from "../src/modules/patients/reports.service.js";

/**
 * Reporte mensual (Fase 4.4): números del mes con datos conocidos, borrador →
 * publicado (foto fija), y alcance (equipo con acceso a la ficha; paciente, sólo
 * los publicados de su ficha).
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T = SEED.orgDemo;
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3";
const D1 = "00000000-0000-0000-0000-0000000000d1";
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2";
const MONTH = "2026-08";

let appPool: pg.Pool;
let ownerPool: pg.Pool;
let owner: Database;
let svc: ReportsService;

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run(
    {
      context: { tenantId: T.id, orgId: T.id, region: T.region },
      org: { id: T.id, name: T.name, slug: T.slug, region: T.region },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);
const asPatient = <X>(fn: () => Promise<X>) => as(PATIENT_USER, "patient", fn);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  const app = createDb(APP_URL);
  appPool = app.pool;
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  svc = new ReportsService(new TenantDbService(app.db), new AuditService());

  const { from, to } = monthRange(MONTH);
  const R = sql`${T.id}, ${T.region}::region`;
  await owner.execute(sql`delete from patient_reports where patient_id in (${D1}, ${D2_UNASSIGNED})`);
  await owner.execute(sql`delete from patient_metrics where patient_id = ${D1} and measured_at between ${from} and ${to}`);
  await owner.execute(sql`delete from adherence_meal_logs where patient_id = ${D1} and date between ${from} and ${to}`);
  await owner.execute(sql`delete from adherence_checkins where patient_id = ${D1} and date between ${from} and ${to}`);
  await owner.execute(sql`delete from appointments where patient_id = ${D1} and starts_at between ${from}::date and ${to}::date + 1`);
  // Peso 72 → 70,5; cintura sólo al final.
  await owner.execute(sql`insert into patient_metrics (tenant_id, region, patient_id, recorded_by_membership_id, measured_at, weight_kg, waist_cm) values
    (${R}, ${D1}, ${PRO_MEMBERSHIP}, '2026-08-03', 72, null),
    (${R}, ${D1}, ${PRO_MEMBERSHIP}, '2026-08-28', 70.5, 88)`);
  // Desayuno: cumplí + cumplí; Cena: en parte + no → 63 % general.
  await owner.execute(sql`insert into adherence_meal_logs (tenant_id, region, patient_id, date, meal_name, status) values
    (${R}, ${D1}, '2026-08-10', 'Desayuno', 'done'), (${R}, ${D1}, '2026-08-11', 'Desayuno', 'done'),
    (${R}, ${D1}, '2026-08-10', 'Cena', 'partial'), (${R}, ${D1}, '2026-08-11', 'Cena', 'skipped')`);
  await owner.execute(sql`insert into adherence_checkins (tenant_id, region, patient_id, date, hunger, energy, mood) values
    (${R}, ${D1}, '2026-08-10', 2, 4, 5), (${R}, ${D1}, '2026-08-11', 4, 3, 4)`);
  await owner.execute(sql`insert into appointments (tenant_id, region, patient_id, membership_id, starts_at, ends_at, status) values
    (${R}, ${D1}, ${PRO_MEMBERSHIP}, '2026-08-15T13:00:00Z', '2026-08-15T13:30:00Z', 'completed'),
    (${R}, ${D1}, ${PRO_MEMBERSHIP}, '2026-08-22T13:00:00Z', '2026-08-22T13:30:00Z', 'cancelled')`);
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

let reportId: string;

describe("Reporte mensual — números", () => {
  it("arma el borrador con los datos del mes", async () => {
    const r = await asPro(() => svc.create(D1, MONTH));
    reportId = r.id;
    expect(r).toMatchObject({ month: MONTH, status: "draft", comment: null, publishedAt: null });
    expect(r.data.measurements).toMatchObject({
      count: 2,
      weightKg: { start: 72, end: 70.5, delta: -1.5 },
      waistCm: { start: 88, end: 88, delta: 0 },
      bodyFatPct: { start: null, end: null, delta: null },
    });
    expect(r.data.adherence).toMatchObject({ pct: 63, logs: 4, daysLogged: 2 });
    expect(r.data.adherence.byMeal).toEqual(
      expect.arrayContaining([
        { meal: "Desayuno", pct: 100, logs: 2 },
        { meal: "Cena", pct: 25, logs: 2 },
      ]),
    );
    expect(r.data.checkins).toEqual({ count: 2, hunger: 3, energy: 3.5, mood: 4.5 });
    expect(r.data.appointments).toEqual({ completed: 1, cancelled: 1, booked: 0 });
  });

  it("uno por mes: pedirlo de nuevo devuelve el mismo; un mes futuro no", async () => {
    expect((await asPro(() => svc.create(D1, MONTH))).id).toBe(reportId);
    await expect(asPro(() => svc.create(D1, "2999-01"))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("Reporte mensual — borrador → publicado", () => {
  it("el paciente no ve borradores", async () => {
    expect((await asPatient(() => svc.minePublished())).map((r) => r.id)).not.toContain(reportId);
    await expect(asPatient(() => svc.mine(reportId))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("comentario, actualizar y publicar; publicado queda fijo", async () => {
    await asPro(() => svc.updateComment(D1, reportId, "Muy buen mes: sostené el desayuno."));
    const pub = await asPro(() => svc.publish(D1, reportId));
    expect(pub).toMatchObject({ status: "published", comment: "Muy buen mes: sostené el desayuno." });
    expect(pub.publishedAt).not.toBeNull();

    await expect(asPro(() => svc.updateComment(D1, reportId, "x"))).rejects.toBeInstanceOf(ConflictException);
    await expect(asPro(() => svc.refresh(D1, reportId))).rejects.toBeInstanceOf(ConflictException);

    // Una medición cargada después no cambia lo que ya leyó el paciente.
    await owner.execute(sql`insert into patient_metrics (tenant_id, region, patient_id, recorded_by_membership_id, measured_at, weight_kg)
      values (${T.id}, ${T.region}::region, ${D1}, ${PRO_MEMBERSHIP}, '2026-08-30', 69)`);
    expect((await asPro(() => svc.get(D1, reportId))).data.measurements.weightKg.end).toBe(70.5);
  });

  it("el paciente ve su reporte publicado", async () => {
    const mine = await asPatient(() => svc.mine(reportId));
    expect(mine).toMatchObject({ month: MONTH, status: "published", authorName: "Profesional Demo" });
    expect((await asPatient(() => svc.minePublished())).map((r) => r.id)).toContain(reportId);
  });
});

describe("Reporte mensual — alcance", () => {
  it("un profesional no asignado no lo ve ni arma; la admin sí", async () => {
    await expect(asPro(() => svc.list(D2_UNASSIGNED))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.create(D2_UNASSIGNED, MONTH))).rejects.toBeInstanceOf(NotFoundException);
    const other = await asAdmin(() => svc.create(D2_UNASSIGNED, MONTH));
    await asAdmin(() => svc.publish(D2_UNASSIGNED, other.id));
    // El paciente de d1 no ve el de otro paciente, aunque esté publicado.
    await expect(asPatient(() => svc.mine(other.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("monthLabel", () => {
    expect(monthLabel("2026-08")).toMatch(/agosto.*2026/);
  });
});
