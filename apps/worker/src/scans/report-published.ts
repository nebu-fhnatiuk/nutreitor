import { sql } from "drizzle-orm";

import { reportPublished } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Sólo reportes publicados hace poco (no se avisa de lo viejo al activar el worker). */
const LOOKBACK_H = 48;

type Row = { id: string; period: string; email: string; user_id: string; full_name: string };

/** Reporte mensual publicado → aviso al paciente con link (sin datos del reporte). */
export async function reportsPublished({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const since = new Date(now.getTime() - LOOKBACK_H * 3_600_000).toISOString();
  const res = await tx.execute(sql`
    select r.id, to_char(r.period, 'YYYY-MM') as period, u.email, u.id as user_id, u.full_name
    from patient_reports r
    join patients p on p.id = r.patient_id and p.archived_at is null
    join users u on u.id = p.user_id
    where r.status = 'published' and r.published_at >= ${since}`);
  return (res.rows as Row[]).map((r) => ({
    kind: "report_published" as const,
    refKey: r.id,
    recipientUserId: r.user_id,
    email: r.email,
    message: reportPublished({ patientName: r.full_name, month: r.period, orgName: org.name, link: link(`/app/reportes/${r.id}`) }),
  }));
}
