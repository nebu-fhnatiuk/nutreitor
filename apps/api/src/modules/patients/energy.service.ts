import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { anthropometrySessions, energyRequirements, memberships, patientMetrics, patients, users, type TenantTx } from "@nutreitor/db";
import {
  ageAt,
  anthropometryResults,
  energyResults,
  finalValue,
  type AnthroTakes,
  type EnergyContextDto,
  type EnergyRequirementDto,
  type EnergySex,
  type SaveEnergyDto,
  type SourcedValue,
} from "@nutreitor/shared";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type Row = typeof energyRequirements.$inferSelect;
type Subject = { sex: EnergySex | null; birthDate: string | null };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Requerimiento energético con periodización (ADR 0032). Mismo scoping que el plan
 * (admin: todos; profesional: asignados) y mismas capacidades (plan:read / plan:write).
 * Append-only: guardar crea una versión; la primera de la lista es la vigente.
 */
@Injectable()
export class EnergyService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(patientId: string): Promise<EnergyRequirementDto[]> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const subject = await loadSubject(tx, patientId);
      const rows = await tx
        .select({ r: energyRequirements, by: users.fullName })
        .from(energyRequirements)
        .leftJoin(memberships, eq(memberships.id, energyRequirements.createdByMembershipId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(eq(energyRequirements.patientId, patientId))
        .orderBy(desc(energyRequirements.createdAt));
      return rows.map((x) => toDto(x.r, x.by, subject));
    });
  }

  create(patientId: string, dto: SaveEnergyDto): Promise<EnergyRequirementDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const subject = await loadSubject(tx, patientId, true);
      const ctx = this.tenantDb.context;
      const { note, ...inputs } = dto;
      const [row] = await tx
        .insert(energyRequirements)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          createdByMembershipId: access.membershipId!,
          inputs,
          note: note ?? null,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "energy.saved",
        targetType: "patient",
        targetId: patientId,
        metadata: { requirementId: row!.id, formula: dto.formula, dayTypes: dto.dayTypes.length },
      });
      return toDto(row!, null, subject);
    });
  }

  /**
   * Para precargar uno nuevo: sexo y edad de la ficha; peso de la medición más reciente
   * (antropometría o evolución); talla de la antropometría o de la ficha; masa libre de
   * grasa de la última antropometría con % graso calculable.
   */
  context(patientId: string): Promise<EnergyContextDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const [p] = await tx
        .select({ sex: patients.sex, birthDate: patients.birthDate, heightCm: patients.heightCm, initialWeightKg: patients.initialWeightKg })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);
      if (!p) throw new NotFoundException();
      const sex = binarySex(p.sex);

      const [anthro] = await tx
        .select()
        .from(anthropometrySessions)
        .where(eq(anthropometrySessions.patientId, patientId))
        .orderBy(desc(anthropometrySessions.measuredAt), desc(anthropometrySessions.createdAt))
        .limit(1);
      const [metric] = await tx
        .select({ measuredAt: patientMetrics.measuredAt, weightKg: patientMetrics.weightKg })
        .from(patientMetrics)
        .where(and(eq(patientMetrics.patientId, patientId), isNotNull(patientMetrics.weightKg)))
        .orderBy(desc(patientMetrics.measuredAt))
        .limit(1);

      const takes = (anthro?.takes ?? {}) as AnthroTakes;
      const anthroMass = anthro ? finalValue(takes.bodyMass) : null;
      const anthroStature = anthro ? finalValue(takes.stature) : null;

      let weightKg: SourcedValue | null = null;
      if (anthroMass != null) weightKg = { value: anthroMass, source: "anthropometry", date: anthro!.measuredAt };
      if (metric?.weightKg && (!weightKg || metric.measuredAt > weightKg.date!)) {
        weightKg = { value: Number(metric.weightKg), source: "metric", date: metric.measuredAt };
      }
      if (!weightKg && p.initialWeightKg) weightKg = { value: Number(p.initialWeightKg), source: "record", date: null };

      const heightCm: SourcedValue | null =
        anthroStature != null
          ? { value: anthroStature, source: "anthropometry", date: anthro!.measuredAt }
          : p.heightCm
            ? { value: p.heightCm, source: "record", date: null }
            : null;

      let ffmKg: SourcedValue | null = null;
      if (anthro && anthroMass != null) {
        const r = anthropometryResults(takes, { sex, ageYears: ageAt(p.birthDate, anthro.measuredAt) });
        const fat = r.fat.durninWomersley.ok ? r.fat.durninWomersley.value : r.fat.yuhasz.ok ? r.fat.yuhasz.value : null;
        if (fat != null) {
          ffmKg = { value: Math.round(anthroMass * (1 - fat / 100) * 10) / 10, source: "anthropometry", date: anthro.measuredAt };
        }
      }

      return { sex, ageYears: ageAt(p.birthDate, isoDay(new Date())), weightKg, heightCm, ffmKg };
    });
  }
}

/**
 * Versión vigente del requerimiento (la más reciente), o null. Sin chequeo de acceso:
 * la llama quien ya lo verificó dentro de su tx (el guardado del plan, KAN-97).
 */
export async function latestEnergyRequirement(tx: TenantTx, patientId: string): Promise<EnergyRequirementDto | null> {
  const [x] = await tx
    .select({ r: energyRequirements, by: users.fullName })
    .from(energyRequirements)
    .leftJoin(memberships, eq(memberships.id, energyRequirements.createdByMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(eq(energyRequirements.patientId, patientId))
    .orderBy(desc(energyRequirements.createdAt))
    .limit(1);
  if (!x) return null;
  return toDto(x.r, x.by, await loadSubject(tx, patientId));
}

function binarySex(s: string | null): EnergySex | null {
  return s === "female" || s === "male" ? s : null;
}

async function loadSubject(tx: TenantTx, patientId: string, forWrite = false): Promise<Subject> {
  const [p] = await tx
    .select({ sex: patients.sex, birthDate: patients.birthDate, archivedAt: patients.archivedAt })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  if (!p) throw new NotFoundException();
  if (forWrite && p.archivedAt) throw new ConflictException("El paciente está archivado.");
  return { sex: binarySex(p.sex), birthDate: p.birthDate };
}

function toDto(row: Row, createdByName: string | null, subject: Subject): EnergyRequirementDto {
  const inputs = row.inputs as unknown as Omit<SaveEnergyDto, "note">;
  const ageYears = ageAt(subject.birthDate, isoDay(row.createdAt));
  return {
    ...inputs,
    week: inputs.week ?? {},
    note: row.note,
    id: row.id,
    patientId: row.patientId,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    sex: subject.sex,
    ageYears,
    results: energyResults(inputs, {
      sex: subject.sex,
      ageYears,
      weightKg: inputs.weightKg,
      heightCm: inputs.heightCm ?? null,
      ffmKg: inputs.ffmKg ?? null,
    }),
  };
}
