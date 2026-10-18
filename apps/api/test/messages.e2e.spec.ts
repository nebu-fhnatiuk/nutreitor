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
import { MessagesService } from "../src/modules/patients/messages.service.js";

/**
 * Chat profesional ↔ paciente (Fase 4.3): ida y vuelta con no leídos, polling, el
 * mismo alcance que la ficha (asignados) y mensajes append-only a nivel de GRANT.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;

const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3"; // patient@demo → ficha d1
const D1 = "00000000-0000-0000-0000-0000000000d1";
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2";
const A1_OTHER_TENANT = "00000000-0000-0000-0000-0000000000a1";

let appDb: Database;
let appPool: pg.Pool;
let svc: MessagesService;

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
const asPatient = <T>(fn: () => Promise<T>) => as(PATIENT_USER, "patient", fn);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  svc = new MessagesService(new TenantDbService(appDb));
  // Arranque limpio: el profesional y el paciente leyeron todo lo previo.
  await asPro(() => svc.markReadAsTeam(D1));
  await asPatient(() => svc.markMineRead());
});

afterAll(async () => {
  await appPool?.end();
});

describe("Chat — ida y vuelta", () => {
  it("el paciente escribe y su profesional lo ve como no leído (hilo y bandeja)", async () => {
    const sent = await asPatient(() => svc.sendMine("Hola, ¿puedo cambiar la cena por pollo?"));
    expect(sent.mine).toBe(true);
    expect(sent.author.role).toBe("patient");

    const thread = await asPro(() => svc.threadForPatient(D1, {}));
    expect(thread.unread).toBe(1);
    const last = thread.messages.at(-1)!;
    expect(last).toMatchObject({ id: sent.id, mine: false });

    const inbox = await asPro(() => svc.inbox());
    expect(inbox[0]).toMatchObject({ patientId: D1, unread: 1, lastMessage: { fromPatient: true } });
    expect((await asPro(() => svc.unread())).total).toBe(1);
  });

  it("marcar como leído baja el contador; responder le llega al paciente", async () => {
    await asPro(() => svc.markReadAsTeam(D1));
    expect((await asPro(() => svc.unread())).total).toBe(0);

    const reply = await asPro(() => svc.sendAsTeam(D1, "Sí, 150 g de pechuga."));
    const mine = await asPatient(() => svc.mine({}));
    expect(mine.unread).toBe(1);
    expect(mine.canSend).toBe(true);
    expect(mine.messages.at(-1)).toMatchObject({ id: reply.id, mine: false, author: { role: "professional" } });
  });

  it("polling: `after` trae desde ese instante y el cliente deduplica", async () => {
    const first = await asPatient(() => svc.mine({}));
    const cursor = first.messages.at(-1)!.createdAt;
    const next = await asPro(() => svc.sendAsTeam(D1, "Cualquier duda escribime."));
    const poll = await asPatient(() => svc.mine({ after: cursor }));
    expect(poll.messages.map((m) => m.id)).toContain(next.id);
    expect(poll.messages.every((m) => m.createdAt >= cursor)).toBe(true);
    const merged = mergeMessages(first.messages, poll.messages);
    expect(new Set(merged.map((m) => m.id)).size).toBe(merged.length);
    expect(merged.at(-1)!.id).toBe(next.id);
  });
});

describe("Chat — alcance", () => {
  it("un profesional no ve ni escribe a un paciente no asignado o de otro tenant → 404", async () => {
    for (const id of [D2_UNASSIGNED, A1_OTHER_TENANT]) {
      await expect(asPro(() => svc.threadForPatient(id, {}))).rejects.toBeInstanceOf(NotFoundException);
      await expect(asPro(() => svc.sendAsTeam(id, "x"))).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("la admin participa en cualquier paciente del tenant, pero no de otro → 404", async () => {
    await expect(asAdmin(() => svc.threadForPatient(D2_UNASSIGNED, {}))).resolves.toBeDefined();
    await expect(asAdmin(() => svc.markReadAsTeam(A1_OTHER_TENANT))).rejects.toBeInstanceOf(NotFoundException);
  });

  it("los mensajes son append-only: el rol app no puede editarlos ni borrarlos", async () => {
    for (const stmt of [sql`update patient_messages set body = 'x'`, sql`delete from patient_messages`]) {
      await expect(withTenant(appDb, SEED.orgDemo.id, (tx) => tx.execute(stmt))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("Chat — lógica pura", () => {
  it("mergeMessages no duplica y ordena por fecha", () => {
    const m = (id: string, createdAt: string) => ({ id, createdAt }) as MessageDto;
    const out = mergeMessages([m("a", "2026-10-18T10:00:00.000Z")], [m("c", "2026-10-18T10:02:00.000Z"), m("a", "2026-10-18T10:00:00.000Z"), m("b", "2026-10-18T10:01:00.000Z")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("valida el cuerpo: vacío o de más de 2000 caracteres no", () => {
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});
