import { BadRequestException } from "@nestjs/common";
import { auditLog, createDb, groupCoaches, memberships, users, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { hasCapability, type AuthOrg, type MembershipRole } from "@nutreitor/shared";
import { and, desc, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { coachHasGroup, GroupsService } from "../src/modules/patients/groups.service.js";
import { resolvePatientAccess } from "../src/modules/patients/patient-access.js";

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
  groups = new GroupsService(tenantDb, new AuditService());
});

afterAll(async () => {
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
