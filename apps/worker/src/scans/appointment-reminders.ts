import { sql } from "drizzle-orm";

import { appointmentReminder } from "../templates.js";
import type { Candidate, ScanContext } from "./types.js";

/** Ventana: turnos que empiezan entre 20 y 26 h desde ahora (tolera escaneos salteados). */
export const REMINDER_FROM_H = 20;
export const REMINDER_TO_H = 26;
const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

type Row = {
  id: string;
  starts_at: Date | string;
  patient_name: string;
  email: string;
  user_id: string | null;
  pro_name: string;
  tz: string | null;
};

/** Recordatorio de turno al paciente (~24 h antes): fecha, hora y profesional. */
export async function appointmentReminders({ tx, now, org, link }: ScanContext): Promise<Candidate[]> {
  const from = new Date(now.getTime() + REMINDER_FROM_H * 3_600_000);
  const to = new Date(now.getTime() + REMINDER_TO_H * 3_600_000);
  const res = await tx.execute(sql`
    select a.id, a.starts_at, p.full_name as patient_name, coalesce(u.email, p.email) as email,
           p.user_id, pu.full_name as pro_name,
           (select ar.timezone from availability_rules ar where ar.membership_id = a.membership_id limit 1) as tz
    from appointments a
    join patients p on p.id = a.patient_id and p.archived_at is null
    left join users u on u.id = p.user_id
    join memberships m on m.id = a.membership_id
    join users pu on pu.id = m.user_id
    where a.status = 'booked'
      and a.starts_at >= ${from.toISOString()} and a.starts_at < ${to.toISOString()}
      and coalesce(u.email, p.email) is not null`);
  return (res.rows as Row[]).map((r) => ({
    kind: "appointment_reminder",
    refKey: r.id,
    recipientUserId: r.user_id,
    email: r.email,
    message: appointmentReminder({
      patientName: r.patient_name,
      professionalName: r.pro_name,
      orgName: org.name,
      startsAt: new Date(r.starts_at),
      timezone: r.tz ?? DEFAULT_TZ,
      now,
      link: link(r.user_id ? "/app" : ""),
    }),
  }));
}
