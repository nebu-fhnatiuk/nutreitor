import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { contactRequests, createDb, patients, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { AuthOrg, MembershipRole, PublicContactDto } from "@nutreitor/shared";
import { publicContactSchema } from "@nutreitor/shared";
import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import type { AuthService } from "../src/core/auth/auth.service.js";
import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AdminDbService } from "../src/core/database/admin-db.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import type { InvitationEmail, MailSender, PlainEmail } from "../src/core/mail/mail-sender.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { ContactService } from "../src/modules/contact/contact.service.js";
import { InvitationsService } from "../src/modules/invitations/invitations.service.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { controlUrl } from "./test-db.js";

/**
 * Solicitudes de contacto desde la vidriera (ADR 0027), contra Postgres real con el
 * rol app. Cubre: la ve sólo su destinatario (la admin no ve las de un profesional),
 * aceptar crea la ficha asignada e invita al portal, una sola respuesta, derivar,
 * rechazar sin filtrar la nota interna, y el honeypot.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PRO_M = "00000000-0000-0000-0000-0000000000c2";
const RUN = Math.random().toString(36).slice(2, 8);

class CapturingMail implements MailSender {
  plain: PlainEmail[] = [];
  invites: InvitationEmail[] = [];
  async sendInvitation(e: InvitationEmail) {
    this.invites.push(e);
  }
  async send(e: PlainEmail) {
    this.plain.push(e);
  }
}

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let control: ReturnType<typeof createDb>;
let mail: CapturingMail;
let svc: ContactService;

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run(
    { context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: userId, role } },
    fn,
  );
}
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);

const form = (over: Partial<PublicContactDto> = {}): PublicContactDto =>
  publicContactSchema.parse({
    fullName: "Lucía Visitante",
    email: `lucia-${RUN}@visita.test`,
    message: "Hola, quiero bajar de peso para una carrera de 10K.",
    consent: true,
    ...over,
  });

/** La solicitud de esta corrida por email. */
async function byEmail(email: string) {
  const [r] = await owner.select().from(contactRequests).where(eq(contactRequests.email, email)).limit(1);
  return r;
}

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  control = createDb(controlUrl());
  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  mail = new CapturingMail();
  const env = { WEB_ORIGIN_TEMPLATE: "http://{slug}.localhost:3000", INVITE_TTL_DAYS: 7 } as unknown as ApiEnv;
  const invitations = new InvitationsService(tenantDb, new AdminDbService(control.db), {} as AuthService, audit, mail, env);
  svc = new ContactService(tenantDb, audit, new CareAssignmentsService(tenantDb, audit), invitations, mail);
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
  await control?.pool.end();
});

describe("formulario público", () => {
  it("a un profesional: queda para él y el visitante recibe un acuse sin su mensaje", async () => {
    const dto = form({ profileSlug: "profesional-demo" });
    const r = await svc.createPublic(T, dto);
    expect(r).toEqual({ ok: true, to: "Profesional Demo" });
    const row = await byEmail(dto.email);
    expect(row).toMatchObject({ membershipId: PRO_M, status: "new" });
    const ack = mail.plain.find((m) => m.to === dto.email);
    expect(ack?.subject).toContain("Recibimos tu consulta");
    expect(ack?.text).not.toContain("10K");
  });

  it("perfil inexistente → 404; honeypot → responde ok sin guardar", async () => {
    await expect(svc.createPublic(T, form({ profileSlug: "no-existe" }))).rejects.toBeInstanceOf(NotFoundException);
    const bot = form({ email: `bot-${RUN}@visita.test`, website: "http://spam" });
    expect(await svc.createPublic(T, bot)).toMatchObject({ ok: true });
    expect(await byEmail(bot.email)).toBeUndefined();
  });

  it("valida consentimiento y largo del mensaje", () => {
    expect(publicContactSchema.safeParse({ ...form(), consent: false }).success).toBe(false);
    expect(publicContactSchema.safeParse({ ...form(), message: "corto" }).success).toBe(false);
  });
});

describe("bandeja: sólo el destinatario", () => {
  it("la del profesional la ve él, no la admin; la del consultorio, al revés", async () => {
    const toPro = await byEmail(`lucia-${RUN}@visita.test`);
    const orgDto = form({ email: `org-${RUN}@visita.test` });
    await svc.createPublic(T, orgDto);
    const toOrg = await byEmail(orgDto.email);

    const proIds = (await asPro(() => svc.list({ status: "new" }))).map((r) => r.id);
    const adminIds = (await asAdmin(() => svc.list({ status: "new" }))).map((r) => r.id);
    expect(proIds).toContain(toPro!.id);
    expect(proIds).not.toContain(toOrg!.id);
    expect(adminIds).toContain(toOrg!.id);
    expect(adminIds).not.toContain(toPro!.id);
    await expect(asAdmin(() => svc.accept(toPro!.id, { invite: false }))).rejects.toBeInstanceOf(NotFoundException);
    expect((await asPro(() => svc.count())).new).toBeGreaterThanOrEqual(1);
  });
});

describe("responder", () => {
  it("aceptar: crea la ficha asignada a quien acepta e invita al portal; una sola vez", async () => {
    const req = await byEmail(`lucia-${RUN}@visita.test`);
    const res = await asPro(() => svc.accept(req!.id, { invite: true }));
    expect(res.invited).toBe(true);
    const [p] = await owner.select().from(patients).where(eq(patients.id, res.patientId));
    expect(p).toMatchObject({ fullName: "Lucía Visitante", email: req!.email, reasonForConsult: req!.message });
    const a = await owner.execute(sql`select membership_id from care_assignments where patient_id = ${res.patientId} and status = 'active'`);
    expect(a.rows).toEqual([{ membership_id: PRO_M }]);
    expect(mail.invites.some((i) => i.to === req!.email)).toBe(true);
    expect(await byEmail(req!.email)).toMatchObject({ status: "accepted", patientId: res.patientId });

    await expect(asPro(() => svc.accept(req!.id, { invite: false }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("del consultorio: la admin tiene que elegir a quién asignarla, o derivarla", async () => {
    const req = await byEmail(`org-${RUN}@visita.test`);
    await expect(asAdmin(() => svc.accept(req!.id, { invite: false }))).rejects.toBeInstanceOf(BadRequestException);

    await asAdmin(() => svc.forward(req!.id, { membershipId: PRO_M }));
    // Ahora es del profesional: la admin ya no la ve.
    expect((await asAdmin(() => svc.list({ status: "new" }))).some((r) => r.id === req!.id)).toBe(false);
    expect((await asPro(() => svc.list({ status: "new" }))).some((r) => r.id === req!.id)).toBe(true);
  });

  it("rechazar: la nota queda interna; al visitante le llega un mail genérico", async () => {
    const req = await byEmail(`org-${RUN}@visita.test`);
    await asPro(() => svc.decline(req!.id, { note: "NOTA-INTERNA no es mi especialidad" }));
    const declined = await asPro(() => svc.list({ status: "declined" }));
    expect(declined.find((r) => r.id === req!.id)?.decisionNote).toContain("NOTA-INTERNA");
    const m = mail.plain.filter((x) => x.to === req!.email).at(-1);
    expect(m?.subject).toContain("Sobre tu consulta");
    expect(m?.text).not.toContain("NOTA-INTERNA");
  });

  it("el rol app no puede borrar solicitudes (sin DELETE)", async () => {
    await expect(
      withTenant(appDb, T.id, (tx) => tx.delete(contactRequests).where(eq(contactRequests.tenantId, T.id))),
    ).rejects.toThrow();
  });
});
