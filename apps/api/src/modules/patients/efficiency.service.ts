import { ForbiddenException, Injectable } from "@nestjs/common";
import type { EfficiencyDto, ProfessionalEfficiencyDto } from "@nutreitor/shared";
import { sql } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth } from "../../core/tenant/tenant-context.store.js";
import { resolvePatientAccess } from "./patient-access.js";

type Row = {
  membership_id: string;
  name: string;
  active_patients: number;
  plans_saved: number;
  plans_measured: number;
  plan_median_sec: number | null;
  src_scratch: number;
  src_previous: number;
  src_template: number;
  src_nutri: number;
  adherence_pct: number | null;
  adherence_logs: number;
  replies_answered: number;
  replies_pending: number;
  reply_median_sec: number | null;
};

/**
 * Métricas de eficiencia (Fase 4.4) por profesional, sobre los últimos `days`:
 * armado de planes (mediana de minutos y desde qué se partió), pacientes activos,
 * adherencia de sus pacientes y tiempo de respuesta en sus conversaciones. La admin
 * ve a todo el equipo; el profesional, sólo su fila.
 */
@Injectable()
export class EfficiencyService {
  constructor(private readonly tenantDb: TenantDbService) {}

  forSession(days: number): Promise<EfficiencyDto> {
    return this.tenantDb.run(async (tx) => {
      const { user } = getAuth();
      const { membershipId } = await resolvePatientAccess(tx);
      if (!membershipId || (user.role !== "admin" && user.role !== "professional")) {
        throw new ForbiddenException();
      }
      const onlyMe = user.role === "professional" ? membershipId : null;
      const from = new Date(Date.now() - days * 86_400_000);
      const fromIso = from.toISOString();
      const fromDate = fromIso.slice(0, 10);

      const res = await tx.execute(sql`
        with pros as (
          select m.id, u.full_name as name from memberships m join users u on u.id = m.user_id
          where m.role = 'professional' and m.revoked_at is null
            and (${onlyMe}::uuid is null or m.id = ${onlyMe}::uuid)
        ),
        active as (
          select ca.membership_id as mid, count(distinct ca.patient_id)::int as n
          from care_assignments ca join patients p on p.id = ca.patient_id and p.archived_at is null
          where ca.status = 'active' group by 1
        ),
        plans as (
          select author_membership_id as mid, count(*)::int as saved,
                 count(edit_seconds)::int as measured,
                 percentile_cont(0.5) within group (order by edit_seconds) as median_sec,
                 count(*) filter (where drafted_from = 'scratch')::int as scratch,
                 count(*) filter (where drafted_from = 'previous')::int as previous,
                 count(*) filter (where drafted_from = 'template')::int as template,
                 count(*) filter (where drafted_from = 'nutri')::int as nutri
          from meal_plans where created_at >= ${fromIso} group by 1
        ),
        adh as (
          select ca.membership_id as mid, count(*)::int as logs,
                 round(100 * avg(case l.status when 'done' then 1 when 'partial' then 0.5 else 0 end))::int as pct
          from adherence_meal_logs l
          join care_assignments ca on ca.patient_id = l.patient_id and ca.status = 'active'
          where l.date >= ${fromDate}::date group by 1
        ),
        msgs as (
          select x.conversation_id, x.created_at, c.professional_membership_id as mid,
                 (x.author_membership_id = c.professional_membership_id) as from_pro,
                 lag(x.author_membership_id = c.professional_membership_id)
                   over (partition by x.conversation_id order by x.created_at) as prev_from_pro
          from messages x join conversations c on c.id = x.conversation_id and c.kind = 'patient_professional'
        ),
        -- Primer mensaje de cada "ráfaga" del paciente → cuánto tardó la respuesta.
        bursts as (
          select b.mid,
                 extract(epoch from (select min(r.created_at) from msgs r
                                     where r.conversation_id = b.conversation_id and r.from_pro
                                       and r.created_at > b.created_at) - b.created_at) as secs
          from msgs b
          where not b.from_pro and coalesce(b.prev_from_pro, true) and b.created_at >= ${fromIso}
        ),
        replies as (
          select mid, count(secs)::int as answered, (count(*) - count(secs))::int as pending,
                 percentile_cont(0.5) within group (order by secs) as median_sec
          from bursts group by 1
        )
        select pros.id as membership_id, pros.name,
               coalesce(active.n, 0) as active_patients,
               coalesce(plans.saved, 0) as plans_saved, coalesce(plans.measured, 0) as plans_measured,
               plans.median_sec as plan_median_sec,
               coalesce(plans.scratch, 0) as src_scratch, coalesce(plans.previous, 0) as src_previous,
               coalesce(plans.template, 0) as src_template, coalesce(plans.nutri, 0) as src_nutri,
               adh.pct as adherence_pct, coalesce(adh.logs, 0) as adherence_logs,
               coalesce(replies.answered, 0) as replies_answered, coalesce(replies.pending, 0) as replies_pending,
               replies.median_sec as reply_median_sec
        from pros
        left join active on active.mid = pros.id
        left join plans on plans.mid = pros.id
        left join adh on adh.mid = pros.id
        left join replies on replies.mid = pros.id
        order by pros.name`);

      const min = (s: number | null) => (s == null ? null : Math.round((Number(s) / 60) * 10) / 10);
      return {
        days,
        from: fromIso,
        professionals: (res.rows as Row[]).map(
          (r): ProfessionalEfficiencyDto => ({
            membershipId: r.membership_id,
            name: r.name,
            activePatients: Number(r.active_patients),
            plans: {
              saved: Number(r.plans_saved),
              measured: Number(r.plans_measured),
              medianMinutes: min(r.plan_median_sec),
              bySource: {
                scratch: Number(r.src_scratch),
                previous: Number(r.src_previous),
                template: Number(r.src_template),
                nutri: Number(r.src_nutri),
              },
            },
            adherence: { pct: r.adherence_pct == null ? null : Number(r.adherence_pct), logs: Number(r.adherence_logs) },
            replies: {
              medianMinutes: min(r.reply_median_sec),
              answered: Number(r.replies_answered),
              pending: Number(r.replies_pending),
            },
          }),
        ),
      };
    });
  }
}
