import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { careAssignments, memberships, patients, users, type TenantTx } from "@nutreitor/db";
import {
  hasCapability,
  type CreatePatientDto,
  type PatientDetailDto,
  type PatientDto,
  type UpdatePatientDto,
} from "@nutreitor/shared";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth } from "../../core/tenant/tenant-context.store.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import {
  assertCanAccessPatient,
  assertLocationInTenant,
  resolvePatientAccess,
} from "./patient-access.js";
import { PatientNotesService } from "./patient-notes.service.js";

type PatientRow = typeof patients.$inferSelect;

/**
 * Pacientes (entidad clínica). Nunca filtra por tenant_id a mano: corre dentro de
 * `tenantDb.run()` y RLS aísla por tenant. El scoping fino (admin=todos /
 * profesional=asignados) vive en patient-access; acá se aplica al listar y al leer.
 */
@Injectable()
export class PatientsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
    private readonly assignments: CareAssignmentsService,
    private readonly notes: PatientNotesService,
  ) {}

  /** Listado scopeado: admin ve todos los del tenant; profesional, sólo asignados. */
  async list(search?: string): Promise<PatientDto[]> {
    const term = search?.trim();
    const textFilter = term
      ? or(
          ilike(patients.fullName, `%${term}%`),
          ilike(patients.documentId, `%${term}%`),
          ilike(patients.email, `%${term}%`),
        )
      : undefined;

    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);

      const cols = {
        id: patients.id,
        fullName: patients.fullName,
        documentId: patients.documentId,
        email: patients.email,
        region: patients.region,
        userId: patients.userId,
        archivedAt: patients.archivedAt,
        createdAt: patients.createdAt,
      };

      const rows = access.isAdmin
        ? await tx
            .select(cols)
            .from(patients)
            .where(and(isNull(patients.archivedAt), textFilter))
            .orderBy(desc(patients.createdAt))
        : access.membershipId
          ? // Profesional: sólo pacientes con asignación ACTIVA suya.
            await tx
              .selectDistinct(cols)
              .from(patients)
              .innerJoin(
                careAssignments,
                and(
                  eq(careAssignments.patientId, patients.id),
                  eq(careAssignments.membershipId, access.membershipId),
                  eq(careAssignments.status, "active"),
                ),
              )
              .where(and(isNull(patients.archivedAt), textFilter))
              .orderBy(desc(patients.createdAt))
          : [];

      const profByPatient = await this.activeProfessionalsByPatient(
        tx,
        rows.map((r) => r.id),
      );

      return rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        documentId: r.documentId,
        email: r.email,
        region: r.region,
        hasAccount: r.userId !== null,
        activeProfessionals: profByPatient.get(r.id) ?? [],
        archived: r.archivedAt !== null,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  /** Ficha completa (con access check). `clinical` = null si falta read_clinical. */
  async getOne(id: string): Promise<PatientDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, id, access);

      const [row] = await tx
        .select()
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);
      if (!row) throw new NotFoundException();

      const [assignments, notes] = await Promise.all([
        this.assignments.listInTx(tx, id),
        this.notes.listNotes(tx, id),
      ]);

      const { user } = getAuth();
      const canClinical = hasCapability(user.role, "patient:read_clinical");
      return toDetailDto(row, canClinical, assignments, notes);
    });
  }

  /**
   * Alta de paciente. Atajo opcional crear-y-asignar: si viene assignToMembershipId
   * invoca la MISMA operación de asignación, en la misma tx (no duplica lógica).
   */
  async create(dto: CreatePatientDto): Promise<PatientDetailDto> {
    const ctx = this.tenantDb.context;
    const { user } = getAuth();
    const canClinical = hasCapability(user.role, "patient:read_clinical");
    // El atajo crear-y-asignar requiere patient:assign (admin); defensa en
    // profundidad además de que el profesional ya no tiene patient:create.
    if (
      dto.assignToMembershipId &&
      !hasCapability(user.role, "patient:assign")
    ) {
      throw new ForbiddenException("No tenés permiso para asignar profesionales.");
    }
    return this.tenantDb.run(async (tx) => {
      await assertLocationInTenant(tx, dto.locationId);
      const [row] = await tx
        .insert(patients)
        .values({
          // tenant_id y region salen del contexto, jamás del request.
          tenantId: ctx.tenantId,
          region: ctx.region,
          ...fichaValues(dto, canClinical),
          // fullName es obligatorio en el alta (el spread lo deja opcional).
          fullName: dto.fullName,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "patient.created",
        targetType: "patient",
        targetId: row!.id,
      });

      if (dto.assignToMembershipId) {
        await this.assignments.assignInTx(tx, row!.id, {
          membershipId: dto.assignToMembershipId,
          locationId: dto.locationId ?? null,
        });
      }

      const [assignments, notes] = await Promise.all([
        this.assignments.listInTx(tx, row!.id),
        this.notes.listNotes(tx, row!.id),
      ]);
      return toDetailDto(row!, canClinical, assignments, notes);
    });
  }

  /** Edita campos sobrescribibles (con access check) + audit. */
  async update(id: string, dto: UpdatePatientDto): Promise<PatientDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, id, access);
      const { user } = getAuth();
      const canClinical = hasCapability(user.role, "patient:read_clinical");

      // No se mutan pacientes archivados (la baja lógica es terminal salvo restore).
      const [existing] = await tx
        .select({ id: patients.id, archivedAt: patients.archivedAt })
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);
      if (!existing) throw new NotFoundException();
      if (existing.archivedAt) {
        throw new ConflictException("El paciente está archivado.");
      }
      await assertLocationInTenant(tx, dto.locationId);

      // Sin read_clinical, los campos clínicos se ignoran (no clobber a ciegas).
      const patch = fichaValues(dto, canClinical);
      const changed = Object.keys(patch);
      const [row] = changed.length
        ? await tx
            .update(patients)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(patients.id, id))
            .returning()
        : await tx.select().from(patients).where(eq(patients.id, id)).limit(1);
      if (!row) throw new NotFoundException();
      if (changed.length) {
        await this.audit.recordForSession(tx, {
          action: "patient.updated",
          targetType: "patient",
          targetId: id,
          metadata: { fields: changed },
        });
      }

      const [assignments, notes] = await Promise.all([
        this.assignments.listInTx(tx, id),
        this.notes.listNotes(tx, id),
      ]);
      return toDetailDto(row, canClinical, assignments, notes);
    });
  }

  /** Baja lógica (soft-delete): marca archivedAt. Nunca borra físico. */
  async archive(id: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, id, access);
      const updated = await tx
        .update(patients)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(patients.id, id), isNull(patients.archivedAt)))
        .returning({ id: patients.id });
      if (updated.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "patient.archived",
        targetType: "patient",
        targetId: id,
      });
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Mapa patientId → nombres de profesionales con asignación activa. */
  private async activeProfessionalsByPatient(
    tx: TenantTx,
    patientIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (patientIds.length === 0) return map;
    const rows = await tx
      .select({
        patientId: careAssignments.patientId,
        name: users.fullName,
      })
      .from(careAssignments)
      .innerJoin(memberships, eq(memberships.id, careAssignments.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          inArray(careAssignments.patientId, patientIds),
          eq(careAssignments.status, "active"),
        ),
      );
    for (const r of rows) {
      const list = map.get(r.patientId) ?? [];
      list.push(r.name);
      map.set(r.patientId, list);
    }
    return map;
  }
}

/** Campos clínicos sensibles: sólo se escriben con patient:read_clinical. */
const CLINICAL_KEYS = [
  "reasonForConsult",
  "medicalHistory",
  "allergies",
  "currentMedication",
  "diagnosedConditions",
  "familyHistory",
] as const;

/**
 * Mapea los campos definidos del dto a columnas (undefined = no tocar). Si la
 * sesión no tiene read_clinical, los campos clínicos se omiten: no se permite
 * escribir (clobber) datos clínicos que no se pueden leer.
 */
function fichaValues(
  dto: CreatePatientDto | UpdatePatientDto,
  canClinical: boolean,
): Partial<typeof patients.$inferInsert> {
  const p: Partial<typeof patients.$inferInsert> = {};
  const set = <K extends keyof typeof patients.$inferInsert>(
    key: K,
    val: (typeof patients.$inferInsert)[K] | undefined,
  ) => {
    if (val !== undefined) p[key] = val;
  };
  set("fullName", dto.fullName);
  set("documentId", dto.documentId);
  set("birthDate", dto.birthDate);
  set("sex", dto.sex);
  set("email", dto.email);
  set("phone", dto.phone);
  set("country", dto.country);
  set("timezone", dto.timezone);
  set("reasonForConsult", dto.reasonForConsult);
  set("medicalHistory", dto.medicalHistory);
  set("allergies", dto.allergies);
  set("currentMedication", dto.currentMedication);
  set("diagnosedConditions", dto.diagnosedConditions);
  set("familyHistory", dto.familyHistory);
  set("heightCm", dto.heightCm);
  // numeric() en drizzle se inserta/lee como string.
  if (dto.initialWeightKg !== undefined) {
    p.initialWeightKg = dto.initialWeightKg === null ? null : String(dto.initialWeightKg);
  }
  set("activityLevel", dto.activityLevel);
  set("goal", dto.goal);
  set("dietaryPreferences", dto.dietaryPreferences);
  set("locationId", dto.locationId);
  if (!canClinical) {
    for (const k of CLINICAL_KEYS) delete p[k];
  }
  return p;
}

function toDetailDto(
  row: PatientRow,
  canClinical: boolean,
  assignments: PatientDetailDto["assignments"],
  notes: PatientDetailDto["notes"],
): PatientDetailDto {
  return {
    id: row.id,
    fullName: row.fullName,
    documentId: row.documentId,
    birthDate: row.birthDate,
    sex: row.sex as PatientDetailDto["sex"],
    email: row.email,
    phone: row.phone,
    country: row.country,
    timezone: row.timezone,
    heightCm: row.heightCm,
    initialWeightKg: row.initialWeightKg === null ? null : Number(row.initialWeightKg),
    activityLevel: row.activityLevel as PatientDetailDto["activityLevel"],
    goal: row.goal,
    dietaryPreferences: row.dietaryPreferences,
    locationId: row.locationId,
    region: row.region,
    hasAccount: row.userId !== null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    clinical: canClinical
      ? {
          reasonForConsult: row.reasonForConsult,
          medicalHistory: row.medicalHistory,
          allergies: row.allergies,
          currentMedication: row.currentMedication,
          diagnosedConditions: row.diagnosedConditions,
          familyHistory: row.familyHistory,
        }
      : null,
    assignments,
    notes,
  };
}
