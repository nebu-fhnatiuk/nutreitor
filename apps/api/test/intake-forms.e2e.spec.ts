import { BadRequestException, ConflictException } from "@nestjs/common";
import { createDb, foodFrequencySurveys, intakeRequests, patients, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole } from "@nutreitor/shared";
import { and, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { IntakeFormsService } from "../src/modules/patients/intake-forms.service.js";
import { PatientNotesService } from "../src/modules/patients/patient-notes.service.js";
import { PatientsService } from "../src/modules/patients/patients.service.js";

/**
 * Formularios previos a la consulta (KAN-60, ADR 0045), contra Postgres real: el
 * pedido sólo a quien tiene cuenta, el deportista completa desde el portal, y la
 * revisión campo por campo deja lo elegido marcado como autorreportado.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // con cuenta (patient@demo.test), asignado al pro
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin cuenta

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let forms: IntakeFormsService;
let patientsSvc: PatientsService;
let original: typeof patients.$inferSelect;

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run({ context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: userId, role } }, fn);
}
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asPatient = <X>(fn: () => Promise<X>) => as(PATIENT_USER, "patient", fn);

const cleanup = async () => {
  await owner.delete(intakeRequests).where(eq(intakeRequests.patientId, D1));
  await owner.delete(foodFrequencySurveys).where(and(eq(foodFrequencySurveys.patientId, D1), eq(foodFrequencySurveys.source, "self_reported")));
};

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  forms = new IntakeFormsService(tenantDb, audit);
  patientsSvc = new PatientsService(tenantDb, audit, new CareAssignmentsService(tenantDb, audit), new PatientNotesService(tenantDb, audit));
  const [row] = await owner.select().from(patients).where(eq(patients.id, D1));
  original = row!;
  await cleanup();
});

afterAll(async () => {
  if (owner) {
    await cleanup();
    await owner
      .update(patients)
      .set({ goal: original.goal, allergies: original.allergies, medicalHistory: original.medicalHistory, sportProfile: original.sportProfile, fieldSources: original.fieldSources })
      .where(eq(patients.id, D1));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("pedido", () => {
  it("sólo a quien tiene cuenta en el portal; el profesional, sólo a sus asignados", async () => {
    await expect(as(ADMIN_USER, "admin", () => forms.request(D2, { kind: "anamnesis" }))).rejects.toThrow(/invitalo/);
    await expect(asPro(() => forms.request(D2, { kind: "anamnesis" }))).rejects.toThrow(/Not Found/);
  });

  it("un pedido abierto por tipo", async () => {
    const r = await asPro(() => forms.request(D1, { kind: "anamnesis", message: "Antes del control del jueves" }));
    expect(r).toMatchObject({ status: "requested", kind: "anamnesis", requestedByName: "Profesional Demo" });
    await expect(asPro(() => forms.request(D1, { kind: "anamnesis" }))).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("anamnesis: completar y revisar campo por campo", () => {
  it("el deportista la ve y la completa una sola vez", async () => {
    const [mine] = await asPatient(() => forms.mine());
    expect(mine).toMatchObject({ kind: "anamnesis", status: "requested", message: "Antes del control del jueves" });
    await expect(asPatient(() => forms.submit(mine!.id, { answers: {} }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(asPatient(() => forms.submit(mine!.id, { answers: { trainingDaysPerWeek: 9 } }))).rejects.toBeInstanceOf(BadRequestException);
    const done = await asPatient(() =>
      forms.submit(mine!.id, {
        answers: {
          goal: "Bajar grasa sin perder potencia",
          allergies: "Lactosa",
          medicalHistory: "Esguince de tobillo 2025",
          sport: "Fútbol",
          position: "Lateral",
          trainingDaysPerWeek: 5,
          sleepHours: 7.5,
          supplements: "",
        },
      }),
    );
    expect(done.status).toBe("submitted");
    await expect(asPatient(() => forms.submit(mine!.id, { answers: { goal: "otra" } }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("pasa sólo lo elegido, marcado como autorreportado; lo demás no se toca", async () => {
    const [req] = await asPro(() => forms.list(D1));
    expect(req!.status).toBe("submitted");
    expect(req!.answers).not.toHaveProperty("supplements"); // vacío: no se guarda
    const reviewed = await asPro(() => forms.review(D1, req!.id, { fields: ["goal", "allergies", "sport", "trainingDaysPerWeek"], accept: false }));
    expect(reviewed).toMatchObject({ status: "reviewed", reviewedByName: "Profesional Demo", applied: { fields: ["goal", "allergies", "sport", "trainingDaysPerWeek"] } });

    const [p] = await owner.select().from(patients).where(eq(patients.id, D1));
    expect(p).toMatchObject({ goal: "Bajar grasa sin perder potencia", allergies: "Lactosa", medicalHistory: original.medicalHistory });
    expect(p!.sportProfile).toMatchObject({ sport: "Fútbol", trainingDaysPerWeek: 5 });
    expect(p!.sportProfile).not.toHaveProperty("position");
    const src = p!.fieldSources as Record<string, { source: string; reviewedBy: string }>;
    expect(src.goal).toMatchObject({ source: "self_reported", reviewedBy: "Profesional Demo" });
    expect(src).not.toHaveProperty("medicalHistory");
    await expect(asPro(() => forms.review(D1, req!.id, { fields: [], accept: false }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("lo que el profesional cambia a mano deja de figurar como autorreportado", async () => {
    // Reenviar el mismo valor no cambia el origen; cambiarlo, sí.
    const detail = await asPro(() => patientsSvc.update(D1, { goal: "Bajar grasa sin perder potencia", allergies: "Lactosa y maní" }));
    expect(detail.fieldSources.goal).toMatchObject({ source: "self_reported" });
    expect(detail.fieldSources).not.toHaveProperty("allergies");
    expect(detail.fieldSources.sport).toMatchObject({ source: "self_reported" });
  });
});

describe("frecuencia de consumo", () => {
  it("al aceptarla queda como encuesta autorreportada", async () => {
    const r = await asPro(() => forms.request(D1, { kind: "food_frequency" }));
    await asPatient(() => forms.submit(r.id, { answers: { fruits: { frequency: "daily1", portions: 2 }, water: { frequency: "daily6plus", portions: 1 } } }));
    const reviewed = await asPro(() => forms.review(D1, r.id, { fields: [], accept: true }));
    const [s] = await owner.select().from(foodFrequencySurveys).where(eq(foodFrequencySurveys.id, reviewed.applied!.surveyId!));
    expect(s).toMatchObject({ source: "self_reported", patientId: D1 });
  });

  it("se puede cancelar un pedido abierto", async () => {
    const r = await asPro(() => forms.request(D1, { kind: "food_frequency" }));
    expect((await asPro(() => forms.cancel(D1, r.id))).status).toBe("cancelled");
    expect((await asPatient(() => forms.mine())).some((x) => x.id === r.id)).toBe(false);
  });
});

describe("aislamiento", () => {
  it("otra organización no ve los pedidos", async () => {
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(intakeRequests).where(eq(intakeRequests.patientId, D1)));
    expect(rows).toHaveLength(0);
  });
});
