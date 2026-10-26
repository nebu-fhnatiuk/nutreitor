import { createHash, randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";

import { portalInvitation, portalInvitationWithIntake } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Tope por escaneo y consultorio: el resto sale en el próximo (SES va limitado igual). */
const BATCH = 500;

type Row = { id: string; email: string; patient_name: string | null; intake_id: string | null; pro_name: string | null };

/**
 * Invitaciones al portal del import en lote (KAN-43, ADR 0043). La API las deja
 * pendientes y marcadas (`queued_at`) sin mandar nada; acá se toman las que todavía
 * no tienen aviso, se genera el token (en la base sólo vive su hash) y se renueva
 * el vencimiento desde el envío. `FOR UPDATE SKIP LOCKED`: dos réplicas del worker
 * no toman la misma; el UNIQUE de `notifications` la manda una sola vez.
 */
export async function portalInvitations({ tx, now, org, link, inviteTtlDays }: ScanContext): Promise<Candidate[]> {
  const res = await tx.execute(sql`
    select i.id, i.email, p.full_name as patient_name, ir.id as intake_id, pu.full_name as pro_name
    from invitations i
    left join patients p on p.id = i.patient_id
    -- Anamnesis automática antes de la primera consulta (KAN-90): viaja en este mail.
    left join lateral (
      select x.id, x.requested_by_membership_id from intake_requests x
      where x.patient_id = i.patient_id and x.status = 'requested' and x.kind = 'anamnesis'
      order by x.created_at desc limit 1
    ) ir on true
    left join memberships m on m.id = ir.requested_by_membership_id
    left join users pu on pu.id = m.user_id
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
      message: r.intake_id
        ? portalInvitationWithIntake({
            patientName: r.patient_name ?? r.email,
            orgName: org.name,
            professionalName: r.pro_name ?? org.name,
            link: link(`/accept?token=${raw}&next=${encodeURIComponent(`/app/formularios/${r.intake_id}`)}`),
            ttlDays: inviteTtlDays,
          })
        : portalInvitation({
            patientName: r.patient_name ?? r.email,
            orgName: org.name,
            link: link(`/accept?token=${raw}`),
            ttlDays: inviteTtlDays,
          }),
    });
  }
  return out;
}
