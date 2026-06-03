import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  memberships,
  patientMetrics,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  PatientMetricDto,
  RecordMetricDto,
  UpdateMetricDto,
} from "@nutreitor/shared";
import { and, asc, eq, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type MetricRow = typeof patientMetrics.$inferSelect;

/** numeric() en drizzle se inserta/lee como string. */
const numStr = (v: number | null | undefined): string | null | undefined =>
  v == null ? (v as null | undefined) : String(v);

/**
 * Serie temporal de mediciones (evolución). Editable/borrable (data entry), a
 * diferencia de las notas append-only. Acceso scopeado por patient-access
 * (admin=todos / profesional=asignados). Mutaciones auditadas.
 */
@Injectable()
export class MetricsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Serie completa (ascendente por fecha, para graficar). */
  async list(patientId: string): Promise<PatientMetricDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      return this.query(tx, eq(patientMetrics.patientId, patientId));
    });
  }

  async record(patientId: string, dto: RecordMetricDto): Promise<PatientMetricDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      if (!access.membershipId) {
        throw new ForbiddenException("No tenés un membership para registrar.");
      }
      await this.assertPatientActive(tx, patientId);

      const ctx = getTenantContext();
      const [row] = await tx
        .insert(patientMetrics)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
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
        targetId: patientId,
        metadata: { metricId: row!.id, measuredAt: dto.measuredAt },
      });
      return this.toDto(tx, row!.id);
    });
  }

  async update(
    patientId: string,
    metricId: string,
    dto: UpdateMetricDto,
  ): Promise<PatientMetricDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      await this.assertPatientActive(tx, patientId);
      const [existing] = await tx
        .select({ id: patientMetrics.id })
        .from(patientMetrics)
        .where(
          and(
            eq(patientMetrics.id, metricId),
            eq(patientMetrics.patientId, patientId),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundException();

      const patch = metricValues(dto);
      const changed = Object.keys(patch);
      if (changed.length) {
        await tx
          .update(patientMetrics)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(patientMetrics.id, metricId));
        await this.audit.recordForSession(tx, {
          action: "metric.updated",
          targetType: "patient",
          targetId: patientId,
          metadata: { metricId, fields: changed },
        });
      }
      return this.toDto(tx, metricId);
    });
  }

  async remove(patientId: string, metricId: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      await this.assertPatientActive(tx, patientId);
      const deleted = await tx
        .delete(patientMetrics)
        .where(
          and(
            eq(patientMetrics.id, metricId),
            eq(patientMetrics.patientId, patientId),
          ),
        )
        .returning({ id: patientMetrics.id });
      if (deleted.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "metric.deleted",
        targetType: "patient",
        targetId: patientId,
        metadata: { metricId },
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

  private async toDto(tx: TenantTx, metricId: string): Promise<PatientMetricDto> {
    const [row] = await this.query(tx, eq(patientMetrics.id, metricId));
    return row!;
  }

  private async query(tx: TenantTx, where: SQL): Promise<PatientMetricDto[]> {
    const rows = await tx
      .select({
        metric: patientMetrics,
        recordedByName: users.fullName,
      })
      .from(patientMetrics)
      .innerJoin(
        memberships,
        eq(memberships.id, patientMetrics.recordedByMembershipId),
      )
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)
      .orderBy(asc(patientMetrics.measuredAt), asc(patientMetrics.createdAt));
    return rows.map((r) => toMetricDto(r.metric, r.recordedByName));
  }
}

function metricValues(
  dto: UpdateMetricDto,
): Partial<typeof patientMetrics.$inferInsert> {
  const p: Partial<typeof patientMetrics.$inferInsert> = {};
  if (dto.measuredAt !== undefined) p.measuredAt = dto.measuredAt;
  if (dto.weightKg !== undefined) p.weightKg = numStr(dto.weightKg);
  if (dto.bodyFatPct !== undefined) p.bodyFatPct = numStr(dto.bodyFatPct);
  if (dto.muscleMassKg !== undefined) p.muscleMassKg = numStr(dto.muscleMassKg);
  if (dto.waistCm !== undefined) p.waistCm = numStr(dto.waistCm);
  if (dto.hipCm !== undefined) p.hipCm = numStr(dto.hipCm);
  if (dto.extra !== undefined) p.extra = dto.extra;
  if (dto.note !== undefined) p.note = dto.note;
  return p;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

function toMetricDto(row: MetricRow, recordedByName: string): PatientMetricDto {
  return {
    id: row.id,
    measuredAt: row.measuredAt,
    weightKg: num(row.weightKg),
    bodyFatPct: num(row.bodyFatPct),
    muscleMassKg: num(row.muscleMassKg),
    waistCm: num(row.waistCm),
    hipCm: num(row.hipCm),
    extra: row.extra ?? {},
    note: row.note,
    recordedByMembershipId: row.recordedByMembershipId,
    recordedByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
