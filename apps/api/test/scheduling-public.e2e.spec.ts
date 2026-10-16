import {
  appointments,
  createDb,
  patients,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg } from "@nutreitor/shared";
import { NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { SchedulingService } from "../src/modules/scheduling/scheduling.service.js";

/**
 * Reserva PÚBLICA (vidriera, sin sesión), contra Postgres real con el rol app. La
 * ruta no tiene JWT: lo único que la acota es la org resuelta por slug + runAs (RLS)
 * y que el perfil esté listado. Cubre: aislamiento entre tenants por slug, perfiles
 * inexistentes y la regla de "el lead se crea SIEMPRE nuevo" (no se puede atar una
 * cita a una ficha existente conociendo su email).
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PRO_PROFILE = "profesional-demo";
const D1 = "00000000-0000-0000-0000-0000000000d1";
const DEMO: AuthOrg = { ...SEED.orgDemo };
const ORG_A: AuthOrg = { ...SEED.orgA };

let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let svc: SchedulingService;
const createdAppointments: string[] = [];
const createdPatients: string[] = [];

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  let appDb: Database;
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  svc = new SchedulingService(new TenantDbService(appDb), new AuditService());

  // Disponibilidad amplia del pro (mismo set que scheduling-authz: idempotente).
  await tenantStorage.run(
    {
      context: { tenantId: DEMO.id, orgId: DEMO.id, region: DEMO.region },
      org: DEMO,
      user: { id: PRO_USER, role: "professional" },
    },
    () =>
      svc.setMyAvailability({
        timezone: "America/Argentina/Buenos_Aires",
        windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          startMinute: 9 * 60,
          endMinute: 18 * 60,
          slotMinutes: 30,
        })),
      }),
  );
});

afterAll(async () => {
  if (ownerDb) {
    if (createdAppointments.length) {
      await ownerDb.delete(appointments).where(inArray(appointments.id, createdAppointments));
    }
    if (createdPatients.length) {
      await ownerDb.delete(patients).where(inArray(patients.id, createdPatients));
    }
  }
  await appPool?.end();
  await ownerPool?.end();
});

/** Reserva un slot libre (reintenta si otro test lo tomó en paralelo). */
async function bookFree(email: string) {
  const slots = await svc.publicSlots(DEMO, PRO_PROFILE);
  for (const s of slots.slice(-20).reverse()) {
    try {
      const before = new Set(
        (await ownerDb.select({ id: patients.id }).from(patients).where(eq(patients.email, email))).map(
          (p) => p.id,
        ),
      );
      const res = await svc.publicBook(DEMO, PRO_PROFILE, {
        startsAt: s.startsAt,
        fullName: "Visitante Test",
        email,
      });
      const after = await ownerDb
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.email, email));
      const lead = after.find((p) => !before.has(p.id));
      if (lead) {
        createdPatients.push(lead.id);
        const appts = await ownerDb
          .select({ id: appointments.id })
          .from(appointments)
          .where(eq(appointments.patientId, lead.id));
        createdAppointments.push(...appts.map((a) => a.id));
      }
      return { res, leadId: lead?.id };
    } catch {
      // slot tomado entre el cálculo y la reserva (otro test) → probar el siguiente
    }
  }
  throw new Error("sin slots libres para el test");
}

describe("Reserva pública — alcance por org y perfil", () => {
  it("los slots del perfil listado se ven bajo SU org", async () => {
    const slots = await svc.publicSlots(DEMO, PRO_PROFILE);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("cross-tenant: el perfil de demo NO existe bajo el slug de otra org → 404", async () => {
    await expect(svc.publicSlots(ORG_A, PRO_PROFILE)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.publicBook(ORG_A, PRO_PROFILE, {
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        fullName: "X",
        email: "x@example.com",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("un perfil inexistente → 404", async () => {
    await expect(svc.publicSlots(DEMO, "no-existe")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("Reserva pública — el lead se crea siempre nuevo", () => {
  it("reservar con el email de un paciente EXISTENTE crea otra ficha y no toca la original", async () => {
    const [d1Before] = await ownerDb.select().from(patients).where(eq(patients.id, D1));
    const email = `lead-${Date.now()}@example.com`;
    // Le ponemos a D1 un email conocido sólo durante el test (vía owner) para simular
    // que el visitante "adivina" el email de una ficha existente.
    await ownerDb.update(patients).set({ email }).where(eq(patients.id, D1));
    const publicApptsOfD1 = () =>
      ownerDb
        .select({ id: appointments.id })
        .from(appointments)
        .where(and(eq(appointments.patientId, D1), eq(appointments.bookedVia, "public")));
    try {
      const before = await publicApptsOfD1();
      const { res, leadId } = await bookFree(email);
      expect(res.professionalName).toBe("Profesional Demo");
      expect(leadId).toBeDefined();
      expect(leadId).not.toBe(D1);
      // La reserva pública no sumó ninguna cita a la ficha existente.
      expect(await publicApptsOfD1()).toHaveLength(before.length);
    } finally {
      await ownerDb.update(patients).set({ email: d1Before!.email }).where(eq(patients.id, D1));
    }
  });

  it("la confirmación pública no expone ids internos ni datos del paciente", async () => {
    const { res } = await bookFree(`lead2-${Date.now()}@example.com`);
    expect(Object.keys(res).sort()).toEqual(["endsAt", "professionalName", "startsAt"]);
  });
});
