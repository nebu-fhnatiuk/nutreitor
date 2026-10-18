import {
  appointments,
  createDb,
  memberships,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AppointmentDto, MembershipRole, SlotDto } from "@nutreitor/shared";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { SchedulingService } from "../src/modules/scheduling/scheduling.service.js";

/**
 * Reprogramación del PACIENTE desde el portal (rescheduleAsPatient). Verifica el
 * scoping por la rama paciente (sólo citas propias) y que el nuevo slot sea siempre
 * del profesional asignado de la cita. Se ejercita el service real dentro del ALS.
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const PRO_USER = "00000000-0000-0000-0000-0000000000f2"; // pro@demo (asignado a d1)
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3"; // patient@demo → d1
const PACIENTE_DOS = "00000000-0000-0000-0000-0000000000d2"; // otra ficha del tenant

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let svc: SchedulingService;
let proMembershipId: string;

/** Corre `fn` con el contexto de sesión (ALS) de un usuario del tenant demo. */
function as<T>(userId: string, role: MembershipRole, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(
    {
      context: { tenantId: SEED.orgDemo.id, orgId: SEED.orgDemo.id, region: SEED.orgDemo.region },
      org: { id: SEED.orgDemo.id, name: SEED.orgDemo.name, slug: SEED.orgDemo.slug, region: SEED.orgDemo.region, status: SEED.orgDemo.status, kind: SEED.orgDemo.kind },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as(PRO_USER, "professional", fn);
const asPatient = <T>(fn: () => Promise<T>) => as(PATIENT_USER, "patient", fn);

/** Reserva una cita nueva como paciente y la devuelve (cada llamada toma otro slot). */
async function bookFresh(): Promise<AppointmentDto> {
  return asPatient(async () => {
    const slots = await svc.slotsForMyPatient();
    if (slots.length === 0) throw new Error("sin slots para el test");
    return svc.bookAsPatient({ startsAt: slots[0]!.startsAt });
  });
}

/** Primer slot libre distinto de `exceptISO`. */
async function freeSlotExcept(exceptISO: string): Promise<SlotDto> {
  return asPatient(async () => {
    const slots = await svc.slotsForMyPatient();
    const s = slots.find((x) => x.startsAt !== exceptISO);
    if (!s) throw new Error("sin slot alternativo para el test");
    return s;
  });
}

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  svc = new SchedulingService(new TenantDbService(appDb), new AuditService());

  proMembershipId = await withTenant(appDb, SEED.orgDemo.id, async (tx) => {
    const [m] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, PRO_USER))
      .limit(1);
    return m!.id;
  });

  // Idempotencia: el seed no limpia `appointments` y el rol app no tiene DELETE.
  // Borramos las citas de este profesional vía owner para arrancar de cero (las horas
  // fijas que inserta el test, si no, chocarían con el EXCLUDE de una corrida previa).
  await ownerDb.delete(appointments).where(eq(appointments.membershipId, proMembershipId));

  // Disponibilidad amplia del profesional (todos los días 09–18, slots de 30').
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

describe("Portal: reprogramación del paciente", () => {
  it("reprograma una cita propia a un slot libre de su profesional", async () => {
    const appt = await bookFresh();
    const target = await freeSlotExcept(appt.startsAt);

    const res = await asPatient(() =>
      svc.rescheduleAsPatient(appt.id, { startsAt: target.startsAt }),
    );

    expect(res.status).toBe("booked");
    expect(res.startsAt).toBe(target.startsAt);
    expect(res.id).not.toBe(appt.id); // nueva cita; la anterior queda cancelada
    expect(res.professionalName).toBe("Profesional Demo"); // mismo profesional

    // La cita original quedó cancelada (reschedule = cancelar + reservar).
    const original = await withTenant(appDb, SEED.orgDemo.id, async (tx) => {
      const [r] = await tx.select().from(appointments).where(eq(appointments.id, appt.id));
      return r;
    });
    expect(original!.status).toBe("cancelled");
  });

  it("NO puede reprogramar una cita ajena → 404", async () => {
    // Cita de OTRA ficha (d2) con el mismo profesional, insertada directo.
    const otherId = await withTenant(appDb, SEED.orgDemo.id, async (tx) => {
      const [r] = await tx
        .insert(appointments)
        .values({
          tenantId: SEED.orgDemo.id,
          region: SEED.orgDemo.region,
          patientId: PACIENTE_DOS,
          membershipId: proMembershipId,
          startsAt: new Date("2031-03-03T16:00:00.000Z"),
          endsAt: new Date("2031-03-03T16:30:00.000Z"),
          status: "booked",
          bookedVia: "professional",
          createdByMembershipId: proMembershipId,
        })
        .returning({ id: appointments.id });
      return r!.id;
    });

    await expect(
      asPatient(() => svc.rescheduleAsPatient(otherId, { startsAt: "2031-03-03T17:00:00.000Z" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("NO puede reprogramar a un horario que el profesional no ofrece → BadRequest", async () => {
    const appt = await bookFresh();
    // Un minuto corrido: no cae en ningún borde de slot → horario inexistente.
    const notASlot = new Date(new Date(appt.startsAt).getTime() + 60_000).toISOString();

    const promise = asPatient(() =>
      svc.rescheduleAsPatient(appt.id, { startsAt: notASlot }),
    );
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrowError("Ese horario no está disponible.");
  });

  it("reprogramar una cita ya cancelada → 409", async () => {
    const appt = await bookFresh();
    await asPatient(() => svc.cancel(appt.id, "patient"));
    const target = await freeSlotExcept(appt.startsAt);

    await expect(
      asPatient(() => svc.rescheduleAsPatient(appt.id, { startsAt: target.startsAt })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("carrera: si el nuevo slot se toma entre el cálculo y el insert → 409 (EXCLUDE)", async () => {
    const appt = await bookFresh();
    // Slot fijo (simula el resultado del cálculo) ya tomado por otra cita del mismo
    // profesional, insertada DESPUÉS del "cálculo". Forzamos ese resultado stubbeando
    // resolveSlot para reproducir la ventana de carrera de forma determinística.
    const raced: SlotDto = {
      startsAt: "2032-05-05T13:00:00.000Z",
      endsAt: "2032-05-05T13:30:00.000Z",
    };
    await withTenant(appDb, SEED.orgDemo.id, async (tx) => {
      await tx.insert(appointments).values({
        tenantId: SEED.orgDemo.id,
        region: SEED.orgDemo.region,
        patientId: PACIENTE_DOS,
        membershipId: proMembershipId,
        startsAt: new Date(raced.startsAt),
        endsAt: new Date(raced.endsAt),
        status: "booked",
        bookedVia: "professional",
        createdByMembershipId: proMembershipId,
      });
    });

    const original = (svc as unknown as { resolveSlot: unknown }).resolveSlot;
    (svc as unknown as { resolveSlot: () => Promise<SlotDto> }).resolveSlot = async () => raced;
    try {
      await expect(
        asPatient(() => svc.rescheduleAsPatient(appt.id, { startsAt: raced.startsAt })),
      ).rejects.toBeInstanceOf(ConflictException);
    } finally {
      (svc as unknown as { resolveSlot: unknown }).resolveSlot = original;
    }
  });
});
