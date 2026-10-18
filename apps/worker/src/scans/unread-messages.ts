import { sql } from "drizzle-orm";

import { unreadMessage } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Se avisa si un mensaje sigue sin leer después de esto… */
export const UNREAD_AFTER_MIN = 15;
/** …y sólo por mensajes recientes (no se despiertan conversaciones viejas). */
const LOOKBACK_H = 48;

type Row = {
  conversation_id: string;
  kind: "patient_professional" | "professional_admin";
  patient_id: string | null;
  recipient_membership_id: string;
  recipient_role: "admin" | "professional" | "patient";
  user_id: string;
  email: string;
  recipient_name: string;
  from_name: string;
  last_read_at: Date | string | null;
};

/**
 * Mensaje sin leer → aviso SIN contenido a quien participa de la conversación
 * (ADR 0024): paciente ↔ su profesional; profesional ↔ admins. Nunca a alguien de
 * afuera (la admin no recibe avisos del chat clínico). Un aviso por "ráfaga": la
 * llave incluye hasta dónde había leído el destinatario.
 */
export async function unreadMessages({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - UNREAD_AFTER_MIN * 60_000).toISOString();
  const since = new Date(now.getTime() - LOOKBACK_H * 3_600_000).toISOString();

  const res = await tx.execute(sql`
    with participants as (
      -- paciente ↔ profesional: el profesional (con asignación activa) y el paciente
      select c.id as conversation_id, c.kind, c.patient_id, pm.id as membership_id
      from conversations c join memberships pm on pm.id = c.professional_membership_id and pm.revoked_at is null
      where c.kind = 'patient_professional'
        and exists (select 1 from care_assignments ca where ca.patient_id = c.patient_id
                    and ca.membership_id = c.professional_membership_id and ca.status = 'active')
      union all
      select c.id, c.kind, c.patient_id, mm.id
      from conversations c
      join patients p on p.id = c.patient_id and p.archived_at is null and p.user_id is not null
      join memberships mm on mm.user_id = p.user_id and mm.role = 'patient' and mm.revoked_at is null
      where c.kind = 'patient_professional'
      union all
      -- profesional ↔ administración: el profesional y cada admin activa
      select c.id, c.kind, null, c.professional_membership_id
      from conversations c join memberships pm on pm.id = c.professional_membership_id and pm.revoked_at is null
      where c.kind = 'professional_admin'
      union all
      select c.id, c.kind, null, am.id
      from conversations c join memberships am on am.role = 'admin' and am.revoked_at is null
      where c.kind = 'professional_admin'
    )
    select pa.conversation_id, pa.kind, pa.patient_id, pa.membership_id as recipient_membership_id,
           rm.role as recipient_role, ru.id as user_id, ru.email, ru.full_name as recipient_name,
           (array_agg(au.full_name order by msg.created_at desc))[1] as from_name,
           rd.last_read_at
    from participants pa
    join memberships rm on rm.id = pa.membership_id
    join users ru on ru.id = rm.user_id
    join messages msg on msg.conversation_id = pa.conversation_id
                     and msg.author_membership_id <> pa.membership_id
    join memberships am on am.id = msg.author_membership_id
    join users au on au.id = am.user_id
    left join conversation_reads rd on rd.conversation_id = pa.conversation_id and rd.membership_id = pa.membership_id
    where msg.created_at >= ${since} and msg.created_at <= ${cutoff}
      and msg.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
      -- entre admins no se avisan mensajes de otra admin
      and not (rm.role = 'admin' and am.role = 'admin')
    group by pa.conversation_id, pa.kind, pa.patient_id, pa.membership_id, rm.role, ru.id, ru.email, ru.full_name, rd.last_read_at`);

  return (res.rows as Row[]).map((r) => ({
    kind: "unread_message",
    refKey: `${r.conversation_id}:${r.recipient_membership_id}:${r.last_read_at ? new Date(r.last_read_at).toISOString() : "never"}`,
    recipientUserId: r.user_id,
    email: r.email,
    message: unreadMessage({
      recipientName: r.recipient_name,
      fromName: r.from_name,
      orgName: org.name,
      link: link(pathFor(r)),
    }),
  }));
}

function pathFor(r: Row): string {
  if (r.recipient_role === "patient") return `/app/mensajes?c=${r.conversation_id}`;
  if (r.recipient_role === "admin") return `/admin/messages?c=${r.conversation_id}`;
  return r.kind === "patient_professional"
    ? `/pro/patients/${r.patient_id}?tab=mensajes`
    : `/pro/messages?c=${r.conversation_id}`;
}
