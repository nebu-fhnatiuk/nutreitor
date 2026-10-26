import { BadRequestException } from "@nestjs/common";
import {
  adherenceMealLogs,
  careAssignments,
  createDb,
  mealPlans,
  patientGroups,
  patients,
  planTemplates,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole } from "@nutreitor/shared";
import { and, eq, inArray, like } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AnthropometryService } from "../src/modules/patients/anthropometry.service.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { GroupActionsService } from "../src/modules/patients/group-actions.service.js";
import { GroupBoardService } from "../src/modules/patients/group-board.service.js";
import { GroupsService } from "../src/modules/patients/groups.service.js";
import { HydrationService } from "../src/modules/patients/hydration.service.js";
import { MealPlansService } from "../src/modules/patients/meal-plans.service.js";

/**
 * Acciones por grupo (KAN-32/33) y cobertura de la pizarra (KAN-34, ADR 0044), contra
 * Postgres real con el rol app: todo o nada, scoping del profesional, un plan propio
 * por deportista y los indicadores con datos conocidos.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const PATIENT_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c3";
const RUN = Math.random().toString(36).slice(2, 8);
const TODAY = "2027-03-10";

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let groups: GroupsService;
let actions: GroupActionsService;
let care: CareAssignmentsService;
let plans: MealPlansService;
let anthro: AnthropometryService;
let board: GroupBoardService;
let templateId: string;
const ids: string[] = [];

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run({ context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: userId, role } }, fn);
}
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);

const TEMPLATE_BODY = { layout: "day", day: { meals: [{ name: "Desayuno", items: [{ text: "Avena" }] }] } };

async function newPatients(n: number): Promise<string[]> {
  const rows = await owner
    .insert(patients)
    .values(Array.from({ length: n }, (_, i) => ({ tenantId: T.id, region: T.region, fullName: `Grupo ${i} ${RUN}` })))
    .returning({ id: patients.id });
  ids.push(...rows.map((r) => r.id));
  return rows.map((r) => r.id);
}
async function newGroup(members: string[]): Promise<string> {
  const g = await asAdmin(() => groups.create({ name: `Plantel ${ids.length} ${RUN}` }));
  await asAdmin(() => groups.addMembers(g.id, { patientIds: members }));
  return g.id;
}
const activePlans = (patientIds: string[]) =>
  owner.select().from(mealPlans).where(and(inArray(mealPlans.patientId, patientIds), eq(mealPlans.status, "active")));

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  groups = new GroupsService(tenantDb, audit);
  care = new CareAssignmentsService(tenantDb, audit);
  plans = new MealPlansService(tenantDb, audit);
  anthro = new AnthropometryService(tenantDb, audit);
  actions = new GroupActionsService(tenantDb, audit, care, plans);
  board = new GroupBoardService(tenantDb, anthro, new HydrationService(tenantDb, audit));
  const [t] = await owner
    .insert(planTemplates)
    .values({ tenantId: T.id, region: T.region, name: `Pretemporada ${RUN}`, body: TEMPLATE_BODY, createdByMembershipId: PRO_MEMBERSHIP })
    .returning({ id: planTemplates.id });
  templateId = t!.id;
});

afterAll(async () => {
  if (owner) {
    if (ids.length) {
      await owner.delete(careAssignments).where(inArray(careAssignments.patientId, ids));
      await owner.delete(patients).where(inArray(patients.id, ids));
    }
    await owner.delete(patientGroups).where(like(patientGroups.name, `%${RUN}%`));
    await owner.delete(planTemplates).where(eq(planTemplates.id, templateId));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("KAN-32 · asignar un profesional a todo el grupo", () => {
  it("asigna a quien no lo tiene y la segunda vez no duplica", async () => {
    const [a, b, c] = await newPatients(3);
    await asAdmin(() => care.assign(a!, { membershipId: PRO_MEMBERSHIP, locationId: null }));
    const g = await newGroup([a!, b!, c!]);
    expect(await asAdmin(() => actions.assignProfessional(g, { membershipId: PRO_MEMBERSHIP }))).toEqual({ assigned: 2, alreadyAssigned: 1 });
    expect(await asAdmin(() => actions.assignProfessional(g, { membershipId: PRO_MEMBERSHIP }))).toEqual({ assigned: 0, alreadyAssigned: 3 });
    const active = await owner
      .select()
      .from(careAssignments)
      .where(and(inArray(careAssignments.patientId, [a!, b!, c!]), eq(careAssignments.status, "active")));
    expect(active).toHaveLength(3);
  });

  it("todo o nada: con un profesional inválido no queda ninguna asignación", async () => {
    const [a, b] = await newPatients(2);
    const g = await newGroup([a!, b!]);
    await expect(asAdmin(() => actions.assignProfessional(g, { membershipId: PATIENT_MEMBERSHIP }))).rejects.toBeInstanceOf(BadRequestException);
    expect(await owner.select().from(careAssignments).where(inArray(careAssignments.patientId, [a!, b!]))).toHaveLength(0);
  });
});

describe("KAN-33 · aplicar una plantilla a todo el grupo", () => {
  it("cada deportista queda con su propio plan; ajustar uno no cambia a los demás", async () => {
    const [a, b, c] = await newPatients(3);
    const g = await newGroup([a!, b!, c!]);
    // b ya tenía un plan: pasa al historial.
    await asAdmin(() => plans.save(b!, { title: "Plan viejo", body: TEMPLATE_BODY as never }));
    const res = await asAdmin(() => actions.applyPlan(g, { templateId, onlyWithoutPlan: false }));
    expect(res).toEqual({ applied: 3, replaced: 1, skipped: 0 });

    const after = await activePlans([a!, b!, c!]);
    expect(after).toHaveLength(3);
    expect(new Set(after.map((p) => p.id)).size).toBe(3);
    expect(after.every((p) => p.title === `Pretemporada ${RUN}` && p.draftedFrom === "template")).toBe(true);
    expect(after.find((p) => p.patientId === b)!.version).toBe(2);

    // Ajuste individual: sólo cambia el de a.
    await asAdmin(() =>
      plans.save(a!, { title: "Ajustado", body: { layout: "day", day: { meals: [{ name: "Desayuno", items: [{ text: "Tostadas" }] }] } } as never }),
    );
    const others = await activePlans([b!, c!]);
    expect(others.every((p) => JSON.stringify(p.body).includes("Avena"))).toBe(true);
  });

  it("con onlyWithoutPlan no reemplaza a nadie", async () => {
    const [a, b] = await newPatients(2);
    const g = await newGroup([a!, b!]);
    await asAdmin(() => plans.save(a!, { title: "Suyo", body: TEMPLATE_BODY as never }));
    expect(await asAdmin(() => actions.applyPlan(g, { templateId, onlyWithoutPlan: true }))).toEqual({ applied: 1, replaced: 0, skipped: 1 });
    expect((await activePlans([a!]))[0]!.title).toBe("Suyo");
  });

  it("el profesional sólo alcanza a sus asignados", async () => {
    const [mine, other] = await newPatients(2);
    await asAdmin(() => care.assign(mine!, { membershipId: PRO_MEMBERSHIP, locationId: null }));
    const g = await newGroup([mine!, other!]);
    expect(await asPro(() => actions.applyPlan(g, { templateId, onlyWithoutPlan: false }))).toEqual({ applied: 1, replaced: 0, skipped: 0 });
    expect(await activePlans([other!])).toHaveLength(0);
  });
});

describe("KAN-34 · cobertura del grupo en la pizarra", () => {
  it("planes vigentes, medidos en 30 días y adherencia de 30 días con datos conocidos", async () => {
    const [a, b, c] = await newPatients(3);
    const g = await newGroup([a!, b!, c!]);
    await asAdmin(() => plans.save(a!, { title: "Plan A", body: TEMPLATE_BODY as never }));
    await asAdmin(() => plans.save(b!, { title: "Plan B", body: TEMPLATE_BODY as never }));
    // a medido hace 10 días; b hace 60; c nunca.
    const takes = { bodyMass: [70], stature: [175, 175], triceps: [8, 8], subscapular: [9, 9], supraspinale: [7, 7], abdominal: [12, 12], frontThigh: [10, 10], medialCalf: [6, 6] };
    await asAdmin(() => anthro.create(a!, { measuredAt: "2027-02-28", takes }));
    await asAdmin(() => anthro.create(b!, { measuredAt: "2027-01-09", takes }));
    // Adherencia: a 3 cumplí + 1 no; b 2 en parte → (3 + 1) / 6 = 67 %.
    const log = (patientId: string, date: string, status: "done" | "partial" | "skipped", meal: string) => ({
      tenantId: T.id, region: T.region, patientId, date, mealName: meal, status,
    });
    await owner.insert(adherenceMealLogs).values([
      log(a!, "2027-03-09", "done", "Desayuno"),
      log(a!, "2027-03-09", "done", "Almuerzo"),
      log(a!, "2027-03-01", "done", "Cena"),
      log(a!, "2027-02-20", "skipped", "Cena"),
      log(b!, "2027-03-05", "partial", "Desayuno"),
      log(b!, "2027-03-05", "partial", "Almuerzo"),
      log(c!, "2027-01-01", "done", "Desayuno"), // fuera de los 30 días
    ]);

    const res = await asAdmin(() => board.board(g, TODAY));
    expect(res.coverage).toEqual({ members: 3, withPlan: 2, measured30: 1, lastMeasuredOn: "2027-02-28", adherence30: 67, logging30: 2 });
    expect(res.rows.find((r) => r.patientId === a)!.activePlan).toEqual({ title: "Plan A", version: 1 });
    expect(res.rows.find((r) => r.patientId === c)!.activePlan).toBeNull();

    // El profesional sin asignados en el grupo ve una cobertura vacía (mismo scoping).
    const pro = await asPro(() => board.board(g, TODAY));
    expect(pro.coverage.members).toBe(0);
  });
});
