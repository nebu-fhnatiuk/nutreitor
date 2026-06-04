import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  mealPlans,
  memberships,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import {
  normalizeMealPlanBody,
  type MealPlanBody,
  type MealPlanDto,
  type SavePlanDto,
} from "@nutreitor/shared";
import { and, desc, eq, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type MealPlanRow = typeof mealPlans.$inferSelect;

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
      await this.audit.recordForSession(tx, {
        action: "plan.saved",
        targetType: "patient",
        targetId: patientId,
        metadata: { planId: row!.id, version: nextVersion },
      });
      return this.toDto(tx, row!.id);
    });
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
    return rows.map((r) => toPlanDto(r.plan, r.authorName));
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
