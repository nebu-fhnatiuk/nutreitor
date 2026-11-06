import { ConflictException } from "@nestjs/common";
import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole } from "@nutreitor/shared";
import { actsAsProfessional, workspaceHome } from "@nutreitor/shared";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import type { AuthService } from "../src/core/auth/auth.service.js";
import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AdminDbService } from "../src/core/database/admin-db.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import type { MailSender } from "../src/core/mail/mail-sender.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { InvitationsService } from "../src/modules/invitations/invitations.service.js";
import { OrganizationsService } from "../src/modules/organizations/organizations.service.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { ConversationsService } from "../src/modules/patients/conversations.service.js";
import { EfficiencyService } from "../src/modules/patients/efficiency.service.js";
import { PatientNotesService } from "../src/modules/patients/patient-notes.service.js";
import { PatientsService } from "../src/modules/patients/patients.service.js";
import { controlUrl } from "./test-db.js";

/**
 * Profesional independiente = org de una persona (ADR 0026): la admin es quien
 * atiende. Cubre que sus pacientes quedan asignados a ella, que chatea con ellos
 * (lo habilita la asignación, no el rol), sus números propios, y el paso a equipo.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;

const ORG: AuthOrg = {
  id: "00000000-0000-0000-0000-00000000501a",
  name: "Lic. Solo",
  slug: "solo-e2e",
  region: "sa-east-1",
  status: "active",
  kind: "individual",
};
const ADMIN_USER = "00000000-0000-0000-0000-00000000501b";
const ADMIN_M = "00000000-0000-0000-0000-00000000501c";
const PATIENT_USER = "00000000-0000-0000-0000-00000000501d";
const PATIENT_M = "00000000-0000-0000-0000-00000000501e";
const COLLEAGUE_USER = "00000000-0000-0000-0000-00000000501f";
const COLLEAGUE_M = "00000000-0000-0000-0000-000000005020";

let appPool: pg.Pool;
let ownerPool: pg.Pool;
let control: ReturnType<typeof createDb>;
let owner: Database;
let patientsSvc: PatientsService;
let chat: ConversationsService;
let efficiency: EfficiencyService;
let orgs: OrganizationsService;
let invites: InvitationsService;
let patientId: string;

/** La org puede cambiar de tipo durante el test: se relee de la base. */
async function currentOrg(): Promise<AuthOrg> {
  const r = await owner.execute(sql`select kind from organizations where id = ${ORG.id}`);
  return { ...ORG, kind: (r.rows[0] as { kind: AuthOrg["kind"] }).kind };
}

async function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  const org = await currentOrg();
  return tenantStorage.run(
    {
      context: { tenantId: ORG.id, orgId: ORG.id, region: ORG.region },
      org,
      user: { id: userId, role },
    },
    fn,
  );
}
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);
const asPatient = <X>(fn: () => Promise<X>) => as(PATIENT_USER, "patient", fn);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  let appDb: Database;
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  control = createDb(controlUrl());

  await owner.execute(sql`insert into organizations (id, name, slug, region, status, kind)
    values (${ORG.id}, ${ORG.name}, ${ORG.slug}, 'sa-east-1', 'active', 'individual')
    on conflict (id) do update set kind = 'individual'`);
  await owner.execute(sql`insert into users (id, email, full_name, hashed_password) values
    (${ADMIN_USER}, 'solo@e2e.test', 'Lic. Solo', 'x'),
    (${PATIENT_USER}, 'paciente-solo@e2e.test', 'Paciente Solo', 'x'),
    (${COLLEAGUE_USER}, 'colega-solo@e2e.test', 'Colega Solo', 'x')
    on conflict (id) do nothing`);
  await owner.execute(sql`insert into memberships (id, user_id, organization_id, region, role) values
    (${ADMIN_M}, ${ADMIN_USER}, ${ORG.id}, 'sa-east-1', 'admin'),
    (${PATIENT_M}, ${PATIENT_USER}, ${ORG.id}, 'sa-east-1', 'patient')
    on conflict (id) do nothing`);
  // Idempotencia entre corridas: el colega arranca fuera del equipo.
  await owner.execute(sql`delete from memberships where id = ${COLLEAGUE_M}`);

  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  patientsSvc = new PatientsService(
    tenantDb,
    audit,
    new CareAssignmentsService(tenantDb, audit),
    new PatientNotesService(tenantDb, audit),
  );
  chat = new ConversationsService(tenantDb);
  efficiency = new EfficiencyService(tenantDb);
  orgs = new OrganizationsService(new AdminDbService(control.db), tenantDb, audit);
  const noMail: MailSender = { sendInvitation: async () => {}, send: async () => {} };
  const env = { WEB_ORIGIN_TEMPLATE: "http://{slug}.localhost:3000", INVITE_TTL_DAYS: 7 } as unknown as ApiEnv;
  invites = new InvitationsService(tenantDb, new AdminDbService(control.db), {} as AuthService, audit, noMail, env);
});

afterAll(async () => {
  await owner?.execute(sql`update organizations set kind = 'individual' where id = ${ORG.id}`);
  await appPool?.end();
  await ownerPool?.end();
  await control?.pool.end();
});

describe("helpers de rol", () => {
  it("la admin de una org individual atiende y arranca en /pro", () => {
    expect(actsAsProfessional("admin", "individual")).toBe(true);
    expect(actsAsProfessional("admin", "team")).toBe(false);
    expect(actsAsProfessional("professional", "team")).toBe(true);
    expect(workspaceHome("admin", "individual")).toBe("/pro");
    expect(workspaceHome("admin", "team")).toBe("/admin");
  });
});

describe("profesional independiente", () => {
  it("el paciente que crea queda asignado a ella", async () => {
    const p = await asAdmin(() => patientsSvc.create({ fullName: "Paciente Solo" }));
    patientId = p.id;
    expect(p.assignments.filter((a) => a.status === "active").map((a) => a.membershipId)).toEqual([ADMIN_M]);
    // Entre corridas: la cuenta del paciente queda vinculada a la ficha nueva.
    await owner.execute(sql`update patients set user_id = null where user_id = ${PATIENT_USER}`);
    await owner.execute(sql`update patients set user_id = ${PATIENT_USER} where id = ${patientId}`);
  });

  it("chatea con su paciente: lo habilita la asignación, no el rol", async () => {
    const inbox = await asPatient(() => chat.inbox());
    expect(inbox.map((e) => e.professionalMembershipId)).toContain(ADMIN_M);

    const fromPatient = (await asPatient(() => chat.openWithProfessional(ADMIN_M))).conversationId;
    const fromAdmin = (await asAdmin(() => chat.openWithPatient(patientId))).conversationId;
    expect(fromAdmin).toBe(fromPatient);

    await asPatient(() => chat.send(fromPatient, "Hola, ¿puedo cambiar el almuerzo?"));
    const t = await asAdmin(() => chat.thread(fromAdmin, {}));
    expect(t.messages.at(-1)?.author.role).toBe("patient");
    expect(t.canSend).toBe(true);
    await asAdmin(() => chat.send(fromAdmin, "Sí, por la opción B."));

    const adminInbox = await asAdmin(() => chat.inbox());
    expect(adminInbox.some((e) => e.conversationId === fromAdmin && e.kind === "patient_professional")).toBe(true);
  });

  it("ve sus propios números (mine)", async () => {
    const r = await asAdmin(() => efficiency.forSession(30, true));
    expect(r.professionals.map((p) => p.membershipId)).toEqual([ADMIN_M]);
    expect(r.professionals[0]!.activePatients).toBeGreaterThanOrEqual(1);
  });

  it("para sumar colegas primero pasa a equipo", async () => {
    await expect(
      asAdmin(() => invites.create({ email: "colega@e2e.test", role: "professional" })),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await asAdmin(() => orgs.changeKind({ kind: "team" }))).toEqual({ kind: "team" });

    // Con un colega en el equipo no puede volver a independiente.
    await owner.execute(sql`insert into memberships (id, user_id, organization_id, region, role)
      values (${COLLEAGUE_M}, ${COLLEAGUE_USER}, ${ORG.id}, 'sa-east-1', 'professional')`);
    await expect(asAdmin(() => orgs.changeKind({ kind: "individual" }))).rejects.toThrow(/otras personas/);

    await owner.execute(sql`delete from memberships where id = ${COLLEAGUE_M}`);
    expect(await asAdmin(() => orgs.changeKind({ kind: "individual" }))).toEqual({ kind: "individual" });
  });
});
