import { createHash } from "node:crypto";

import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deliver, scanTenant, type Delivery } from "../src/pipeline.js";
import { portalInvitations } from "../src/scans/portal-invitations.js";
import type { EmailChannel, EmailMessage } from "../src/channels/email.js";

/**
 * Invitaciones al portal del import en lote (KAN-43, ADR 0043) con el rol
 * `nutreitor_worker`: el token se genera al enviar y coincide con el hash guardado,
 * cada invitación sale una sola vez y las ya aceptadas o sin marcar no salen.
 */
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const WORKER_URL = process.env.DATABASE_WORKER_URL!;
const TENANT = SEED.orgDemo.id;
const RUN = Math.random().toString(36).slice(2, 8);
const now = new Date();

let owner: Database;
let ownerPool: pg.Pool;
let worker: Database;
let workerPool: pg.Pool;
let patientId: string;

const opts = (enqueue: (d: Delivery[]) => Promise<void> = async () => {}) => ({
  webUrlTemplate: "http://{slug}.localhost:3000",
  enqueue,
  scans: [portalInvitations],
  inviteTtlDays: 7,
});

const invite = async (email: string, queued: boolean) => {
  const res = await owner.execute(sql`
    insert into invitations (organization_id, region, email, role, token_hash, status, expires_at, patient_id, queued_at)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${email}, 'patient', ${`placeholder-${email}`}, 'pending',
            ${new Date(now.getTime() + 86_400_000).toISOString()}, ${patientId}, ${queued ? now.toISOString() : null})
    returning id`);
  return (res.rows[0] as { id: string }).id;
};

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  ({ db: worker, pool: workerPool } = createDb(WORKER_URL));
  const p = await owner.execute(sql`
    insert into patients (tenant_id, region, full_name, email)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${`Valentina Import ${RUN}`}, ${`inv-${RUN}@club.test`}) returning id`);
  patientId = (p.rows[0] as { id: string }).id;
});

afterAll(async () => {
  await owner?.execute(sql`delete from notifications where recipient_email like ${`inv-${RUN}%`}`);
  await owner?.execute(sql`delete from invitations where email like ${`inv-${RUN}%`}`);
  await owner?.execute(sql`delete from patients where id = ${patientId}`);
  await workerPool?.end();
  await ownerPool?.end();
});

describe("Worker — invitaciones en lote", () => {
  it("genera el token al enviar: el link trae el token cuyo hash quedó guardado", async () => {
    const id = await invite(`inv-${RUN}@club.test`, true);
    await invite(`inv-${RUN}-sin-marcar@club.test`, false);
    const ds = (await scanTenant(worker, TENANT, now, opts())).filter((d) => d.to.startsWith(`inv-${RUN}`));
    expect(ds).toHaveLength(1);
    const d = ds[0]!;
    expect(d.to).toBe(`inv-${RUN}@club.test`);
    expect(d.subject).toContain("Demo te invita");
    expect(d.text).toContain("Hola Valentina");
    const token = /accept\?token=([0-9a-f]{64})/.exec(d.text)![1]!;
    const row = (await owner.execute(sql`select token_hash, expires_at from invitations where id = ${id}`)).rows[0] as {
      token_hash: string;
      expires_at: Date;
    };
    expect(row.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(now.getTime() + 6 * 86_400_000);
  });

  it("una sola vez: el segundo escaneo no la vuelve a tomar ni cambia el token", async () => {
    const before = (await owner.execute(sql`select token_hash from invitations where email = ${`inv-${RUN}@club.test`}`)).rows[0];
    const ds = (await scanTenant(worker, TENANT, now, opts())).filter((d) => d.to.startsWith(`inv-${RUN}`));
    expect(ds).toHaveLength(0);
    const after = (await owner.execute(sql`select token_hash from invitations where email = ${`inv-${RUN}@club.test`}`)).rows[0];
    expect(after).toEqual(before);
  });

  it("la entrega es idempotente: reintentar un aviso ya enviado no manda otro mail", async () => {
    const id = await invite(`inv-${RUN}-b@club.test`, true);
    const [d] = (await scanTenant(worker, TENANT, now, opts())).filter((x) => x.to === `inv-${RUN}-b@club.test`);
    const sent: EmailMessage[] = [];
    const email: EmailChannel = { send: async (m) => void sent.push(m) };
    expect(await deliver(worker, email, d!, false)).toBe("sent");
    expect(await deliver(worker, email, d!, false)).toBe("skipped");
    expect(sent).toHaveLength(1);
    expect(id).toBeTruthy();
  });

  it("si encolar falla, el token no cambia (rollback) y el próximo escaneo la toma", async () => {
    await invite(`inv-${RUN}-c@club.test`, true);
    const hash = async () => (await owner.execute(sql`select token_hash from invitations where email = ${`inv-${RUN}-c@club.test`}`)).rows[0];
    const before = await hash();
    await expect(scanTenant(worker, TENANT, now, opts(async () => { throw new Error("redis caído"); }))).rejects.toThrow(/redis caído/);
    expect(await hash()).toEqual(before);
    const ds = (await scanTenant(worker, TENANT, now, opts())).filter((d) => d.to === `inv-${RUN}-c@club.test`);
    expect(ds).toHaveLength(1);
  });
});
