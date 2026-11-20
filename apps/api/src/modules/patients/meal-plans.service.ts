import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  mealPlans,
  memberships,
  patients,
  planAlertReviews,
  users,
  type TenantTx,
} from "@nutreitor/db";
import {
  normalizeMealPlanBody,
  planAlertContextFrom,
  planAlertKey,
  planAlerts,
  weekdays,
  type AllergyFlag,
  type MealPlanBody,
  type MealPlanDto,
  type PlanAlertReviewDto,
  type SavePlanDto,
} from "@nutreitor/shared";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { latestEnergyRequirement } from "./energy.service.js";
import { assertCanAccessPatient, resolvePatientAccess, type PatientAccess } from "./patient-access.js";

/** Tope de una sesión de armado: más es un editor olvidado abierto, no trabajo. */
const MAX_EDIT_SECONDS = 2 * 3600;
export type MealPlanRow = typeof mealPlans.$inferSelect;

/**
 * Planes alimentarios VERSIONADOS. Guardar = supersede del activo + nueva versión
 * activa (historial inmutable; sin DELETE). Acceso scopeado por patient-access
 * (admin=todos / profesional=asignados). Mutaciones auditadas.
 */
@Injectable()
export class MealPlansService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Todas las versiones del paciente (más reciente primero). */
  async list(patientId: string): Promise<MealPlanDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      return this.query(tx, eq(mealPlans.patientId, patientId));
    });
  }

  /** Guarda una nueva versión activa, superseding la anterior (si la hay). */
  async save(patientId: string, dto: SavePlanDto): Promise<MealPlanDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const row = await this.saveInTx(tx, patientId, dto, access);
      return this.toDto(tx, row.id);
    });
  }

  /**
   * Guarda la versión dentro de una tx existente, con el acceso ya verificado por
   * quien llama. MISMA lógica para el guardado individual y para aplicar una
   * plantilla a todo un grupo (KAN-33): numeración, supersede, unique y auditoría.
   */
  async saveInTx(tx: TenantTx, patientId: string, dto: SavePlanDto, access: PatientAccess): Promise<MealPlanRow> {
    if (!access.membershipId) {
      throw new ForbiddenException("No tenés un membership para editar el plan.");
    }
    await this.assertPatientActive(tx, patientId);

    // Última versión (de cualquier estado) para numerar la nueva.
    const [latest] = await tx
      .select({ version: mealPlans.version })
      .from(mealPlans)
      .where(eq(mealPlans.patientId, patientId))
      .orderBy(desc(mealPlans.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    // Supersede el activo vigente antes de insertar el nuevo (respeta el unique).
    await tx
      .update(mealPlans)
      .set({ status: "superseded" })
      .where(
        and(
          eq(mealPlans.patientId, patientId),
          eq(mealPlans.status, "active"),
        ),
      );

    const ctx = getTenantContext();
    let row: MealPlanRow | undefined;
    try {
      [row] = await tx
        .insert(mealPlans)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          authorMembershipId: access.membershipId,
          version: nextVersion,
          status: "active",
          title: dto.title,
          startDate: dto.startDate ?? null,
          body: dto.body,
          editSeconds: dto.editSeconds != null ? Math.min(dto.editSeconds, MAX_EDIT_SECONDS) : null,
          draftedFrom: dto.draftedFrom ?? null,
        })
        .returning();
    } catch (e) {
      // Unique parcial de "un activo por paciente": dos saves concurrentes →
      // 409 limpio en vez de un 500 crudo de Postgres.
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23505" || err?.cause?.code === "23505") {
        throw new ConflictException(
          "Se guardó otra versión al mismo tiempo. Reintentá.",
        );
      }
      throw e;
    }
    const alerts = await this.recordAlerts(tx, row!, dto, access.membershipId);
    await this.audit.recordForSession(tx, {
      action: "plan.saved",
      targetType: "patient",
      targetId: patientId,
      metadata: { planId: row!.id, version: nextVersion, ...alerts },
    });
    return row!;
  }

  /**
   * Alertas de la versión (KAN-97, ADR 0051): se RECALCULAN acá con el requerimiento
   * vigente (no se confía en lo que mande el cliente) y se guarda cada una con la
   * decisión del profesional. Las decisiones sobre alertas que ya no existen (el plan
   * cambió) se ignoran. Mantener una importante exige el motivo.
   */
  private async recordAlerts(
    tx: TenantTx,
    plan: MealPlanRow,
    dto: SavePlanDto,
    membershipId: string,
  ): Promise<{ alertsKept: number; alertsUnreviewed: number }> {
    const req = await latestEnergyRequirement(tx, plan.patientId);
    const [patient] = await tx
      .select({ allergyFlags: patients.allergyFlags })
      .from(patients)
      .where(eq(patients.id, plan.patientId))
      .limit(1);
    const flags = (patient?.allergyFlags ?? []) as AllergyFlag[];
    const { alerts } = planAlerts(dto.body, planAlertContextFrom(req, flags));
    if (!alerts.length) return { alertsKept: 0, alertsUnreviewed: 0 };

    const reviews = new Map((dto.alertReviews ?? []).map((r) => [planAlertKey(r), r.reason?.trim() || null]));
    const rows = alerts.map((a) => {
      const kept = reviews.has(planAlertKey(a));
      const reason = kept ? reviews.get(planAlertKey(a))! : null;
      if (kept && a.level === "important" && !reason) {
        throw new BadRequestException(`Para mantener la alerta "${a.message}" escribí el motivo.`);
      }
      return {
        tenantId: plan.tenantId,
        region: plan.region,
        mealPlanId: plan.id,
        patientId: plan.patientId,
        energyRequirementId: req?.id ?? null,
        rule: a.rule,
        level: a.level,
        day: a.day,
        dayLabel: a.dayLabel,
        message: a.message,
        source: a.source,
        value: String(a.value),
        decision: kept ? ("kept" as const) : ("unreviewed" as const),
        reason,
        decidedByMembershipId: membershipId,
      };
    });
    await tx.insert(planAlertReviews).values(rows);
    const alertsKept = rows.filter((r) => r.decision === "kept").length;
    return { alertsKept, alertsUnreviewed: rows.length - alertsKept };
  }

  /** Archiva el plan activo (deja al paciente sin plan vigente). */
  async archiveActive(patientId: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      await this.assertPatientActive(tx, patientId);
      const archived = await tx
        .update(mealPlans)
        .set({ status: "archived" })
        .where(
          and(
            eq(mealPlans.patientId, patientId),
            eq(mealPlans.status, "active"),
          ),
        )
        .returning({ id: mealPlans.id });
      if (archived.length === 0) {
        throw new NotFoundException("No hay un plan activo para archivar.");
      }
      await this.audit.recordForSession(tx, {
        action: "plan.archived",
        targetType: "patient",
        targetId: patientId,
        metadata: { planId: archived[0]!.id },
      });
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** 404 si no existe, 409 si está archivado: no se mutan pacientes dados de baja. */
  private async assertPatientActive(tx: TenantTx, patientId: string): Promise<void> {
    const [patient] = await tx
      .select({ archivedAt: patients.archivedAt })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    if (!patient) throw new NotFoundException();
    if (patient.archivedAt) {
      throw new ConflictException("El paciente está archivado.");
    }
  }

  private async toDto(tx: TenantTx, planId: string): Promise<MealPlanDto> {
    const [row] = await this.query(tx, eq(mealPlans.id, planId));
    return row!;
  }

  private async query(tx: TenantTx, where: SQL): Promise<MealPlanDto[]> {
    const rows = await tx
      .select({ plan: mealPlans, authorName: users.fullName })
      .from(mealPlans)
      .innerJoin(memberships, eq(memberships.id, mealPlans.authorMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)
      .orderBy(desc(mealPlans.version));
    const reviews = await this.alertReviews(tx, rows.map((r) => r.plan.id));
    return rows.map((r) => ({ ...toPlanDto(r.plan, r.authorName), alertReviews: reviews.get(r.plan.id) ?? [] }));
  }

  private async alertReviews(tx: TenantTx, planIds: string[]): Promise<Map<string, PlanAlertReviewDto[]>> {
    const out = new Map<string, PlanAlertReviewDto[]>();
    if (!planIds.length) return out;
    const rows = await tx
      .select()
      .from(planAlertReviews)
      .where(inArray(planAlertReviews.mealPlanId, planIds));
    for (const r of rows) {
      const list = out.get(r.mealPlanId) ?? [];
      list.push({
        rule: r.rule as PlanAlertReviewDto["rule"],
        level: r.level,
        day: r.day as PlanAlertReviewDto["day"],
        dayLabel: r.dayLabel,
        message: r.message,
        source: r.source,
        decision: r.decision,
        reason: r.reason,
      });
      out.set(r.mealPlanId, list);
    }
    // Mismo orden que el motor: importantes primero, después por día y por regla.
    const dayIdx = (d: string) => (d === "day" ? -1 : weekdays.indexOf(d as (typeof weekdays)[number]));
    for (const list of out.values()) {
      list.sort(
        (a, b) =>
          (a.level === b.level ? 0 : a.level === "important" ? -1 : 1) ||
          dayIdx(a.day) - dayIdx(b.day) ||
          a.rule.localeCompare(b.rule),
      );
    }
    return out;
  }
}

export function toPlanDto(row: MealPlanRow, authorName: string): MealPlanDto {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    title: row.title,
    startDate: row.startDate,
    // Blindaje: normaliza un body legacy (sin `layout`) a `layout: "day"`. Las
    // filas ya migradas (0021) pasan tal cual; cubre cualquier resabio.
    body: normalizeMealPlanBody(row.body) as MealPlanBody,
    authorMembershipId: row.authorMembershipId,
    authorName,
    createdAt: row.createdAt.toISOString(),
  };
}
