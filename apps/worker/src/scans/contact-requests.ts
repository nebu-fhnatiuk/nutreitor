import { sql } from "drizzle-orm";

import { contactRequestReceived } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Sólo solicitudes recientes (no se avisa de lo viejo al activar el worker). */
const LOOKBACK_H = 48;

type Row = { id: string; role: "admin" | "professional"; user_id: string; email: string; full_name: string };

/**
 * Solicitud de contacto nueva → aviso a su destinatario (ADR 0027), sin el
 * contenido: al profesional si es para él; a las admins si es para el consultorio.
 */
export async function contactRequests({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const since = new Date(now.getTime() - LOOKBACK_H * 3_600_000).toISOString();
  const res = await tx.execute(sql`
    select cr.id, m.role, u.id as user_id, u.email, u.full_name
    from contact_requests cr
    join memberships m on m.revoked_at is null
      and (m.id = cr.membership_id or (cr.membership_id is null and m.role = 'admin'))
    join users u on u.id = m.user_id
    where cr.status = 'new' and cr.created_at >= ${since}`);
  return (res.rows as Row[]).map((r) => ({
    kind: "contact_request" as const,
    refKey: r.id,
    recipientUserId: r.user_id,
    email: r.email,
    message: contactRequestReceived({
      recipientName: r.full_name,
      orgName: org.name,
      // En una org individual /admin/requests redirige a /pro/requests.
      link: link(r.role === "admin" ? "/admin/requests" : "/pro/requests"),
    }),
  }));
}
