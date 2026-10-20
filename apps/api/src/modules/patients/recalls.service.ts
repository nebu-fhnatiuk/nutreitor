import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { dietaryRecalls, memberships, patients, users, type TenantTx } from "@nutreitor/db";
import { recallTotals, type PlanMeal, type RecallDto, type SaveRecallDto } from "@nutreitor/shared";
import { and, desc, eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type Row = typeof dietaryRecalls.$inferSelect;

/**
 * Recordatorios de 24 h (ADR 0033). Scoping y capacidades del plan (plan:read /
 * plan:write; profesional → asignados). Los totales se derivan al leer.
 */
@Injectable()
export class RecallsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(patientId: string): Promise<RecallDto[]> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const rows = await tx
        .select({ r: dietaryRecalls, by: users.fullName })
        .from(dietaryRecalls)
        .leftJoin(memberships, eq(memberships.id, dietaryRecalls.recordedByMembershipId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(eq(dietaryRecalls.patientId, patientId))
        .orderBy(desc(dietaryRecalls.recalledDate), desc(dietaryRecalls.createdAt));
      return rows.map((x) => toDto(x.r, x.by));
    });
  }

  create(patientId: string, dto: SaveRecallDto): Promise<RecallDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      await assertActive(tx, patientId);
      const ctx = this.tenantDb.context;
      const [row] = await tx
        .insert(dietaryRecalls)
        .values({ tenantId: ctx.tenantId, region: ctx.region, patientId, recordedByMembershipId: access.membershipId!, ...values(dto) })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "recall.recorded",
        targetType: "patient",
        targetId: patientId,
        metadata: { recallId: row!.id, meals: dto.meals.length },
      });
      return toDto(row!, null);
    });
  }

  update(patientId: string, id: string, dto: SaveRecallDto): Promise<RecallDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      await assertActive(tx, patientId);
      const [row] = await tx
        .update(dietaryRecalls)
        .set({ ...values(dto), updatedAt: new Date() })
        .where(and(eq(dietaryRecalls.id, id), eq(dietaryRecalls.patientId, patientId)))
        .returning();
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "recall.updated", targetType: "patient", targetId: patientId, metadata: { recallId: id } });
      return toDto(row, null);
    });
  }

  remove(patientId: string, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const gone = await tx
        .delete(dietaryRecalls)
        .where(and(eq(dietaryRecalls.id, id), eq(dietaryRecalls.patientId, patientId)))
        .returning({ id: dietaryRecalls.id });
      if (gone.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "recall.deleted", targetType: "patient", targetId: patientId, metadata: { recallId: id } });
    });
  }
}

function values(dto: SaveRecallDto) {
  return {
    recalledDate: dto.recalledDate,
    typical: dto.typical,
    dayLabel: dto.dayLabel || null,
    meals: dto.meals as unknown[],
    note: dto.note || null,
  };
}

async function assertActive(tx: TenantTx, patientId: string): Promise<void> {
  const [p] = await tx.select({ archivedAt: patients.archivedAt }).from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!p) throw new NotFoundException();
  if (p.archivedAt) throw new ConflictException("El paciente está archivado.");
}

function toDto(row: Row, recordedByName: string | null): RecallDto {
  const meals = row.meals as PlanMeal[];
  return {
    id: row.id,
    patientId: row.patientId,
    recalledDate: row.recalledDate,
    typical: row.typical,
    dayLabel: row.dayLabel,
    meals,
    note: row.note,
    recordedByName,
    createdAt: row.createdAt.toISOString(),
    totals: recallTotals(meals),
  };
}
