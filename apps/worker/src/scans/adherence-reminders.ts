import { sql } from "drizzle-orm";
import { DateTime } from "luxon";

import { adherenceReminder } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

type Row = {
  user_id: string;
  email: string;
  full_name: string;
  patient_id: string;
  hour: number;
  timezone: string;
};

/**
 * Recordatorio diario (opt-in del paciente): pasada su hora local, si tiene plan
 * activo y no marcó ninguna comida del día. Uno por paciente y fecha.
 */
export async function adherenceReminders({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const res = await tx.execute(sql`
    select np.user_id, u.email, u.full_name, p.id as patient_id,
           np.adherence_reminder_hour as hour, np.timezone
    from notification_preferences np
    join users u on u.id = np.user_id
    join patients p on p.user_id = np.user_id and p.archived_at is null
    where np.adherence_reminder
      and exists (select 1 from meal_plans mp where mp.patient_id = p.id and mp.status = 'active')`);
  const out: Candidate[] = [];
  for (const r of res.rows as Row[]) {
    const local = DateTime.fromJSDate(now).setZone(r.timezone);
    if (!local.isValid || local.hour < r.hour) continue;
    const date = local.toISODate()!;
    const logged = await tx.execute(
      sql`select 1 from adherence_meal_logs where patient_id = ${r.patient_id} and date = ${date} limit 1`,
    );
    if (logged.rows.length) continue;
    out.push({
      kind: "adherence_reminder",
      refKey: `${r.patient_id}:${date}`,
      recipientUserId: r.user_id,
      email: r.email,
      message: adherenceReminder({ patientName: r.full_name, orgName: org.name, link: link("/app") }),
    });
  }
  return out;
}
