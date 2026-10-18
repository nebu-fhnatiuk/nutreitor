import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { memberships, planTemplates, users, type TenantTx } from "@nutreitor/db";
import {
  normalizeMealPlanBody,
  type MealPlanBody,
  type PlanTemplateDto,
  type SavePlanTemplateDto,
} from "@nutreitor/shared";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { resolvePatientAccess } from "./patient-access.js";

type Row = typeof planTemplates.$inferSelect;

/**
 * Plantillas de planes del consultorio (Fase 4.2). Se comparten dentro del tenant
 * (cualquier profesional las usa como punto de partida); no tienen datos de
 * pacientes. Sin DELETE: se archivan.
 */
@Injectable()
export class PlanTemplatesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PlanTemplateDto[]> {
    return this.tenantDb.run((tx) => this.query(tx, isNull(planTemplates.archivedAt)));
  }

  async create(dto: SavePlanTemplateDto): Promise<PlanTemplateDto> {
    return this.tenantDb.run(async (tx) => {
      const { membershipId } = await resolvePatientAccess(tx);
      if (!membershipId) throw new ForbiddenException("No tenés un membership activo.");
      const ctx = getTenantContext();
      const [row] = await tx
        .insert(planTemplates)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          name: dto.name,
          description: dto.description ?? null,
          body: dto.body as unknown as Record<string, unknown>,
          createdByMembershipId: membershipId,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "plan_template.created",
        targetType: "plan_template",
        targetId: row!.id,
        metadata: { name: row!.name },
      });
      return (await this.query(tx, eq(planTemplates.id, row!.id)))[0]!;
    });
  }

  async archive(id: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const done = await tx
        .update(planTemplates)
        .set({ archivedAt: new Date() })
        .where(and(eq(planTemplates.id, id), isNull(planTemplates.archivedAt)))
        .returning({ id: planTemplates.id });
      if (done.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "plan_template.archived",
        targetType: "plan_template",
        targetId: id,
      });
    });
  }

  private async query(tx: TenantTx, where: SQL | undefined): Promise<PlanTemplateDto[]> {
    const rows = await tx
      .select({ t: planTemplates, authorName: users.fullName })
      .from(planTemplates)
      .innerJoin(memberships, eq(memberships.id, planTemplates.createdByMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)
      .orderBy(asc(planTemplates.name));
    return rows.map(({ t, authorName }) => toDto(t, authorName));
  }
}

function toDto(t: Row, authorName: string): PlanTemplateDto {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    body: normalizeMealPlanBody(t.body) as MealPlanBody,
    authorName,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
