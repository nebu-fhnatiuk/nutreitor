import {
  appointments,
  createDb,
  memberships,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { MembershipRole } from "@nutreitor/shared";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { SchedulingService } from "../src/modules/scheduling/scheduling.service.js";

/**
 * Autorización de SERVICIO del agendamiento (scoping assigned-only), contra Postgres
 * real con el rol `nutreitor_app`. Cubre el hueco que se auditó a mano: que el
 * profesional sólo opere sobre pacientes ASIGNADOS y sobre SUS citas; el admin, sobre
 * todo el tenant; y que nada cruce tenants. Ejercita el service real dentro del ALS.
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
const D1_ASSIGNED = "00000000-0000-0000-0000-0000000000d1"; // asignado al pro
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2"; // NO asignado
const A1_OTHER_TENANT = "00000000-0000-0000-0000-0000000000a1"; // paciente de orgA

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let svc: SchedulingService;
let proMembershipId: string;
let adminMembershipId: string;

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

async function membershipOf(userId: string): Promise<string> {
  const [m] = await withTenant(appDb, SEED.orgDemo.id, (tx) =>
    tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId)).limit(1),
  );
  return m!.id;
}

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  svc = new SchedulingService(new TenantDbService(appDb), new AuditService());
  proMembershipId = await membershipOf(PRO_USER);
  adminMembershipId = await membershipOf(ADMIN_USER);

  // Idempotencia: arrancar sin citas de estos memberships (el rol app no tiene DELETE).
  await ownerDb.delete(appointments).where(eq(appointments.membershipId, proMembershipId));
  await ownerDb.delete(appointments).where(eq(appointments.membershipId, adminMembershipId));

  // Disponibilidad amplia del profesional para que haya slots.
  await asPro(() =>
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
  await appPool?.end();
  await ownerPool?.end();
});

/** Primer slot libre de la agenda del profesional. */
async function firstProSlot(): Promise<string> {
  const slots = await asPro(() => svc.mySlots());
  if (slots.length === 0) throw new Error("sin slots para el test");
  return slots[0]!.startsAt;
}

describe("Scheduling — autorización del profesional (assigned-only)", () => {
  it("el profesional puede agendar sobre un paciente ASIGNADO", async () => {
    const startsAt = await firstProSlot();
    const appt = await asPro(() => svc.bookForPatient({ patientId: D1_ASSIGNED, startsAt }));
    expect(appt.status).toBe("booked");
    expect(appt.patientId).toBe(D1_ASSIGNED);
  });

  it("el profesional NO puede agendar sobre un paciente NO asignado → 404", async () => {
    const startsAt = await firstProSlot();
    await expect(
      asPro(() => svc.bookForPatient({ patientId: D2_UNASSIGNED, startsAt })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("cross-tenant: el profesional NO puede agendar sobre un paciente de OTRO tenant → 404", async () => {
    const startsAt = await firstProSlot();
    await expect(
      asPro(() => svc.bookForPatient({ patientId: A1_OTHER_TENANT, startsAt })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("listForProfessional: el profesional ve SOLO sus citas; el admin ve todas las del tenant", async () => {
    // Cita de "otro profesional" (membership del admin, como dueño distinto al pro).
    const otherStart = new Date("2031-07-07T15:00:00.000Z");
    await ownerDb.insert(appointments).values({
      tenantId: SEED.orgDemo.id,
      region: SEED.orgDemo.region,
      patientId: D1_ASSIGNED,
      membershipId: adminMembershipId,
      startsAt: otherStart,
      endsAt: new Date(otherStart.getTime() + 30 * 60_000),
      status: "booked",
      bookedVia: "professional",
      createdByMembershipId: adminMembershipId,
    });
    // El pro reserva una propia.
    const proStart = await firstProSlot();
    await asPro(() => svc.bookForPatient({ patientId: D1_ASSIGNED, startsAt: proStart }));

    const proList = await asPro(() => svc.listForProfessional());
    expect(proList.length).toBeGreaterThan(0);
    expect(proList.every((a) => a.professionalName === "Profesional Demo")).toBe(true);

    const adminList = await asAdmin(() => svc.listForProfessional());
    // El admin ve TODAS: incluye la del "otro profesional" que el pro no ve.
    expect(adminList.length).toBeGreaterThan(proList.length);
  });

  it("cancel/reschedule: el profesional NO puede tocar una cita de OTRO profesional → 404", async () => {
    const start = new Date("2032-08-08T15:00:00.000Z");
    const [other] = await ownerDb
      .insert(appointments)
      .values({
        tenantId: SEED.orgDemo.id,
        region: SEED.orgDemo.region,
        patientId: D1_ASSIGNED,
        membershipId: adminMembershipId, // dueño = otro membership, no el pro
        startsAt: start,
        endsAt: new Date(start.getTime() + 30 * 60_000),
        status: "booked",
        bookedVia: "professional",
        createdByMembershipId: adminMembershipId,
      })
      .returning({ id: appointments.id });

    await expect(asPro(() => svc.cancel(other!.id, "professional"))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      asPro(() => svc.reschedule(other!.id, { startsAt: "2032-08-08T16:00:00.000Z" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("un profesional sin membership activo no puede operar (sin acceso) ", async () => {
    // Usuario sin membership en el tenant → resolvePatientAccess sin membership.
    const ghost = "00000000-0000-0000-0000-0000000000ff";
    await expect(
      as(ghost, "professional", () =>
        svc.bookForPatient({ patientId: D1_ASSIGNED, startsAt: "2033-01-01T13:00:00.000Z" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
