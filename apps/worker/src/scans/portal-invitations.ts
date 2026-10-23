import { createHash, randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";

import { portalInvitation } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Tope por escaneo y consultorio: el resto sale en el próximo (SES va limitado igual). */
const BATCH = 500;

type Row = { id: string; email: string; patient_name: string | null };

/**
 * Invitaciones al portal del import en lote (KAN-43, ADR 0043). La API las deja
 * pendientes y marcadas (`queued_at`) sin mandar nada; acá se toman las que todavía
 * no tienen aviso, se genera el token (en la base sólo vive su hash) y se renueva
 * el vencimiento desde el envío. `FOR UPDATE SKIP LOCKED`: dos réplicas del worker
 * no toman la misma; el UNIQUE de `notifications` la manda una sola vez.
 */
export async function portalInvitations({ tx, now, org, link, inviteTtlDays }: ScanContext): Promise<Candidate[]> {
  const res = await tx.execute(sql`
    select i.id, i.email, p.full_name as patient_name
    from invitations i
    left join patients p on p.id = i.patient_id
    where i.status = 'pending' and i.queued_at is not null and i.expires_at > ${now.toISOString()}
      and not exists (
        select 1 from notifications n
        where n.kind = 'portal_invitation' and n.ref_key = i.id::text
      )
    order by i.queued_at
    limit ${BATCH}
    for update of i skip locked`);
  const rows = res.rows as Row[];
  const expires = new Date(now.getTime() + inviteTtlDays * 86_400_000);
  const out: Candidate[] = [];
  for (const r of rows) {
    const raw = randomBytes(32).toString("hex");
    await tx.execute(sql`
      update invitations
      set token_hash = ${createHash("sha256").update(raw).digest("hex")}, expires_at = ${expires.toISOString()}
      where id = ${r.id}`);
    out.push({
      kind: "portal_invitation",
      refKey: r.id,
      recipientUserId: null,
      email: r.email,
      message: portalInvitation({
        patientName: r.patient_name ?? r.email,
        orgName: org.name,
        link: link(`/accept?token=${raw}`),
        ttlDays: inviteTtlDays,
      }),
    });
  }
  return out;
}
