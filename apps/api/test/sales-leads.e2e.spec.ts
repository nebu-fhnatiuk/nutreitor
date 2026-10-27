import { createDb, salesLeads, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { PLATFORM_ADMIN, runSeed, SEED } from "@nutreitor/db/seed";
import { createLeadSchema, type PlatformMe } from "@nutreitor/shared";
import { eq, like } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AdminDbService } from "../src/core/database/admin-db.service.js";
import type { MailSender, PlainEmail } from "../src/core/mail/mail-sender.js";
import { LeadsService } from "../src/modules/onboarding/leads.service.js";
import { controlUrl } from "./test-db.js";

/**
 * Consultas comerciales de la landing (KAN-80, ADR 0041), contra Postgres real:
 * validación del formulario, campo trampa, avisos por mail, el seguimiento desde la
 * consola y que el rol app no pueda leer la tabla (plano de control).
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const RUN = Math.random().toString(36).slice(2, 8);
const env = { WEB_ROOT_ORIGIN: "http://localhost:3000" } as unknown as ApiEnv;

class CapturingMail implements MailSender {
  sent: PlainEmail[] = [];
  async sendInvitation(): Promise<void> {}
  async send(email: PlainEmail): Promise<void> {
    this.sent.push(email);
  }
}

let ownerDb: Database;
let ownerPool: pg.Pool;
let control: ReturnType<typeof createDb>;
let appDb: Database;
let appPool: pg.Pool;
let mail: CapturingMail;
let leads: LeadsService;
const operator: PlatformMe = { id: PLATFORM_ADMIN.id, email: PLATFORM_ADMIN.email, fullName: PLATFORM_ADMIN.fullName };

const form = (over: Record<string, unknown> = {}) =>
  createLeadSchema.parse({
    fullName: "Mariana Club",
    email: `mariana-${RUN}@club.test`,
    orgName: `Club Atlético ${RUN}`,
    orgKind: "club",
    role: "coordinacion",
    athletes: "101_300",
    message: "  Somos tres nutricionistas para inferiores.  ",
    consent: true,
    ...over,
  });

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  control = createDb(controlUrl());
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  mail = new CapturingMail();
  leads = new LeadsService(new AdminDbService(control.db), mail, env);
});

afterAll(async () => {
  await ownerDb?.delete(salesLeads).where(like(salesLeads.orgName, `%${RUN}%`));
  await appPool?.end();
  await ownerPool?.end();
  await control?.pool.end();
});

describe("formulario", () => {
  it("exige consentimiento, email válido y valores de las listas", () => {
    expect(() => form({ consent: false })).toThrow();
    expect(() => form({ email: "no-es-un-email" })).toThrow();
    expect(() => form({ orgKind: "hospital" })).toThrow();
    expect(() => form({ message: "x".repeat(1001) })).toThrow();
  });

  it("normaliza: email en minúsculas, mensaje recortado y vacío → null", () => {
    const f = form({ email: "  Mariana@Club.TEST " });
    expect(f.email).toBe("mariana@club.test");
    expect(f.message).toBe("Somos tres nutricionistas para inferiores.");
    expect(form({ message: "   " }).message).toBeNull();
  });
});

describe("alta pública", () => {
  it("guarda la consulta, acusa recibo y avisa a los operadores sin el mensaje", async () => {
    mail.sent = [];
    expect(await leads.create(form())).toBe(true);
    const [row] = await ownerDb.select().from(salesLeads).where(eq(salesLeads.email, `mariana-${RUN}@club.test`));
    expect(row).toMatchObject({ status: "new", orgKind: "club", athletes: "101_300", handledBy: null });
    expect(row!.consentAt).toBeInstanceOf(Date);

    const ack = mail.sent.find((m) => m.to === `mariana-${RUN}@club.test`)!;
    expect(ack.subject).toContain("Recibimos tu consulta");
    const op = mail.sent.find((m) => m.to === PLATFORM_ADMIN.email)!;
    expect(op.subject).toContain(`Club Atlético ${RUN}`);
    for (const m of mail.sent) expect(m.text).not.toContain("tres nutricionistas");
  });

  it("con el campo trampa lleno no guarda ni manda nada", async () => {
    mail.sent = [];
    const email = `bot-${RUN}@spam.test`;
    expect(await leads.create(form({ email, website: "http://spam.test" }))).toBe(false);
    expect(await ownerDb.select().from(salesLeads).where(eq(salesLeads.email, email))).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("consola de plataforma", () => {
  it("lista por estado y registra quién la marcó", async () => {
    const mine = (await leads.list("new")).find((l) => l.orgName === `Club Atlético ${RUN}`)!;
    expect(mine).toBeDefined();
    const done = await leads.setStatus(mine.id, "contacted", operator);
    expect(done).toMatchObject({ status: "contacted", handledBy: PLATFORM_ADMIN.fullName });
    expect((await leads.list("new")).some((l) => l.id === mine.id)).toBe(false);
    expect((await leads.list("contacted")).some((l) => l.id === mine.id)).toBe(true);
  });

  it("una consulta que no existe da 404", async () => {
    await expect(leads.setStatus("00000000-0000-0000-0000-000000000000", "closed", operator)).rejects.toThrow(
      "No existe esa consulta.",
    );
  });
});

describe("plano de control", () => {
  it("el rol app no puede leer la tabla, ni con un tenant fijado", async () => {
    await expect(withTenant(appDb, SEED.orgDemo.id, (tx) => tx.select().from(salesLeads).limit(1))).rejects.toThrow();
  });

  it("la base rechaza valores fuera de las listas", async () => {
    await expect(
      ownerDb.insert(salesLeads).values({
        fullName: "Prueba",
        email: `x-${RUN}@club.test`,
        orgName: `Club ${RUN}`,
        orgKind: "hospital",
        role: "otro",
        athletes: "hasta_30",
        consentAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});
