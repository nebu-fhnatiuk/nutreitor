import { BadRequestException, NotFoundException } from "@nestjs/common";
import { auditLog, createDb, groupCoaches, memberships, patientGroups, patients, users, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { hasCapability, type AuthOrg, type MembershipRole } from "@nutreitor/shared";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AnthropometryService } from "../src/modules/patients/anthropometry.service.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { GroupBoardService } from "../src/modules/patients/group-board.service.js";
import { coachHasGroup, GroupsService } from "../src/modules/patients/groups.service.js";
import { HydrationService } from "../src/modules/patients/hydration.service.js";
import { TeamService } from "../src/modules/team/team.service.js";
import { resolvePatientAccess } from "../src/modules/patients/patient-access.js";
import { StaffSharingService } from "../src/modules/patients/staff-sharing.service.js";

/**
 * Cuerpo técnico (KAN-109, ADR 0054) contra Postgres real con el rol app: los
 * planteles del coach, el tablero recortado y el consentimiento para compartir la
 * composición corporal.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const T: AuthOrg = { ...SEED.orgDemo };
/** DT del test: usuario y membresía `coach` propios, creados con el owner. */
const COACH_USER = "00000000-0000-0000-0000-00000000c0a1";
const COACH_MEMBERSHIP = "00000000-0000-0000-0000-00000000c0a2";

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run({ context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: userId, role } }, fn);
}
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);
const asCoach = <X>(fn: () => Promise<X>) => as(COACH_USER, "coach", fn);
let tenantDb: TenantDbService;
let groups: GroupsService;
let anthro: AnthropometryService;
let team: TeamService;
let sharing: StaffSharingService;
/** Cuenta del deportista P1 para el portal. */
const ATHLETE_USER = "00000000-0000-0000-0000-00000000c0c1";
const RUN = Math.random().toString(36).slice(2, 8);
/** Deportistas propios del test (no se tocan los del seed que usan otros archivos). */
const P1 = "00000000-0000-0000-0000-00000000c0b1";
const P2 = "00000000-0000-0000-0000-00000000c0b2";
const TAKES = (sum: number) => ({
  bodyMass: [78.0 + sum / 100],
  stature: [180.0, 180.1],
  triceps: [sum / 6, sum / 6],
  subscapular: [sum / 6, sum / 6],
  supraspinale: [sum / 6, sum / 6],
  abdominal: [sum / 6, sum / 6],
  frontThigh: [sum / 6, sum / 6],
  medialCalf: [sum / 6, sum / 6],
});
/** ¿La sesión actual (coach) tiene el plantel? */
const coachSees = (groupId: string) => asCoach(() => tenantDb.run(async (tx) => coachHasGroup(tx, groupId, await resolvePatientAccess(tx))));

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  await owner
    .insert(users)
    .values({ id: COACH_USER, email: "dt@demo.test", fullName: "Diego Test", hashedPassword: "x" })
    .onConflictDoNothing();
  await owner
    .insert(memberships)
    .values({ id: COACH_MEMBERSHIP, userId: COACH_USER, organizationId: T.id, region: T.region, role: "coach" })
    .onConflictDoNothing();
  await owner.update(memberships).set({ revokedAt: null }).where(eq(memberships.id, COACH_MEMBERSHIP));
  await owner.delete(groupCoaches).where(eq(groupCoaches.membershipId, COACH_MEMBERSHIP));
  tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  groups = new GroupsService(tenantDb, audit);
  anthro = new AnthropometryService(tenantDb, audit);
  const hydration = new HydrationService(tenantDb, audit);
  sharing = new StaffSharingService(tenantDb, audit);
  team = new TeamService(tenantDb, anthro, hydration, new GroupBoardService(tenantDb, anthro, hydration));
  await owner.delete(patients).where(inArray(patients.id, [P1, P2]));
  await owner.insert(users).values({ id: ATHLETE_USER, email: "ana.uno@demo.test", fullName: "Ana Uno", hashedPassword: "x" }).onConflictDoNothing();
  await owner.insert(patients).values([
    { id: P1, tenantId: T.id, region: T.region, fullName: "Ana Uno", sex: "female", birthDate: "2000-01-01", userId: ATHLETE_USER },
    { id: P2, tenantId: T.id, region: T.region, fullName: "Beto Dos", sex: "male", birthDate: "2000-01-01" },
  ]);
});

afterAll(async () => {
  await owner?.delete(patientGroups).where(like(patientGroups.name, `%${RUN}%`));
  await owner?.delete(patients).where(inArray(patients.id, [P1, P2]));
  await owner.delete(groupCoaches).where(and(eq(groupCoaches.groupId, SEED.groupDemo), eq(groupCoaches.membershipId, PRO_MEMBERSHIP)));
  await appPool?.end();
  await ownerPool?.end();
});

describe("group_coaches RLS", () => {
  it("otro tenant no ve ni puede escribir los planteles del coach", async () => {
    const T = SEED.orgDemo;
    await withTenant(appDb, T.id, (tx) =>
      tx.insert(groupCoaches).values({ tenantId: T.id, region: T.region, groupId: SEED.groupDemo, membershipId: PRO_MEMBERSHIP }).onConflictDoNothing(),
    );
    const mine = await withTenant(appDb, T.id, (tx) => tx.select().from(groupCoaches).where(eq(groupCoaches.groupId, SEED.groupDemo)));
    expect(mine).toHaveLength(1);

    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(groupCoaches));
    expect(leaked.find((r) => r.groupId === SEED.groupDemo)).toBeUndefined();

    await expect(
      withTenant(appDb, SEED.orgA.id, (tx) =>
        tx.insert(groupCoaches).values({ tenantId: T.id, region: T.region, groupId: SEED.groupDemo, membershipId: PRO_MEMBERSHIP }),
      ),
    ).rejects.toThrow();
    await owner.delete(groupCoaches).where(and(eq(groupCoaches.groupId, SEED.groupDemo), eq(groupCoaches.membershipId, PRO_MEMBERSHIP)));
  });
});

describe("planteles del coach", () => {
  const lastAudit = async (action: string) =>
    (await owner.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(desc(auditLog.createdAt)).limit(1))[0];

  it("el admin agrega y quita un coach, con auditoría", async () => {
    await asAdmin(() => groups.addCoach(SEED.groupDemo, { membershipId: COACH_MEMBERSHIP }));
    const list = await asAdmin(() => groups.listCoaches(SEED.groupDemo));
    expect(list).toEqual([{ membershipId: COACH_MEMBERSHIP, fullName: "Diego Test", email: "dt@demo.test" }]);
    expect((await lastAudit("group.coach_added"))?.targetId).toBe(SEED.groupDemo);
    expect(await coachSees(SEED.groupDemo)).toBe(true);

    await asAdmin(() => groups.removeCoach(SEED.groupDemo, COACH_MEMBERSHIP));
    expect(await asAdmin(() => groups.listCoaches(SEED.groupDemo))).toEqual([]);
    expect((await lastAudit("group.coach_removed"))?.targetId).toBe(SEED.groupDemo);
    expect(await coachSees(SEED.groupDemo)).toBe(false);
  });

  it("sólo se asignan membresías coach", async () => {
    await expect(asAdmin(() => groups.addCoach(SEED.groupDemo, { membershipId: PRO_MEMBERSHIP }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sólo quien administra grupos asigna planteles", () => {
    expect(hasCapability("professional", "group:manage")).toBe(false);
    expect(hasCapability("coach", "group:manage")).toBe(false);
  });

  it("un coach con la membresía revocada pierde el plantel en el acto", async () => {
    await asAdmin(() => groups.addCoach(SEED.groupDemo, { membershipId: COACH_MEMBERSHIP }));
    expect(await coachSees(SEED.groupDemo)).toBe(true);
    await owner.update(memberships).set({ revokedAt: new Date() }).where(eq(memberships.id, COACH_MEMBERSHIP));
    expect(await coachSees(SEED.groupDemo)).toBe(false);
    await owner.update(memberships).set({ revokedAt: null }).where(eq(memberships.id, COACH_MEMBERSHIP));
    await asAdmin(() => groups.removeCoach(SEED.groupDemo, COACH_MEMBERSHIP));
  });
});

describe("tablero del cuerpo técnico", () => {
  let plantel: string;
  let otro: string;

  beforeAll(async () => {
    plantel = (await asAdmin(() => groups.create({ name: `Primera ${RUN}`, description: null }))).id;
    otro = (await asAdmin(() => groups.create({ name: `Reserva ${RUN}`, description: null }))).id;
    await asAdmin(() => groups.addMembers(plantel, { patientIds: [P1, P2] }));
    await asAdmin(() => anthro.createForGroup(plantel, { measuredAt: "2026-09-01", entries: [{ patientId: P1, takes: TAKES(48) }] }));
    await asAdmin(() => anthro.createForGroup(plantel, { measuredAt: "2026-11-01", entries: [{ patientId: P1, takes: TAKES(54) }] }));
    await asAdmin(() => groups.addCoach(plantel, { membershipId: COACH_MEMBERSHIP }));
  });

  it("el coach ve su plantel sin composición corporal de quien no consintió", async () => {
    const board = await asCoach(() => team.board(plantel));
    expect(board.group.name).toBe(`Primera ${RUN}`);
    expect(board.rows.map((r) => r.patientId).sort()).toEqual([P1, P2]);
    const ana = board.rows.find((r) => r.patientId === P1)!;
    expect(ana.body).toBeNull();
    expect(ana.status.flags.map((f) => f.kind)).not.toContain("sum6Up");
    expect(JSON.stringify(board)).not.toMatch(/sum6|muscleKg/);
    expect(ana.bodyMass).toBeCloseTo(78.54, 2);
    expect(ana.bodyMassDelta).toBeCloseTo(0.06, 2);
  });

  it("un plantel que no le asignaron no existe para el coach", async () => {
    await expect(asCoach(() => team.board(otro))).rejects.toBeInstanceOf(NotFoundException);
    expect((await asCoach(() => team.groups())).map((g) => g.id)).toEqual([plantel]);
  });

  it("quien sale del plantel o se archiva deja de aparecer", async () => {
    await asAdmin(() => groups.removeMember(plantel, P2));
    expect((await asCoach(() => team.board(plantel))).rows.map((r) => r.patientId)).toEqual([P1]);
    await asAdmin(() => groups.addMembers(plantel, { patientIds: [P2] }));
    await owner.update(patients).set({ archivedAt: new Date() }).where(eq(patients.id, P2));
    expect((await asCoach(() => team.board(plantel))).rows.map((r) => r.patientId)).toEqual([P1]);
    await owner.update(patients).set({ archivedAt: null }).where(eq(patients.id, P2));
  });

  it("el admin ve todos los planteles con el mismo recorte", async () => {
    const ids = (await asAdmin(() => team.groups())).map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining([plantel, otro]));
    const board = await asAdmin(() => team.board(plantel));
    expect(JSON.stringify(board)).not.toMatch(/sum6|muscleKg/);
  });

  it("un jugador en dos planteles del coach aparece una vez en cada uno", async () => {
    await asAdmin(() => groups.addMembers(otro, { patientIds: [P1] }));
    await asAdmin(() => groups.addCoach(otro, { membershipId: COACH_MEMBERSHIP }));
    for (const g of [plantel, otro]) {
      const rows = (await asCoach(() => team.board(g))).rows.filter((r) => r.patientId === P1);
      expect(rows).toHaveLength(1);
    }
  });

  it("el coach no tiene ninguna capacidad clínica", () => {
    for (const cap of ["patient:read", "patient:read_clinical", "metric:read", "plan:read", "message:send", "patient:add_note", "report:write", "appointment:read", "agent:use"] as const) {
      expect(hasCapability("coach", cap)).toBe(false);
    }
  });
});

describe("consentimiento para compartir la composición corporal", () => {
  let plantel: string;
  const lastAudit = async () =>
    (await owner.select().from(auditLog).where(and(eq(auditLog.action, "patient.staff_sharing_changed"), eq(auditLog.targetId, P1))).orderBy(desc(auditLog.createdAt)).limit(2));
  const asAthlete = <X>(fn: () => Promise<X>) => as(ATHLETE_USER, "patient", fn);
  const anaBody = async () => (await asCoach(() => team.board(plantel))).rows.find((r) => r.patientId === P1)!.body;

  beforeAll(async () => {
    plantel = (await asAdmin(() => groups.create({ name: `Consentimiento ${RUN}`, description: null }))).id;
    await asAdmin(() => groups.addMembers(plantel, { patientIds: [P1] }));
    await asAdmin(() => groups.addCoach(plantel, { membershipId: COACH_MEMBERSHIP }));
  });

  it("el deportista lo activa y el coach ve su Σ6; lo revoca y deja de verlo", async () => {
    expect(await anaBody()).toBeNull();
    expect(await asAthlete(() => sharing.mine())).toMatchObject({ shareBody: false, hasCoaches: true });
    const on = await asAthlete(() => sharing.setByAthlete({ shareBody: true }));
    expect(on).toMatchObject({ shareBody: true, by: "athlete" });
    expect((await anaBody())?.sum6).toBe(54);
    await asAthlete(() => sharing.setByAthlete({ shareBody: false }));
    expect(await anaBody()).toBeNull();
    const audits = await lastAudit();
    expect(audits.map((a) => (a.metadata as { shareBody: boolean }).shareBody)).toEqual([false, true]);
  });

  it("el admin lo registra por el papel firmado", async () => {
    const r = await asAdmin(() => sharing.setByAdmin(P1, { shareBody: true }));
    expect(r).toMatchObject({ shareBody: true, by: "admin" });
    const [row] = await owner.select().from(patients).where(eq(patients.id, P1));
    expect(row!.shareBodyWithStaffBy).toBe("admin");
    expect(row!.shareBodyWithStaffAt).toBeInstanceOf(Date);
    expect(((await lastAudit())[0]!.metadata as { by: string }).by).toBe("admin");
    await asAdmin(() => sharing.setByAdmin(P1, { shareBody: false }));
  });

  it("el coach no puede cambiarlo", () => {
    expect(hasCapability("coach", "patient:update")).toBe(false);
    expect(hasCapability("coach", "portal:self_report")).toBe(false);
  });
});

describe("el coach no atiende", () => {
  it("no se lo puede asignar como profesional de un deportista", async () => {
    const assignments = new CareAssignmentsService(tenantDb, new AuditService());
    await expect(asAdmin(() => assignments.assign(P2, { membershipId: COACH_MEMBERSHIP }))).rejects.toBeInstanceOf(BadRequestException);
  });
});
