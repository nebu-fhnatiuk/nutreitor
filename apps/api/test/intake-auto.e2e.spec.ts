import {
  appointments,
  createDb,
  intakeRequests,
  invitations,
  memberships,
  patients,
  users,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole } from "@nutreitor/shared";
import { and, eq, inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { autoRequestAnamnesis } from "../src/modules/patients/intake-auto.js";
import { SchedulingService } from "../src/modules/scheduling/scheduling.service.js";

/**
 * Anamnesis automática antes de la primera consulta (KAN-90), contra Postgres real:
 * al asignar y al reservar se pide sola, una sola vez y sólo si hace falta. Sin
 * cuenta en el portal, viaja en una invitación en cola.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const DEMO: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_PROFILE = "profesional-demo";
const TAG = "intake-auto";

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let tenantDb: TenantDbService;
let audit: AuditService;
let care: CareAssignmentsService;
let scheduling: SchedulingService;
let proMembership: string;
const createdPatients: string[] = [];
const createdUsers: string[] = [];

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run({ context: { tenantId: DEMO.id, orgId: DEMO.id, region: DEMO.region }, org: DEMO, user: { id: userId, role } }, fn);
}
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);

async function newPatient(values: Partial<typeof patients.$inferInsert> = {}): Promise<string> {
  const [p] = await owner
    .insert(patients)
    .values({ tenantId: DEMO.id, region: DEMO.region, fullName: `Deportista ${TAG}`, ...values })
    .returning({ id: patients.id });
  createdPatients.push(p!.id);
  return p!.id;
}

const requestsOf = (patientId: string) => owner.select().from(intakeRequests).where(eq(intakeRequests.patientId, patientId));
const invitesOf = (patientId: string) =>
  owner.select().from(invitations).where(and(eq(invitations.patientId, patientId), eq(invitations.status, "pending")));

/** Corre la función directo, como lo hace un caller con sesión de admin. */
const autoFor = (patientId: string, now?: Date) =>
  asAdmin(() =>
    tenantDb.run((tx) =>
      autoRequestAnamnesis(tx, audit, {
        org: DEMO,
        patientId,
        membershipId: proMembership,
        trigger: "assignment",
        actor: { userId: ADMIN_USER, role: "admin" },
        now,
      }),
    ),
  );

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  tenantDb = new TenantDbService(appDb);
  audit = new AuditService();
  care = new CareAssignmentsService(tenantDb, audit);
  scheduling = new SchedulingService(tenantDb, audit);
  const [m] = await withTenant(appDb, DEMO.id, (tx) =>
    tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, PRO_USER)).limit(1),
  );
  proMembership = m!.id;
});

afterAll(async () => {
  if (owner) {
    if (createdPatients.length) {
      await owner.delete(invitations).where(inArray(invitations.patientId, createdPatients));
      await owner.delete(appointments).where(inArray(appointments.patientId, createdPatients));
      await owner.delete(patients).where(inArray(patients.id, createdPatients));
    }
    if (createdUsers.length) await owner.delete(users).where(inArray(users.id, createdUsers));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("al asignar un profesional", () => {
  it("sin cuenta: pide la anamnesis y deja la invitación al portal en cola", async () => {
    const id = await newPatient({ email: `sin-cuenta.${TAG}@demo.test` });
    await asAdmin(() => care.assign(id, { membershipId: proMembership, locationId: null }));

    const [req] = await requestsOf(id);
    expect(req).toMatchObject({ kind: "anamnesis", status: "requested", trigger: "assignment", delivery: "invitation", requestedByMembershipId: proMembership });
    const invites = await invitesOf(id);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ role: "patient", email: `sin-cuenta.${TAG}@demo.test` });
    expect(invites[0]!.queuedAt).not.toBeNull();
  });

  it("con cuenta: la pide por el portal, sin invitación", async () => {
    const [u] = await owner
      .insert(users)
      .values({ email: `con-cuenta.${TAG}@demo.test`, fullName: "Con Cuenta", hashedPassword: "x" })
      .returning({ id: users.id });
    createdUsers.push(u!.id);
    const id = await newPatient({ email: `con-cuenta.${TAG}@demo.test`, userId: u!.id });
    await asAdmin(() => care.assign(id, { membershipId: proMembership, locationId: null }));

    const [req] = await requestsOf(id);
    expect(req).toMatchObject({ trigger: "assignment", delivery: "portal" });
    expect(await invitesOf(id)).toHaveLength(0);
  });

  it("una sola vez: la segunda vez no pide otra ni invita de nuevo", async () => {
    const id = await newPatient({ email: `una-vez.${TAG}@demo.test` });
    expect(await autoFor(id)).toMatchObject({ requested: true, delivery: "invitation" });
    expect(await autoFor(id)).toEqual({ requested: false, reason: "already_has_anamnesis" });
    expect(await requestsOf(id)).toHaveLength(1);
    expect(await invitesOf(id)).toHaveLength(1);
  });

  it("no la pide si la ficha ya tiene la anamnesis cargada", async () => {
    const id = await newPatient({ email: `con-ficha.${TAG}@demo.test`, medicalHistory: "Apendicectomía 2019." });
    expect(await autoFor(id)).toEqual({ requested: false, reason: "ficha_has_anamnesis" });
    expect(await requestsOf(id)).toHaveLength(0);
  });

  it("no la pide si ya tuvo consulta con ese profesional", async () => {
    const id = await newPatient({ email: `con-turno.${TAG}@demo.test` });
    const past = new Date(Date.now() - 7 * 86_400_000);
    await owner.insert(appointments).values({
      tenantId: DEMO.id,
      region: DEMO.region,
      patientId: id,
      membershipId: proMembership,
      startsAt: past,
      endsAt: new Date(past.getTime() + 30 * 60_000),
      status: "completed",
      bookedVia: "professional",
    });
    expect(await autoFor(id)).toEqual({ requested: false, reason: "already_consulted" });
  });

  it("sin cuenta ni email no hay cómo llegarle: no la pide", async () => {
    const id = await newPatient();
    expect(await autoFor(id)).toEqual({ requested: false, reason: "no_contact" });
    expect(await requestsOf(id)).toHaveLength(0);
  });

  it("en una organización en revisión no invita pacientes", async () => {
    const id = await newPatient({ email: `en-revision.${TAG}@demo.test` });
    const res = await asAdmin(() =>
      tenantDb.run((tx) =>
        autoRequestAnamnesis(tx, audit, {
          org: { ...DEMO, status: "pending_review" },
          patientId: id,
          membershipId: proMembership,
          trigger: "assignment",
          actor: null,
        }),
      ),
    );
    expect(res).toEqual({ requested: false, reason: "org_not_active" });
  });

  it("si falla, la asignación sigue igual", async () => {
    const id = await newPatient({ email: `falla.${TAG}@demo.test` });
    // Un profesional inexistente rompe el insert del pedido (FK) dentro del savepoint.
    const res = await asAdmin(() =>
      tenantDb.run(async (tx) => {
        const r = await autoRequestAnamnesis(tx, audit, {
          org: DEMO,
          patientId: id,
          membershipId: "00000000-0000-0000-0000-00000000dead",
          trigger: "assignment",
          actor: null,
        });
        await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, id)); // la transacción sigue viva
        return r;
      }),
    );
    expect(res).toEqual({ requested: false, reason: "error" });
    expect(await requestsOf(id)).toHaveLength(0);
  });
});

describe("al reservar turno", () => {
  beforeAll(() =>
    asPro(() =>
      scheduling.setMyAvailability({
        timezone: "America/Argentina/Buenos_Aires",
        windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60, slotMinutes: 30 })),
      }),
    ),
  );

  it("desde la vidriera: el lead recibe la anamnesis con la invitación, sin actor", async () => {
    const email = `vidriera.${TAG}@demo.test`;
    const slots = await scheduling.publicSlots(DEMO, PRO_PROFILE);
    let leadId: string | undefined;
    for (const s of slots.slice(-15)) {
      try {
        await scheduling.publicBook(DEMO, PRO_PROFILE, { startsAt: s.startsAt, fullName: "Visitante Auto", email });
        const [lead] = await owner.select({ id: patients.id }).from(patients).where(eq(patients.email, email));
        leadId = lead!.id;
        createdPatients.push(leadId);
        break;
      } catch {
        // slot tomado por otro test: probar el siguiente
      }
    }
    expect(leadId).toBeDefined();
    const [req] = await requestsOf(leadId!);
    expect(req).toMatchObject({ trigger: "booking", delivery: "invitation", requestedByMembershipId: proMembership });
    expect(await invitesOf(leadId!)).toHaveLength(1);
  });
});
