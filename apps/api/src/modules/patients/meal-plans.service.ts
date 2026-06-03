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
import type { MealPlanDto, SavePlanDto } from "@nutreitor/shared";
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
      const [patient] = await tx
        .select({ archivedAt: patients.archivedAt })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);
      if (!patient) throw new NotFoundException();
      if (patient.archivedAt) {
        throw new ConflictException("El paciente está archivado.");
      }

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
      const [row] = await tx
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

function toPlanDto(row: MealPlanRow, authorName: string): MealPlanDto {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    title: row.title,
    startDate: row.startDate,
    body: row.body ?? { meals: [] },
    authorMembershipId: row.authorMembershipId,
    authorName,
    createdAt: row.createdAt.toISOString(),
  };
}
