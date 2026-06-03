import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  careAssignments,
  mealPlans,
  memberships,
  patientMetrics,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import {
  hasCapability,
  type PatientMetricDto,
  type PortalMeDto,
  type RecordMetricDto,
} from "@nutreitor/shared";
import { and, asc, eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { toPlanDto } from "../patients/meal-plans.service.js";
import { numStr, toMetricDto } from "../patients/metrics.service.js";
import { resolvePatientAccess } from "../patients/patient-access.js";

type PatientRow = typeof patients.$inferSelect;

/**
 * Portal del paciente: el paciente logueado ve SÓLO su propia entidad. Resuelve
 * "mi paciente" por `userId` de la sesión (además de RLS de tenant) — defensa en
 * profundidad equivalente al assigned-only del profesional. Superficie aparte de
 * la gestión: nunca toca /patients (que expone otras entidades del tenant).
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async getMe(): Promise<PortalMeDto> {
    return this.tenantDb.run(async (tx) => {
      const patient = await this.resolveMyPatient(tx);
      // Ficha dada de baja → sin portal (consistente con el 409 de selfReport y
      // con assertPatientActive en la gestión).
      if (patient.archivedAt) throw new NotFoundException();
      const { user } = getAuth();

      const profRows = await tx
        .select({ name: users.fullName })
        .from(careAssignments)
        .innerJoin(memberships, eq(memberships.id, careAssignments.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(careAssignments.patientId, patient.id),
            eq(careAssignments.status, "active"),
          ),
        );

      const [planRow] = await tx
        .select({ plan: mealPlans, authorName: users.fullName })
        .from(mealPlans)
        .innerJoin(memberships, eq(memberships.id, mealPlans.authorMembershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(eq(mealPlans.patientId, patient.id), eq(mealPlans.status, "active")),
        )
        .limit(1);

      const metricRows = await tx
        .select({
          metric: patientMetrics,
          name: users.fullName,
          role: memberships.role,
        })
        .from(patientMetrics)
        .innerJoin(
          memberships,
          eq(memberships.id, patientMetrics.recordedByMembershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(patientMetrics.patientId, patient.id))
        .orderBy(asc(patientMetrics.measuredAt), asc(patientMetrics.createdAt));

      return {
        profile: {
          fullName: patient.fullName,
          goal: patient.goal,
          email: patient.email,
          phone: patient.phone,
          clinical: {
            reasonForConsult: patient.reasonForConsult,
            medicalHistory: patient.medicalHistory,
            allergies: patient.allergies,
            currentMedication: patient.currentMedication,
            diagnosedConditions: patient.diagnosedConditions,
            familyHistory: patient.familyHistory,
          },
        },
        professionals: profRows.map((r) => r.name),
        plan: planRow ? toPlanDto(planRow.plan, planRow.authorName) : null,
        metrics: metricRows.map((r) =>
          toMetricDto(r.metric, r.name, r.role),
        ),
        canSelfReport: hasCapability(user.role, "portal:self_report"),
      } satisfies PortalMeDto;
    });
  }

  /** Auto-reporte: el paciente carga una medición sobre su propia ficha. */
  async selfReport(dto: RecordMetricDto): Promise<PatientMetricDto> {
    return this.tenantDb.run(async (tx) => {
      const patient = await this.resolveMyPatient(tx);
      if (patient.archivedAt) {
        throw new ConflictException("Tu ficha está dada de baja.");
      }
      // membershipId de la sesión (rol patient) = autor; el read deriva el origen.
      const access = await resolvePatientAccess(tx);
      if (!access.membershipId) {
        throw new ForbiddenException("No tenés un membership activo.");
      }
      const ctx = getTenantContext();
      const [row] = await tx
        .insert(patientMetrics)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId: patient.id,
          recordedByMembershipId: access.membershipId,
          measuredAt: dto.measuredAt,
          weightKg: numStr(dto.weightKg),
          bodyFatPct: numStr(dto.bodyFatPct),
          muscleMassKg: numStr(dto.muscleMassKg),
          waistCm: numStr(dto.waistCm),
          hipCm: numStr(dto.hipCm),
          extra: dto.extra ?? {},
          note: dto.note ?? null,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "metric.recorded",
        targetType: "patient",
        targetId: patient.id,
        metadata: { metricId: row!.id, source: "self_report" },
      });

      const [full] = await tx
        .select({
          metric: patientMetrics,
          name: users.fullName,
          role: memberships.role,
        })
        .from(patientMetrics)
        .innerJoin(
          memberships,
          eq(memberships.id, patientMetrics.recordedByMembershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(patientMetrics.id, row!.id))
        .limit(1);
      return toMetricDto(full!.metric, full!.name, full!.role);
    });
  }

  /** Resuelve la entidad paciente vinculada a la cuenta de la sesión (RLS + userId). */
  private async resolveMyPatient(tx: TenantTx): Promise<PatientRow> {
    const { user } = getAuth();
    const [patient] = await tx
      .select()
      .from(patients)
      .where(eq(patients.userId, user.id))
      .limit(1);
    if (!patient) {
      throw new NotFoundException("No encontramos tu ficha de paciente.");
    }
    return patient;
  }
}
