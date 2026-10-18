import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { memberships, patientReports, patients, users, type TenantTx } from "@nutreitor/db";
import {
  measureChange,
  monthRange,
  type PatientReportDto,
  type ReportDataDto,
} from "@nutreitor/shared";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

/** Zona horaria para ubicar turnos en el mes (hoy la de AR; a futuro, la del consultorio). */
const TZ = "America/Argentina/Buenos_Aires";

type ReportRow = typeof patientReports.$inferSelect;

/**
 * Reporte mensual del paciente (Fase 4.4). Lo arma y publica quien accede a la ficha
 * (admin o profesional asignado); el paciente sólo lee los PUBLICADOS de su ficha.
 * Publicado = foto fija: no se edita ni se recalcula.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(patientId: string): Promise<PatientReportDto[]> {
    return this.tenantDb.run(async (tx) => {
      await this.assertAccess(tx, patientId);
      return query(tx, eq(patientReports.patientId, patientId));
    });
  }

  get(patientId: string, id: string): Promise<PatientReportDto> {
    return this.tenantDb.run(async (tx) => {
      await this.assertAccess(tx, patientId);
      return one(tx, patientId, id);
    });
  }

  /** Borrador del mes (o el existente si ya hay uno de ese mes). */
  create(patientId: string, month: string): Promise<PatientReportDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await this.assertAccess(tx, patientId);
      if (month > new Date().toISOString().slice(0, 7)) {
        throw new BadRequestException("No se puede armar el reporte de un mes que todavía no empezó.");
      }
      const period = `${month}-01`;
      const [existing] = await tx
        .select({ id: patientReports.id })
        .from(patientReports)
        .where(and(eq(patientReports.patientId, patientId), eq(patientReports.period, period)))
        .limit(1);
      if (existing) return one(tx, patientId, existing.id);
      const ctx = getTenantContext();
      const [row] = await tx
        .insert(patientReports)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          period,
          data: (await computeReportData(tx, patientId, month)) as unknown as Record<string, unknown>,
          authorMembershipId: me,
        })
        .returning({ id: patientReports.id });
      await this.audit.recordForSession(tx, {
        action: "report.created",
        targetType: "patient",
        targetId: patientId,
        metadata: { reportId: row!.id, month },
      });
      return one(tx, patientId, row!.id);
    });
  }

  updateComment(patientId: string, id: string, comment: string | null): Promise<PatientReportDto> {
    return this.mutateDraft(patientId, id, async (tx) => {
      await tx
        .update(patientReports)
        .set({ comment: comment || null, updatedAt: sql`now()` })
        .where(eq(patientReports.id, id));
    });
  }

  /** Recalcula los números (sólo en borrador: lo publicado queda fijo). */
  refresh(patientId: string, id: string): Promise<PatientReportDto> {
    return this.mutateDraft(patientId, id, async (tx, row) => {
      await tx
        .update(patientReports)
        .set({
          data: (await computeReportData(tx, patientId, row.period.slice(0, 7))) as unknown as Record<string, unknown>,
          updatedAt: sql`now()`,
        })
        .where(eq(patientReports.id, id));
    });
  }

  publish(patientId: string, id: string): Promise<PatientReportDto> {
    return this.mutateDraft(patientId, id, async (tx, row) => {
      await tx
        .update(patientReports)
        .set({ status: "published", publishedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(patientReports.id, id));
      await this.audit.recordForSession(tx, {
        action: "report.published",
        targetType: "patient",
        targetId: patientId,
        metadata: { reportId: id, month: row.period.slice(0, 7) },
      });
    });
  }

  // ── paciente ────────────────────────────────────────────────────────────────

  minePublished(): Promise<PatientReportDto[]> {
    return this.tenantDb.run(async (tx) => {
      const patientId = await myPatientId(tx);
      return query(tx, and(eq(patientReports.patientId, patientId), eq(patientReports.status, "published"))!);
    });
  }

  mine(id: string): Promise<PatientReportDto> {
    return this.tenantDb.run(async (tx) => {
      const patientId = await myPatientId(tx);
      const [r] = await query(
        tx,
        and(eq(patientReports.id, id), eq(patientReports.patientId, patientId), eq(patientReports.status, "published"))!,
      );
      if (!r) throw new NotFoundException();
      return r;
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private async assertAccess(tx: TenantTx, patientId: string): Promise<string> {
    const access = await resolvePatientAccess(tx);
    await assertCanAccessPatient(tx, patientId, access);
    const [p] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!p) throw new NotFoundException();
    if (!access.membershipId) throw new ForbiddenException("No tenés un membership activo.");
    return access.membershipId;
  }

  private mutateDraft(
    patientId: string,
    id: string,
    fn: (tx: TenantTx, row: ReportRow) => Promise<void>,
  ): Promise<PatientReportDto> {
    return this.tenantDb.run(async (tx) => {
      await this.assertAccess(tx, patientId);
      const [row] = await tx
        .select()
        .from(patientReports)
        .where(and(eq(patientReports.id, id), eq(patientReports.patientId, patientId)))
        .for("update")
        .limit(1);
      if (!row) throw new NotFoundException();
      if (row.status === "published") throw new ConflictException("El reporte ya está publicado: no se modifica.");
      await fn(tx, row);
      return one(tx, patientId, id);
    });
  }
}

async function myPatientId(tx: TenantTx): Promise<string> {
  const { user } = getAuth();
  const [p] = await tx
    .select({ id: patients.id, archivedAt: patients.archivedAt })
    .from(patients)
    .where(eq(patients.userId, user.id))
    .limit(1);
  if (!p || p.archivedAt) throw new NotFoundException("No encontramos tu ficha de paciente.");
  return p.id;
}

async function query(tx: TenantTx, where: SQL): Promise<PatientReportDto[]> {
  const rows = await tx
    .select({ r: patientReports, authorName: users.fullName })
    .from(patientReports)
    .innerJoin(memberships, eq(memberships.id, patientReports.authorMembershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(where)
    .orderBy(desc(patientReports.period));
  return rows.map(({ r, authorName }) => ({
    id: r.id,
    patientId: r.patientId,
    month: r.period.slice(0, 7),
    status: r.status,
    data: r.data as unknown as ReportDataDto,
    comment: r.comment,
    authorName,
    updatedAt: r.updatedAt.toISOString(),
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
  }));
}

async function one(tx: TenantTx, patientId: string, id: string): Promise<PatientReportDto> {
  const [r] = await query(tx, and(eq(patientReports.id, id), eq(patientReports.patientId, patientId))!);
  if (!r) throw new NotFoundException();
  return r;
}

const num = (v: unknown) => (v == null ? null : Number(v));

/** Los números del mes, desde las tablas de siempre (bajo RLS). */
export async function computeReportData(tx: TenantTx, patientId: string, month: string): Promise<ReportDataDto> {
  const { from, to } = monthRange(month);
  const one = async <T>(q: ReturnType<typeof sql>) => (await tx.execute(q)).rows[0] as T;

  const m = await one<Record<string, unknown>>(sql`
    select count(*)::int as count,
      (array_agg(weight_kg order by measured_at, created_at) filter (where weight_kg is not null))[1] as w0,
      (array_agg(weight_kg order by measured_at desc, created_at desc) filter (where weight_kg is not null))[1] as w1,
      (array_agg(body_fat_pct order by measured_at, created_at) filter (where body_fat_pct is not null))[1] as f0,
      (array_agg(body_fat_pct order by measured_at desc, created_at desc) filter (where body_fat_pct is not null))[1] as f1,
      (array_agg(waist_cm order by measured_at, created_at) filter (where waist_cm is not null))[1] as c0,
      (array_agg(waist_cm order by measured_at desc, created_at desc) filter (where waist_cm is not null))[1] as c1
    from patient_metrics where patient_id = ${patientId} and measured_at between ${from}::date and ${to}::date`);

  const a = await one<Record<string, unknown>>(sql`
    select count(*)::int as logs, count(distinct date)::int as days,
      round(100 * avg(case status when 'done' then 1 when 'partial' then 0.5 else 0 end))::int as pct
    from adherence_meal_logs where patient_id = ${patientId} and date between ${from}::date and ${to}::date`);
  const byMeal = (
    await tx.execute(sql`
      select meal_name as meal, count(*)::int as logs,
        round(100 * avg(case status when 'done' then 1 when 'partial' then 0.5 else 0 end))::int as pct
      from adherence_meal_logs where patient_id = ${patientId} and date between ${from}::date and ${to}::date
      -- En el orden en que suele registrarlas (desayuno antes que cena); desempate por nombre.
      group by meal_name order by min(created_at), meal_name`)
  ).rows as { meal: string; logs: number; pct: number }[];

  const c = await one<Record<string, unknown>>(sql`
    select count(*)::int as count, round(avg(hunger), 1) as hunger, round(avg(energy), 1) as energy, round(avg(mood), 1) as mood
    from adherence_checkins where patient_id = ${patientId} and date between ${from}::date and ${to}::date`);

  const ap = await one<Record<string, unknown>>(sql`
    select count(*) filter (where status = 'completed')::int as completed,
           count(*) filter (where status = 'cancelled')::int as cancelled,
           count(*) filter (where status = 'booked')::int as booked
    from appointments where patient_id = ${patientId}
      and (starts_at at time zone ${TZ})::date between ${from}::date and ${to}::date`);

  const pl = await one<Record<string, unknown>>(sql`
    select
      (select title from meal_plans where patient_id = ${patientId}
         and (created_at at time zone ${TZ})::date <= ${to}::date and status <> 'archived'
         order by version desc limit 1) as title,
      (select version from meal_plans where patient_id = ${patientId}
         and (created_at at time zone ${TZ})::date <= ${to}::date and status <> 'archived'
         order by version desc limit 1) as version,
      (select count(*)::int from meal_plans where patient_id = ${patientId}
         and (created_at at time zone ${TZ})::date between ${from}::date and ${to}::date) as versions`);

  return {
    from,
    to,
    measurements: {
      count: Number(m.count),
      weightKg: measureChange(num(m.w0), num(m.w1)),
      bodyFatPct: measureChange(num(m.f0), num(m.f1)),
      waistCm: measureChange(num(m.c0), num(m.c1)),
    },
    adherence: {
      pct: num(a.pct),
      logs: Number(a.logs),
      daysLogged: Number(a.days),
      byMeal: byMeal.map((b) => ({ meal: b.meal, pct: Number(b.pct), logs: Number(b.logs) })),
    },
    checkins: { count: Number(c.count), hunger: num(c.hunger), energy: num(c.energy), mood: num(c.mood) },
    appointments: { completed: Number(ap.completed), cancelled: Number(ap.cancelled), booked: Number(ap.booked) },
    plan: { title: (pl.title as string) ?? null, version: num(pl.version), versionsInMonth: Number(pl.versions) },
  };
}
