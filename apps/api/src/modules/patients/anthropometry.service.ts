import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { anthropometrySessions, memberships, patients, users, type TenantTx } from "@nutreitor/db";
import {
  ANTHROPOMETRY_VALIDATED,
  ANTHRO_SITES,
  ageAt,
  anthropometryResults,
  type AnthroSex,
  type AnthroTakes,
  type AnthropometrySessionDto,
  type ClinicalVisibility,
  type PortalAnthropometryDto,
  type SaveAnthropometryDto,
} from "@nutreitor/shared";
import { and, desc, eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

type Row = typeof anthropometrySessions.$inferSelect;
type Subject = { sex: string | null; birthDate: string | null };

const KERR_KEYS = new Set<string>(ANTHRO_SITES.filter((s) => s.kerr).map((s) => s.key));

/**
 * Antropometría ISAK (ADR 0030). Mismo scoping que las mediciones (admin: todos;
 * profesional: asignados) y mismas capacidades (metric:read / metric:record). Se
 * guardan las tomas; los resultados se calculan acá en cada lectura, con el sexo y la
 * edad de la ficha a la fecha de la medición.
 */
@Injectable()
export class AnthropometryService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(patientId: string): Promise<AnthropometrySessionDto[]> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const subject = await loadSubject(tx, patientId);
      const rows = await tx
        .select({ s: anthropometrySessions, by: users.fullName })
        .from(anthropometrySessions)
        .leftJoin(memberships, eq(memberships.id, anthropometrySessions.measuredByMembershipId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(eq(anthropometrySessions.patientId, patientId))
        .orderBy(desc(anthropometrySessions.measuredAt), desc(anthropometrySessions.createdAt));
      return rows.map((r) => toDto(r.s, r.by, subject));
    });
  }

  create(patientId: string, dto: SaveAnthropometryDto): Promise<AnthropometrySessionDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const subject = await loadSubject(tx, patientId, true);
      const ctx = this.tenantDb.context;
      const [row] = await tx
        .insert(anthropometrySessions)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          measuredByMembershipId: access.membershipId!,
          measuredAt: dto.measuredAt,
          takes: dto.takes as Record<string, number[]>,
          note: dto.note ?? null,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "anthropometry.recorded",
        targetType: "patient",
        targetId: patientId,
        metadata: { sessionId: row!.id, sites: Object.keys(dto.takes).length },
      });
      return toDto(row!, null, subject);
    });
  }

  update(patientId: string, id: string, dto: SaveAnthropometryDto): Promise<AnthropometrySessionDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const subject = await loadSubject(tx, patientId, true);
      const [row] = await tx
        .update(anthropometrySessions)
        .set({
          measuredAt: dto.measuredAt,
          takes: dto.takes as Record<string, number[]>,
          note: dto.note ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(anthropometrySessions.id, id), eq(anthropometrySessions.patientId, patientId)))
        .returning();
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "anthropometry.updated",
        targetType: "patient",
        targetId: patientId,
        metadata: { sessionId: id },
      });
      return toDto(row, null, subject);
    });
  }

  remove(patientId: string, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const gone = await tx
        .delete(anthropometrySessions)
        .where(and(eq(anthropometrySessions.id, id), eq(anthropometrySessions.patientId, patientId)))
        .returning({ id: anthropometrySessions.id });
      if (gone.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "anthropometry.deleted",
        targetType: "patient",
        targetId: patientId,
        metadata: { sessionId: id },
      });
    });
  }

  /**
   * Para el portal del deportista: sólo lo que el profesional marcó visible y sólo con
   * las fórmulas validadas (mientras sea beta, nada).
   */
  async forPortal(tx: TenantTx, patientId: string, visibility: ClinicalVisibility): Promise<PortalAnthropometryDto[]> {
    if (!ANTHROPOMETRY_VALIDATED) return [];
    const show = (k: keyof ClinicalVisibility) => visibility[k] === true;
    if (!show("anthroSkinfolds") && !show("anthroFat") && !show("anthroKerr") && !show("anthroSomatotype")) return [];
    const subject = await loadSubject(tx, patientId);
    const rows = await tx
      .select()
      .from(anthropometrySessions)
      .where(eq(anthropometrySessions.patientId, patientId))
      .orderBy(desc(anthropometrySessions.measuredAt));
    return rows.map((row) => {
      const r = toDto(row, null, subject).results;
      const val = <T>(c: { ok: true; value: T } | { ok: false }) => (c.ok ? c.value : null);
      const k = val(r.kerr);
      const st = val(r.somatotype);
      return {
        measuredAt: row.measuredAt,
        sum6: show("anthroSkinfolds") ? val(r.sum6) : null,
        sum8: show("anthroSkinfolds") ? val(r.sum8) : null,
        fatPct: show("anthroFat")
          ? { durninWomersley: val(r.fat.durninWomersley), yuhasz: val(r.fat.yuhasz), faulkner: val(r.fat.faulkner) }
          : null,
        kerr: show("anthroKerr") && k ? { muscleKg: k.muscleKg, adiposeKg: k.adiposeKg, boneKg: k.boneKg } : null,
        somatotype: show("anthroSomatotype") && st ? { endo: st.endo, meso: st.meso, ecto: st.ecto } : null,
      };
    });
  }
}

/** Sexo y fecha de nacimiento de la ficha. Al escribir, exige paciente activo. */
async function loadSubject(tx: TenantTx, patientId: string, forWrite = false): Promise<Subject> {
  const [p] = await tx
    .select({ sex: patients.sex, birthDate: patients.birthDate, archivedAt: patients.archivedAt })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  if (!p) throw new NotFoundException();
  if (forWrite && p.archivedAt) throw new ConflictException("El paciente está archivado.");
  return { sex: p.sex, birthDate: p.birthDate };
}

function toDto(row: Row, measuredByName: string | null, subject: Subject): AnthropometrySessionDto {
  const sex: AnthroSex | null = subject.sex === "female" || subject.sex === "male" ? subject.sex : null;
  const takes = row.takes as AnthroTakes;
  return {
    id: row.id,
    patientId: row.patientId,
    measuredAt: row.measuredAt,
    measuredByName,
    takes,
    kerrBlock: Object.keys(takes).some((k) => KERR_KEYS.has(k)),
    note: row.note,
    results: anthropometryResults(takes, { sex, ageYears: ageAt(subject.birthDate, row.measuredAt) }),
    validated: ANTHROPOMETRY_VALIDATED,
    createdAt: row.createdAt.toISOString(),
  };
}
