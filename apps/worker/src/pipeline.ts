import { withTenant, type Database } from "@nutreitor/db";
import { sql } from "drizzle-orm";

import type { EmailChannel } from "./channels/email.js";
import { webUrl } from "./config.js";
import { adherenceReminders } from "./scans/adherence-reminders.js";
import { appointmentReminders } from "./scans/appointment-reminders.js";
import type { Scan } from "./scans/types.js";
import { unreadMessages } from "./scans/unread-messages.js";

export const SCANS: Scan[] = [appointmentReminders, unreadMessages, adherenceReminders];

/** Lo que viaja en el job de entrega (se borra de Redis al completarse). */
export interface Delivery {
  tenantId: string;
  notificationId: string;
  to: string;
  fromName: string;
  subject: string;
  text: string;
}

/** Ids de consultorios: lo único cross-tenant (función SECURITY DEFINER, sólo ids). */
export async function tenantIds(db: Database): Promise<string[]> {
  const res = await db.execute(sql`select worker_tenant_ids() as id`);
  return (res.rows as { id: string }[]).map((r) => r.id);
}

/**
 * Escanea un consultorio bajo RLS: genera los avisos que correspondan, los registra
 * (UNIQUE → una vez) y los encola DENTRO de la transacción: si encolar falla, se
 * hace rollback y el próximo escaneo reintenta; si el commit falla después de
 * encolar, la entrega no encuentra el registro y no manda nada.
 */
export async function scanTenant(
  db: Database,
  tenantId: string,
  now: Date,
  opts: { webUrlTemplate: string; enqueue: (d: Delivery[]) => Promise<void>; scans?: Scan[] },
): Promise<Delivery[]> {
  return withTenant(db, tenantId, async (tx) => {
    const [org] = (
      await tx.execute(sql`select slug, coalesce(display_name, name) as name, region from organizations limit 1`)
    ).rows as { slug: string; name: string; region: string }[];
    if (!org) return [];
    const ctx = { tx, now, org, link: (path: string) => webUrl(opts.webUrlTemplate, org.slug, path) };
    const deliveries: Delivery[] = [];
    for (const scan of opts.scans ?? SCANS) {
      for (const c of await scan(ctx)) {
        const res = await tx.execute(sql`
          insert into notifications (tenant_id, region, kind, ref_key, recipient_user_id, recipient_email)
          values (${tenantId}, ${org.region}::region, ${c.kind}::notification_kind, ${c.refKey},
                  ${c.recipientUserId}, ${c.email})
          on conflict on constraint notifications_once do nothing
          returning id`);
        const id = (res.rows[0] as { id: string } | undefined)?.id;
        if (id) deliveries.push({ tenantId, notificationId: id, to: c.email, fromName: org.name, ...c.message });
      }
    }
    if (deliveries.length) await opts.enqueue(deliveries);
    return deliveries;
  });
}

/**
 * Entrega un aviso. Si el registro no existe o ya se mandó, no hace nada. Si el
 * envío falla, registra el intento y relanza FUERA de la transacción (si no, el
 * rollback borraría el intento) para que BullMQ reintente con backoff; en el último
 * intento lo marca `failed`.
 */
export async function deliver(
  db: Database,
  email: EmailChannel,
  d: Delivery,
  final: boolean,
): Promise<"sent" | "skipped" | "failed"> {
  let error: unknown = null;
  const outcome = await withTenant(db, d.tenantId, async (tx) => {
    const res = await tx.execute(
      sql`select id from notifications where id = ${d.notificationId} and status = 'pending' for update`,
    );
    if (!res.rows.length) return "skipped" as const;
    try {
      await email.send({ to: d.to, fromName: d.fromName, subject: d.subject, text: d.text });
    } catch (err) {
      error = err;
      await tx.execute(sql`
        update notifications set attempts = attempts + 1, error = ${String(err).slice(0, 500)},
               status = ${final ? "failed" : "pending"}::notification_status
        where id = ${d.notificationId}`);
      return "failed" as const;
    }
    await tx.execute(sql`
      update notifications set status = 'sent', sent_at = now(), attempts = attempts + 1, error = null
      where id = ${d.notificationId}`);
    return "sent" as const;
  });
  if (error && !final) throw error;
  return outcome;
}
