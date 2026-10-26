import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { careAssignments, mealPlans, planTemplates } from "@nutreitor/db";
import {
  mealPlanBodySchema,
  normalizeMealPlanBody,
  type ApplyGroupPlanDto,
  type ApplyGroupPlanResultDto,
  type AssignGroupProfessionalDto,
  type AssignGroupProfessionalResultDto,
} from "@nutreitor/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { loadGroup, visibleMembers } from "./groups.service.js";
import { MealPlansService } from "./meal-plans.service.js";
import { resolvePatientAccess } from "./patient-access.js";

/**
 * Acciones sobre todo un grupo (KAN-32/33, ADR 0044). Todo o nada en una sola
 * transacción, reusando la operación de a uno (`assignInTx`, `saveInTx`): un grupo
 * no inventa reglas nuevas, sólo repite la de siempre para cada deportista visible.
 */
@Injectable()
export class GroupActionsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
    private readonly care: CareAssignmentsService,
    private readonly plans: MealPlansService,
  ) {}

  /** KAN-32: asigna el profesional a quien todavía no lo tiene. */
  assignProfessional(groupId: string, dto: AssignGroupProfessionalDto): Promise<AssignGroupProfessionalResultDto> {
    return this.tenantDb.run(async (tx) => {
      await loadGroup(tx, groupId);
      const members = await visibleMembers(tx, groupId, await resolvePatientAccess(tx));
      if (!members.length) throw new BadRequestException("El grupo no tiene deportistas.");
      const ids = members.map((m) => m.patientId);
      const already = await tx
        .select({ patientId: careAssignments.patientId })
        .from(careAssignments)
        .where(
          and(
            inArray(careAssignments.patientId, ids),
            eq(careAssignments.membershipId, dto.membershipId),
            eq(careAssignments.status, "active"),
          ),
        );
      const has = new Set(already.map((a) => a.patientId));
      const pending = ids.filter((id) => !has.has(id));
      for (const patientId of pending) {
        await this.care.assignInTx(tx, patientId, { membershipId: dto.membershipId, locationId: null });
      }
      const result = { assigned: pending.length, alreadyAssigned: has.size };
      await this.audit.recordForSession(tx, {
        action: "group.professional_assigned",
        targetType: "group",
        targetId: groupId,
        metadata: { membershipId: dto.membershipId, ...result },
      });
      return result;
    });
  }

  /** KAN-33: una versión nueva del plan de cada deportista, copiada de la plantilla. */
  applyPlan(groupId: string, dto: ApplyGroupPlanDto): Promise<ApplyGroupPlanResultDto> {
    return this.tenantDb.run(async (tx) => {
      await loadGroup(tx, groupId);
      const access = await resolvePatientAccess(tx);
      const members = await visibleMembers(tx, groupId, access);
      if (!members.length) throw new BadRequestException("El grupo no tiene deportistas que puedas ver.");

      const [template] = await tx
        .select({ name: planTemplates.name, body: planTemplates.body })
        .from(planTemplates)
        .where(and(eq(planTemplates.id, dto.templateId), isNull(planTemplates.archivedAt)))
        .limit(1);
      if (!template) throw new NotFoundException("No existe esa plantilla.");
      const body = mealPlanBodySchema.parse(normalizeMealPlanBody(template.body));

      const ids = members.map((m) => m.patientId);
      const withPlan = new Set(
        (
          await tx
            .select({ patientId: mealPlans.patientId })
            .from(mealPlans)
            .where(and(inArray(mealPlans.patientId, ids), eq(mealPlans.status, "active")))
        ).map((p) => p.patientId),
      );
      const targets = dto.onlyWithoutPlan ? ids.filter((id) => !withPlan.has(id)) : ids;
      for (const patientId of targets) {
        // structuredClone: cada deportista con SU copia (editar uno no toca a los demás).
        await this.plans.saveInTx(
          tx,
          patientId,
          { title: dto.title ?? template.name, startDate: dto.startDate ?? null, body: structuredClone(body), draftedFrom: "template" },
          access,
        );
      }
      const result = {
        applied: targets.length,
        replaced: targets.filter((id) => withPlan.has(id)).length,
        skipped: ids.length - targets.length,
      };
      await this.audit.recordForSession(tx, {
        action: "group.plan_applied",
        targetType: "group",
        targetId: groupId,
        metadata: { templateId: dto.templateId, ...result },
      });
      return result;
    });
  }
}
