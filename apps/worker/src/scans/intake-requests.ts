import { sql } from "drizzle-orm";

import { intakeRequested } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Sólo pedidos recientes (no se avisa de lo viejo al activar el worker). */
const LOOKBACK_H = 48;

type Row = { id: string; kind: "anamnesis" | "food_frequency"; user_id: string; email: string; full_name: string; pro_name: string };

/**
 * Formulario pedido por el profesional (KAN-60) → aviso al deportista, sin el
 * contenido: sólo qué formulario y el link al portal. Una vez por pedido.
 */
export async function intakeRequests({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const since = new Date(now.getTime() - LOOKBACK_H * 3_600_000).toISOString();
  const res = await tx.execute(sql`
    select ir.id, ir.kind, u.id as user_id, u.email, p.full_name, pu.full_name as pro_name
    from intake_requests ir
    join patients p on p.id = ir.patient_id and p.archived_at is null
    join users u on u.id = p.user_id
    join memberships m on m.id = ir.requested_by_membership_id
    join users pu on pu.id = m.user_id
    -- Los que viajan en la invitación al portal ya los avisa ese mail (KAN-90).
    where ir.status = 'requested' and ir.delivery = 'portal' and ir.created_at >= ${since}`);
  return (res.rows as Row[]).map((r) => ({
    kind: "intake_requested" as const,
    refKey: r.id,
    recipientUserId: r.user_id,
    email: r.email,
    message: intakeRequested({
      patientName: r.full_name,
      professionalName: r.pro_name,
      orgName: org.name,
      form: r.kind === "anamnesis" ? "tu anamnesis (salud, entrenamiento y hábitos)" : "el cuestionario de frecuencia de consumo",
      link: link(`/app/formularios/${r.id}`),
    }),
  }));
}
