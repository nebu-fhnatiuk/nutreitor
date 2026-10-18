import { createDb } from "@nutreitor/db";
import { Queue, Worker, type Job } from "bullmq";

import { ConsoleEmail, SesEmail, type EmailChannel } from "./channels/email.js";
import { loadConfig } from "./config.js";
import { deliver, scanTenant, tenantIds, type Delivery } from "./pipeline.js";

/**
 * Worker de notificaciones (Fase 4.3, ADR 0023). Una cola BullMQ en Redis:
 *  - `scan` (programado cada SCAN_EVERY_MS): recorre los consultorios bajo RLS y
 *    genera recordatorios de turno, avisos de mensajes sin leer y recordatorios de
 *    registro diario;
 *  - `deliver`: manda cada aviso (reintentos con backoff exponencial).
 */
const cfg = loadConfig();
const { db, pool } = createDb(cfg.DATABASE_WORKER_URL);
const connection = { url: cfg.REDIS_URL, maxRetriesPerRequest: null };
const email: EmailChannel = cfg.MAIL_PROVIDER === "ses" ? new SesEmail(cfg.AWS_REGION, cfg.MAIL_FROM) : new ConsoleEmail();

const QUEUE = "notifications";
const DELIVER_ATTEMPTS = 5;
const queue = new Queue(QUEUE, { connection });

async function enqueue(deliveries: Delivery[]): Promise<void> {
  await queue.addBulk(
    deliveries.map((d) => ({
      name: "deliver",
      data: d,
      opts: {
        // Mismo aviso → mismo job: si se encola dos veces, BullMQ lo deduplica.
        jobId: d.notificationId,
        attempts: DELIVER_ATTEMPTS,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    })),
  );
}

async function runScan(): Promise<number> {
  const now = new Date();
  let total = 0;
  for (const tenantId of await tenantIds(db)) {
    try {
      total += (await scanTenant(db, tenantId, now, { webUrlTemplate: cfg.WEB_URL_TEMPLATE, enqueue })).length;
    } catch (err) {
      // Un consultorio con problemas no frena a los demás; el próximo escaneo reintenta.
      console.error(`[worker] scan tenant=${tenantId} falló: ${String(err)}`);
    }
  }
  return total;
}

const worker = new Worker(
  QUEUE,
  async (job: Job) => {
    if (job.name === "scan") {
      const n = await runScan();
      if (n) console.log(`[worker] scan: ${n} aviso(s) encolado(s)`);
      return n;
    }
    if (job.name === "deliver") {
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      return deliver(db, email, job.data as Delivery, final);
    }
    throw new Error(`job desconocido: ${job.name}`);
  },
  { connection, concurrency: 4 },
);
worker.on("failed", (job, err) => console.warn(`[worker] ${job?.name} ${job?.id} falló: ${err.message}`));

await queue.upsertJobScheduler("scan", { every: cfg.SCAN_EVERY_MS }, { name: "scan" });
console.log(`[worker] listo · mail=${cfg.MAIL_PROVIDER} · scan cada ${Math.round(cfg.SCAN_EVERY_MS / 1000)} s`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal}: cerrando…`);
  await worker.close();
  await queue.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
