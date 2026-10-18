import { createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EmailChannel, EmailMessage } from "../src/channels/email.js";
import { deliver, scanTenant, tenantIds, type Delivery } from "../src/pipeline.js";

/**
 * Worker de notificaciones (ADR 0023) contra Postgres real, con el rol
 * `nutreitor_worker` (sin BYPASSRLS): genera los tres avisos, una sola vez, sin
 * contenido del chat, con rollback si falla el encolado y reintentos al entregar.
 */
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const WORKER_URL = process.env.DATABASE_WORKER_URL!;
const TENANT = SEED.orgDemo.id;
const D1 = "00000000-0000-0000-0000-0000000000d1";
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const PATIENT_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c3";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3";
const SECRET_BODY = "contenido-privado-del-chat";

let owner: Database;
let ownerPool: pg.Pool;
let worker: Database;
let workerPool: pg.Pool;
let appointmentId: string;
const now = new Date();
const opts = (enqueue: (d: Delivery[]) => Promise<void> = async () => {}) => ({
  webUrlTemplate: "http://{slug}.localhost:3000",
  enqueue,
});

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  ({ db: worker, pool: workerPool } = createDb(WORKER_URL));

  // Turno de mañana para d1 (se liberan solapes de corridas previas).
  const starts = new Date(now.getTime() + 24 * 3_600_000);
  await owner.execute(sql`update appointments set status = 'cancelled'
    where membership_id = ${PRO_MEMBERSHIP} and status = 'booked'
      and starts_at < ${new Date(starts.getTime() + 3_600_000).toISOString()}
      and ends_at > ${new Date(starts.getTime() - 3_600_000).toISOString()}`);
  const a = await owner.execute(sql`insert into appointments (tenant_id, region, patient_id, membership_id, starts_at, ends_at)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${D1}, ${PRO_MEMBERSHIP},
            ${starts.toISOString()}, ${new Date(starts.getTime() + 30 * 60_000).toISOString()}) returning id`);
  appointmentId = (a.rows[0] as { id: string }).id;

  // Mensaje del paciente de hace 20 min, sin leer por el profesional.
  await owner.execute(sql`insert into message_reads (tenant_id, region, patient_id, membership_id, last_read_at)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${D1}, ${PRO_MEMBERSHIP}, ${new Date(now.getTime() - 3_600_000).toISOString()})
    on conflict (patient_id, membership_id) do update set last_read_at = excluded.last_read_at`);
  await owner.execute(sql`insert into patient_messages (tenant_id, region, patient_id, author_membership_id, body, created_at)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${D1}, ${PATIENT_MEMBERSHIP}, ${SECRET_BODY},
            ${new Date(now.getTime() - 20 * 60_000).toISOString()})`);
  // Y el paciente leyó todo lo del equipo (para no mezclar avisos en sentido contrario).
  await owner.execute(sql`insert into message_reads (tenant_id, region, patient_id, membership_id, last_read_at)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${D1}, ${PATIENT_MEMBERSHIP}, now())
    on conflict (patient_id, membership_id) do update set last_read_at = now()`);

  // Recordatorio diario activo (hora 0 en UTC: siempre "pasada"), plan activo y sin registros hoy.
  await owner.execute(sql`insert into notification_preferences (tenant_id, region, user_id, adherence_reminder, adherence_reminder_hour, timezone)
    values (${TENANT}, ${SEED.orgDemo.region}::region, ${PATIENT_USER}, true, 0, 'UTC')
    on conflict (tenant_id, user_id) do update set adherence_reminder = true, adherence_reminder_hour = 0, timezone = 'UTC'`);
  const plan = await owner.execute(sql`select 1 from meal_plans where patient_id = ${D1} and status = 'active'`);
  if (!plan.rows.length) {
    await owner.execute(sql`insert into meal_plans (tenant_id, region, patient_id, author_membership_id, version, title, body)
      values (${TENANT}, ${SEED.orgDemo.region}::region, ${D1}, ${PRO_MEMBERSHIP}, 1, 'Plan worker', '{"layout":"day","day":{"meals":[]}}'::jsonb)`);
  }
  const today = now.toISOString().slice(0, 10);
  await owner.execute(sql`delete from adherence_meal_logs where patient_id = ${D1} and date = ${today}`);
  await owner.execute(sql`delete from notifications where kind = 'adherence_reminder' and ref_key = ${`${D1}:${today}`}`);
});

afterAll(async () => {
  await owner?.execute(sql`update appointments set status = 'cancelled' where id = ${appointmentId}`);
  await owner?.execute(sql`update notification_preferences set adherence_reminder = false where user_id = ${PATIENT_USER}`);
  await workerPool?.end();
  await ownerPool?.end();
});

const mine = (ds: Delivery[]) => ({
  appointment: ds.find((d) => d.subject.startsWith("Recordatorio: tu turno")),
  unread: ds.find((d) => d.subject.startsWith("Tenés un mensaje nuevo") && d.to === "pro@demo.test"),
  adherence: ds.find((d) => d.subject === "¿Cómo te fue hoy con tu plan?"),
});

describe("Worker — generación", () => {
  it("si encolar falla, no queda registrado nada (rollback) y el próximo escaneo reintenta", async () => {
    await expect(
      scanTenant(worker, TENANT, now, opts(async () => { throw new Error("redis caído"); })),
    ).rejects.toThrow(/redis caído/);
    const n = await owner.execute(sql`select count(*)::int as n from notifications where ref_key = ${appointmentId}`);
    expect((n.rows[0] as { n: number }).n).toBe(0);
  });

  let deliveries: Delivery[] = [];
  it("genera recordatorio de turno, aviso de mensaje sin contenido y recordatorio diario", async () => {
    deliveries = await scanTenant(worker, TENANT, now, opts());
    const { appointment, unread, adherence } = mine(deliveries);
    expect(appointment).toMatchObject({ to: "patient@demo.test", fromName: expect.any(String) });
    expect(appointment!.text).toMatch(/mañana a las \d{2}:\d{2} con Profesional Demo/);
    expect(unread!.text).toContain("Paciente Demo Uno te escribió");
    expect(unread!.text).not.toContain(SECRET_BODY);
    expect(unread!.text).toContain(`/pro/patients/${D1}?tab=mensajes`);
    expect(adherence).toMatchObject({ to: "patient@demo.test" });
  });

  it("es idempotente: un segundo escaneo no repite avisos", async () => {
    const again = mine(await scanTenant(worker, TENANT, now, opts()));
    expect(again).toEqual({ appointment: undefined, unread: undefined, adherence: undefined });
  });

  it("entrega: manda una vez; reintenta si falla y al final queda `failed`", async () => {
    const sent: EmailMessage[] = [];
    const ok: EmailChannel = { send: async (m) => void sent.push(m) };
    const broken: EmailChannel = { send: async () => { throw new Error("SES 500"); } };
    const { appointment, unread } = mine(deliveries);

    expect(await deliver(worker, ok, appointment!, false)).toBe("sent");
    expect(await deliver(worker, ok, appointment!, false)).toBe("skipped");
    expect(sent).toHaveLength(1);

    await expect(deliver(worker, broken, unread!, false)).rejects.toThrow(/SES 500/);
    let row = (await owner.execute(sql`select status, attempts from notifications where id = ${unread!.notificationId}`)).rows[0];
    expect(row).toEqual({ status: "pending", attempts: 1 });
    expect(await deliver(worker, broken, unread!, true)).toBe("failed");
    row = (await owner.execute(sql`select status, attempts from notifications where id = ${unread!.notificationId}`)).rows[0];
    expect(row).toEqual({ status: "failed", attempts: 2 });
  });
});

describe("Worker — aislamiento", () => {
  it("sólo ve ids de consultorios; sin tenant fijado no ve ningún dato (RLS)", async () => {
    expect(await tenantIds(worker)).toContain(TENANT);
    const res = await worker.execute(sql`select count(*)::int as n from patients`);
    expect((res.rows[0] as { n: number }).n).toBe(0);
  });

  it("no puede modificar datos clínicos ni leer tablas fuera de su GRANT", async () => {
    await expect(worker.execute(sql`update patients set full_name = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(worker.execute(sql`select * from patient_notes`)).rejects.toThrow(/permission denied/);
    await expect(worker.execute(sql`select * from organizations`)).resolves.toBeDefined(); // RLS: 0 filas sin tenant
  });
});
