import { createDb, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { mergeMessages, sendMessageSchema, type MembershipRole, type MessageDto } from "@nutreitor/shared";
import { NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { ConversationsService } from "../src/modules/patients/conversations.service.js";

/**
 * Conversaciones PRIVADAS por par (ADR 0024): paciente ↔ profesional (la admin y los
 * otros profesionales NO las ven) y profesional ↔ administración (los otros
 * profesionales NO la ven). Mensajes append-only por GRANT.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T = SEED.orgDemo;

const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3"; // patient@demo → ficha d1
// Segundo profesional, también asignado a d1 (se crea acá).
const PRO2_USER = "00000000-0000-0000-0000-0000000000f9";
const PRO2_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c9";
const D1 = "00000000-0000-0000-0000-0000000000d1";
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2";

let appDb: Database;
let appPool: pg.Pool;
let ownerPool: pg.Pool;
let svc: ConversationsService;

function as<T>(userId: string, role: MembershipRole, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(
    {
      context: { tenantId: T.id, orgId: T.id, region: T.region },
      org: { id: T.id, name: T.name, slug: T.slug, region: T.region },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as(PRO_USER, "professional", fn);
const asPro2 = <T>(fn: () => Promise<T>) => as(PRO2_USER, "professional", fn);
const asAdmin = <T>(fn: () => Promise<T>) => as(ADMIN_USER, "admin", fn);
const asPatient = <T>(fn: () => Promise<T>) => as(PATIENT_USER, "patient", fn);

let proPatientConv: string;
let pro2PatientConv: string;
let proAdminConv: string;

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  const { db: owner, pool } = createDb(OWNER_URL);
  ownerPool = pool;
  await owner.execute(sql`insert into users (id, email, full_name, hashed_password)
    values (${PRO2_USER}, 'pro2@demo.test', 'Profesional Dos', 'x') on conflict (id) do nothing`);
  await owner.execute(sql`insert into memberships (id, user_id, organization_id, region, role)
    values (${PRO2_MEMBERSHIP}, ${PRO2_USER}, ${T.id}, ${T.region}::region, 'professional') on conflict (id) do nothing`);
  await owner.execute(sql`insert into care_assignments (tenant_id, region, patient_id, membership_id, status)
    select ${T.id}, ${T.region}::region, ${D1}, ${PRO2_MEMBERSHIP}, 'active'
    where not exists (select 1 from care_assignments where patient_id = ${D1} and membership_id = ${PRO2_MEMBERSHIP} and status = 'active')`);
  svc = new ConversationsService(new TenantDbService(appDb));
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

describe("Paciente ↔ profesional", () => {
  it("el paciente tiene una conversación por profesional asignado", async () => {
    const inbox = await asPatient(() => svc.inbox());
    const pros = inbox.map((e) => e.professionalMembershipId);
    expect(pros).toEqual(expect.arrayContaining([PRO_MEMBERSHIP, PRO2_MEMBERSHIP]));
    proPatientConv = (await asPatient(() => svc.openWithProfessional(PRO_MEMBERSHIP))).conversationId;
    pro2PatientConv = (await asPatient(() => svc.openWithProfessional(PRO2_MEMBERSHIP))).conversationId;
    expect(proPatientConv).not.toBe(pro2PatientConv);
    // Abrir de nuevo (de cualquier lado) devuelve la misma conversación.
    expect((await asPro(() => svc.openWithPatient(D1))).conversationId).toBe(proPatientConv);
  });

  it("ida y vuelta con no leídos", async () => {
    await asPro(() => svc.markRead(proPatientConv));
    const sent = await asPatient(() => svc.send(proPatientConv, "¿Puedo cambiar la cena?"));
    const t = await asPro(() => svc.thread(proPatientConv, {}));
    expect(t.unread).toBe(1);
    expect(t.messages.at(-1)).toMatchObject({ id: sent.id, mine: false, author: { role: "patient" } });
    expect((await asPro(() => svc.unread())).total).toBeGreaterThanOrEqual(1);
    await asPro(() => svc.markRead(proPatientConv));
    const reply = await asPro(() => svc.send(proPatientConv, "Sí, 150 g de pechuga."));
    const mine = await asPatient(() => svc.thread(proPatientConv, {}));
    expect(mine.messages.at(-1)).toMatchObject({ id: reply.id, mine: false });
    expect(mine.canSend).toBe(true);
  });

  it("la admin NO ve ni abre conversaciones con pacientes", async () => {
    await expect(asAdmin(() => svc.thread(proPatientConv, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asAdmin(() => svc.send(proPatientConv, "x"))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asAdmin(() => svc.openWithPatient(D1))).rejects.toBeInstanceOf(NotFoundException);
    const inbox = await asAdmin(() => svc.inbox());
    expect(inbox.every((e) => e.kind === "professional_admin")).toBe(true);
  });

  it("otro profesional del mismo paciente NO ve la conversación ajena", async () => {
    await expect(asPro2(() => svc.thread(proPatientConv, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPro(() => svc.thread(pro2PatientConv, {}))).rejects.toBeInstanceOf(NotFoundException);
    const inbox = await asPro2(() => svc.inbox());
    expect(inbox.some((e) => e.conversationId === proPatientConv)).toBe(false);
  });

  it("un profesional no abre conversación con un paciente no asignado", async () => {
    await expect(asPro(() => svc.openWithPatient(D2_UNASSIGNED))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("polling: `after` trae desde ese instante y el cliente deduplica", async () => {
    const first = await asPatient(() => svc.thread(proPatientConv, {}));
    const cursor = first.messages.at(-1)!.createdAt;
    const next = await asPro(() => svc.send(proPatientConv, "Cualquier duda escribime."));
    const poll = await asPatient(() => svc.thread(proPatientConv, { after: cursor }));
    expect(poll.messages.every((m) => m.createdAt >= cursor)).toBe(true);
    const merged = mergeMessages(first.messages, poll.messages);
    expect(new Set(merged.map((m) => m.id)).size).toBe(merged.length);
    expect(merged.at(-1)!.id).toBe(next.id);
  });
});

describe("Profesional ↔ administración", () => {
  it("el profesional escribe a la administración y cualquier admin lo ve", async () => {
    proAdminConv = (await asPro(() => svc.openWithAdmin())).conversationId;
    const proInbox = await asPro(() => svc.inbox());
    expect(proInbox[0]).toMatchObject({ kind: "professional_admin", title: "Administración", conversationId: proAdminConv });
    // Arranque limpio (la base de tests guarda corridas anteriores).
    await asAdmin(() => svc.markRead(proAdminConv));
    await asPro(() => svc.send(proAdminConv, "¿Me pasás el cronograma de feriados?"));
    const adminInbox = await asAdmin(() => svc.inbox());
    const row = adminInbox.find((e) => e.professionalMembershipId === PRO_MEMBERSHIP)!;
    expect(row).toMatchObject({ conversationId: proAdminConv, unread: 1 });
    expect((await asAdmin(() => svc.openWithProfessional(PRO_MEMBERSHIP))).conversationId).toBe(proAdminConv);
  });

  it("la admin ve a todos los profesionales (aunque no haya mensajes) y puede escribir primero", async () => {
    const adminInbox = await asAdmin(() => svc.inbox());
    expect(adminInbox.map((e) => e.professionalMembershipId)).toContain(PRO2_MEMBERSHIP);
    const c = (await asAdmin(() => svc.openWithProfessional(PRO2_MEMBERSHIP))).conversationId;
    await asAdmin(() => svc.send(c, "Bienvenido al consultorio."));
    expect((await asPro2(() => svc.thread(c, {}))).messages.at(-1)!.author.role).toBe("admin");
  });

  it("los otros profesionales y el paciente NO ven la conversación con la administración", async () => {
    await expect(asPro2(() => svc.thread(proAdminConv, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPatient(() => svc.thread(proAdminConv, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(asPatient(() => svc.openWithProfessional(PRO_MEMBERSHIP).then(() => svc.thread(proAdminConv, {})))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("Garantías", () => {
  it("los mensajes son append-only: el rol app no puede editarlos ni borrarlos", async () => {
    for (const stmt of [sql`update messages set body = 'x'`, sql`delete from messages`]) {
      await expect(withTenant(appDb, T.id, (tx) => tx.execute(stmt))).rejects.toThrow(/permission denied/);
    }
  });

  it("mergeMessages no duplica y ordena; el cuerpo se valida", () => {
    const m = (id: string, createdAt: string) => ({ id, createdAt }) as MessageDto;
    const out = mergeMessages([m("a", "2026-10-18T10:00:00.000Z")], [m("c", "2026-10-18T10:02:00.000Z"), m("a", "2026-10-18T10:00:00.000Z"), m("b", "2026-10-18T10:01:00.000Z")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});
