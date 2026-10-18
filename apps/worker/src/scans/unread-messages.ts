import { sql } from "drizzle-orm";

import { unreadMessage } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Se avisa si un mensaje sigue sin leer después de esto… */
export const UNREAD_AFTER_MIN = 15;
/** …y sólo por mensajes recientes (no se despiertan conversaciones viejas). */
const LOOKBACK_H = 48;

type Row = {
  patient_id: string;
  membership_id: string;
  user_id: string;
  email: string;
  recipient_name: string;
  from_name: string;
  last_read_at: Date | string | null;
};

/**
 * Mensaje del chat sin leer → aviso SIN contenido al destinatario. Un aviso por
 * "ráfaga": la llave incluye hasta dónde había leído; cuando lee, la próxima
 * ráfaga puede volver a avisar. Paciente → profesionales asignados; equipo → paciente.
 */
export async function unreadMessages({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - UNREAD_AFTER_MIN * 60_000).toISOString();
  const since = new Date(now.getTime() - LOOKBACK_H * 3_600_000).toISOString();

  const toTeam = await tx.execute(sql`
    select p.id as patient_id, rm.id as membership_id, ru.id as user_id, ru.email,
           ru.full_name as recipient_name, p.full_name as from_name, rd.last_read_at
    from patient_messages msg
    join memberships am on am.id = msg.author_membership_id and am.role = 'patient'
    join patients p on p.id = msg.patient_id and p.archived_at is null
    join care_assignments ca on ca.patient_id = p.id and ca.status = 'active'
    join memberships rm on rm.id = ca.membership_id and rm.revoked_at is null
    join users ru on ru.id = rm.user_id
    left join message_reads rd on rd.patient_id = p.id and rd.membership_id = rm.id
    where msg.created_at >= ${since} and msg.created_at <= ${cutoff}
      and msg.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
    group by p.id, rm.id, ru.id, ru.email, ru.full_name, p.full_name, rd.last_read_at`);

  const toPatient = await tx.execute(sql`
    select p.id as patient_id, pm.id as membership_id, pu.id as user_id, pu.email,
           pu.full_name as recipient_name,
           (array_agg(au.full_name order by msg.created_at desc))[1] as from_name,
           rd.last_read_at
    from patient_messages msg
    join memberships am on am.id = msg.author_membership_id and am.role <> 'patient'
    join users au on au.id = am.user_id
    join patients p on p.id = msg.patient_id and p.archived_at is null and p.user_id is not null
    join users pu on pu.id = p.user_id
    join memberships pm on pm.user_id = p.user_id and pm.revoked_at is null
    left join message_reads rd on rd.patient_id = p.id and rd.membership_id = pm.id
    where msg.created_at >= ${since} and msg.created_at <= ${cutoff}
      and msg.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
    group by p.id, pm.id, pu.id, pu.email, pu.full_name, rd.last_read_at`);

  const build = (r: Row, path: string): Candidate => ({
    kind: "unread_message",
    refKey: `${r.patient_id}:${r.membership_id}:${r.last_read_at ? new Date(r.last_read_at).toISOString() : "never"}`,
    recipientUserId: r.user_id,
    email: r.email,
    message: unreadMessage({ recipientName: r.recipient_name, fromName: r.from_name, orgName: org.name, link: link(path) }),
  });
  return [
    ...(toTeam.rows as Row[]).map((r) => build(r, `/pro/patients/${r.patient_id}?tab=mensajes`)),
    ...(toPatient.rows as Row[]).map((r) => build(r, "/app/mensajes")),
  ];
}
