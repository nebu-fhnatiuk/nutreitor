import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { foodFrequencySurveys, memberships, patients, users, type TenantTx } from "@nutreitor/db";
import {
  ffqItemResults,
  gapaComparison,
  wholeGrainShare,
  type FfqAnswers,
  type FfqSex,
  type FoodFrequencyDto,
  type SaveFoodFrequencyDto,
} from "@nutreitor/shared";
import { and, desc, eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type Row = typeof foodFrequencySurveys.$inferSelect;

/**
 * Frecuencia de consumo (ADR 0034). Scoping y capacidades del plan (plan:read /
 * plan:write; profesional → asignados). La comparación con las GAPA usa el sexo de la
 * ficha (sólo para el tope de alcohol).
 */
@Injectable()
export class FoodFrequencyService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(patientId: string): Promise<FoodFrequencyDto[]> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const { sex } = await loadPatient(tx, patientId);
      const rows = await tx
        .select({ r: foodFrequencySurveys, by: users.fullName })
        .from(foodFrequencySurveys)
        .leftJoin(memberships, eq(memberships.id, foodFrequencySurveys.recordedByMembershipId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(eq(foodFrequencySurveys.patientId, patientId))
        .orderBy(desc(foodFrequencySurveys.answeredOn), desc(foodFrequencySurveys.createdAt));
      return rows.map((x) => toDto(x.r, x.by, sex));
    });
  }

  create(patientId: string, dto: SaveFoodFrequencyDto): Promise<FoodFrequencyDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const { sex } = await loadPatient(tx, patientId, true);
      const ctx = this.tenantDb.context;
      const [row] = await tx
        .insert(foodFrequencySurveys)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          recordedByMembershipId: access.membershipId!,
          answeredOn: dto.answeredOn,
          answers: dto.answers,
          note: dto.note || null,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "food_frequency.recorded",
        targetType: "patient",
        targetId: patientId,
        metadata: { surveyId: row!.id, items: Object.keys(dto.answers).length },
      });
      return toDto(row!, null, sex);
    });
  }

  update(patientId: string, id: string, dto: SaveFoodFrequencyDto): Promise<FoodFrequencyDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const { sex } = await loadPatient(tx, patientId, true);
      const [row] = await tx
        .update(foodFrequencySurveys)
        .set({ answeredOn: dto.answeredOn, answers: dto.answers, note: dto.note || null, updatedAt: new Date() })
        .where(and(eq(foodFrequencySurveys.id, id), eq(foodFrequencySurveys.patientId, patientId)))
        .returning();
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "food_frequency.updated", targetType: "patient", targetId: patientId, metadata: { surveyId: id } });
      return toDto(row, null, sex);
    });
  }

  remove(patientId: string, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const gone = await tx
        .delete(foodFrequencySurveys)
        .where(and(eq(foodFrequencySurveys.id, id), eq(foodFrequencySurveys.patientId, patientId)))
        .returning({ id: foodFrequencySurveys.id });
      if (gone.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "food_frequency.deleted", targetType: "patient", targetId: patientId, metadata: { surveyId: id } });
    });
  }
}

async function loadPatient(tx: TenantTx, patientId: string, forWrite = false): Promise<{ sex: FfqSex | null }> {
  const [p] = await tx.select({ sex: patients.sex, archivedAt: patients.archivedAt }).from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!p) throw new NotFoundException();
  if (forWrite && p.archivedAt) throw new ConflictException("El paciente está archivado.");
  return { sex: p.sex === "female" || p.sex === "male" ? p.sex : null };
}

function toDto(row: Row, recordedByName: string | null, sex: FfqSex | null): FoodFrequencyDto {
  const answers = row.answers as FfqAnswers;
  return {
    id: row.id,
    patientId: row.patientId,
    answeredOn: row.answeredOn,
    answers,
    note: row.note,
    recordedByName,
    createdAt: row.createdAt.toISOString(),
    items: ffqItemResults(answers),
    gapa: gapaComparison(answers, sex),
    wholeGrainPct: wholeGrainShare(answers),
  };
}
