import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { memberships, patients, sweatTests, users, type TenantTx } from "@nutreitor/db";
import {
  sweatTestResults,
  type GroupSweatRowDto,
  type SaveGroupSweatTestDto,
  type SaveSweatTestDto,
  type SweatTestDto,
} from "@nutreitor/shared";
import { and, desc, eq, inArray } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { loadGroup, visibleMembers } from "./groups.service.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type Row = typeof sweatTests.$inferSelect;

/**
 * Pruebas de sudoración (ADR 0036). Mismo scoping y capacidades que las mediciones
 * (metric:read / metric:record; profesional → asignados). La carga por plantel sigue
 * las reglas de la antropometría de grupo (ADR 0031): todo o nada, sólo miembros
 * visibles.
 */
@Injectable()
export class HydrationService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(patientId: string): Promise<SweatTestDto[]> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const rows = await tx
        .select({ r: sweatTests, by: users.fullName })
        .from(sweatTests)
        .leftJoin(memberships, eq(memberships.id, sweatTests.recordedByMembershipId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(eq(sweatTests.patientId, patientId))
        .orderBy(desc(sweatTests.measuredOn), desc(sweatTests.createdAt));
      return rows.map((x) => toDto(x.r, x.by));
    });
  }

  create(patientId: string, dto: SaveSweatTestDto): Promise<SweatTestDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      await assertActive(tx, patientId);
      const ctx = this.tenantDb.context;
      const [row] = await tx
        .insert(sweatTests)
        .values({ tenantId: ctx.tenantId, region: ctx.region, patientId, recordedByMembershipId: access.membershipId!, ...sessionValues(dto), ...athleteValues(dto), note: dto.note || null })
        .returning();
      await this.audit.recordForSession(tx, { action: "sweat_test.recorded", targetType: "patient", targetId: patientId, metadata: { testId: row!.id } });
      return toDto(row!, null);
    });
  }

  update(patientId: string, id: string, dto: SaveSweatTestDto): Promise<SweatTestDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      await assertActive(tx, patientId);
      const [row] = await tx
        .update(sweatTests)
        .set({ ...sessionValues(dto), ...athleteValues(dto), note: dto.note || null, updatedAt: new Date() })
        .where(and(eq(sweatTests.id, id), eq(sweatTests.patientId, patientId)))
        .returning();
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "sweat_test.updated", targetType: "patient", targetId: patientId, metadata: { testId: id } });
      return toDto(row, null);
    });
  }

  remove(patientId: string, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const gone = await tx
        .delete(sweatTests)
        .where(and(eq(sweatTests.id, id), eq(sweatTests.patientId, patientId)))
        .returning({ id: sweatTests.id });
      if (gone.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "sweat_test.deleted", targetType: "patient", targetId: patientId, metadata: { testId: id } });
    });
  }

  /** Plantel: misma sesión para todos, una prueba por deportista, en una transacción. */
  createForGroup(groupId: string, dto: SaveGroupSweatTestDto): Promise<{ created: number }> {
    return this.tenantDb.run(async (tx) => {
      await loadGroup(tx, groupId);
      const access = await resolvePatientAccess(tx);
      const members = new Set((await visibleMembers(tx, groupId, access)).map((m) => m.patientId));
      if (dto.entries.some((e) => !members.has(e.patientId))) {
        throw new BadRequestException("Hay deportistas que no están en el grupo.");
      }
      const ctx = this.tenantDb.context;
      const rows = await tx
        .insert(sweatTests)
        .values(
          dto.entries.map((e) => ({
            tenantId: ctx.tenantId,
            region: ctx.region,
            patientId: e.patientId,
            recordedByMembershipId: access.membershipId!,
            groupId,
            ...sessionValues(dto),
            ...athleteValues(e),
          })),
        )
        .returning({ id: sweatTests.id, patientId: sweatTests.patientId });
      for (const r of rows) {
        await this.audit.recordForSession(tx, {
          action: "sweat_test.recorded",
          targetType: "patient",
          targetId: r.patientId,
          metadata: { testId: r.id, groupId, batch: true },
        });
      }
      return { created: rows.length };
    });
  }

  /** Última prueba de cada deportista visible del grupo. */
  groupSummary(groupId: string): Promise<GroupSweatRowDto[]> {
    return this.tenantDb.run(async (tx) => {
      await loadGroup(tx, groupId);
      const members = await visibleMembers(tx, groupId, await resolvePatientAccess(tx));
      const ids = members.map((m) => m.patientId);
      const rows = ids.length
        ? await tx
            .select()
            .from(sweatTests)
            .where(inArray(sweatTests.patientId, ids))
            .orderBy(desc(sweatTests.measuredOn), desc(sweatTests.createdAt))
        : [];
      const latest = new Map<string, Row>();
      for (const r of rows) if (!latest.has(r.patientId)) latest.set(r.patientId, r);
      return members.map((m) => {
        const r = latest.get(m.patientId);
        return { patientId: m.patientId, fullName: m.fullName, last: r ? toDto(r, null) : null };
      });
    });
  }
}

function sessionValues(d: SaveSweatTestDto | SaveGroupSweatTestDto) {
  return {
    measuredOn: d.measuredOn,
    sessionLabel: d.sessionLabel || null,
    durationMin: d.durationMin,
    temperatureC: d.temperatureC == null ? null : String(d.temperatureC),
    humidityPct: d.humidityPct ?? null,
  };
}

function athleteValues(d: { preWeightKg: number; postWeightKg: number; fluidIntakeMl: number; urineMl: number }) {
  return {
    preWeightKg: String(d.preWeightKg),
    postWeightKg: String(d.postWeightKg),
    fluidIntakeMl: d.fluidIntakeMl,
    urineMl: d.urineMl,
  };
}

async function assertActive(tx: TenantTx, patientId: string): Promise<void> {
  const [p] = await tx.select({ archivedAt: patients.archivedAt }).from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!p) throw new NotFoundException();
  if (p.archivedAt) throw new ConflictException("El paciente está archivado.");
}

function toDto(r: Row, recordedByName: string | null): SweatTestDto {
  const pre = Number(r.preWeightKg);
  const post = Number(r.postWeightKg);
  return {
    id: r.id,
    patientId: r.patientId,
    groupId: r.groupId,
    measuredOn: r.measuredOn,
    sessionLabel: r.sessionLabel,
    durationMin: r.durationMin,
    temperatureC: r.temperatureC == null ? null : Number(r.temperatureC),
    humidityPct: r.humidityPct,
    preWeightKg: pre,
    postWeightKg: post,
    fluidIntakeMl: r.fluidIntakeMl,
    urineMl: r.urineMl,
    note: r.note,
    recordedByName,
    createdAt: r.createdAt.toISOString(),
    results: sweatTestResults({ preWeightKg: pre, postWeightKg: post, durationMin: r.durationMin, fluidIntakeMl: r.fluidIntakeMl, urineMl: r.urineMl }),
  };
}
