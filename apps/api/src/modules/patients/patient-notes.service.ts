import { ForbiddenException, Injectable } from "@nestjs/common";
import { memberships, patientNotes, users, type TenantTx } from "@nutreitor/db";
import type { AddPatientNoteDto, PatientNoteDto } from "@nutreitor/shared";
import { desc, eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

/**
 * Notas clínicas APPEND-ONLY. El alta requiere acceso al paciente (admin o
 * asignación activa) y registra el autor = membership de la sesión. No hay editar
 * ni borrar: la inmutabilidad la fuerza el GRANT en DB (sólo SELECT+INSERT).
 */
@Injectable()
export class PatientNotesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async addNote(patientId: string, dto: AddPatientNoteDto): Promise<PatientNoteDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      if (!access.membershipId) {
        throw new ForbiddenException("No tenés un membership para autorar la nota.");
      }
      const ctx = getTenantContext();
      const [row] = await tx
        .insert(patientNotes)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          authorMembershipId: access.membershipId,
          content: dto.content,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "patient.note_added",
        targetType: "patient",
        targetId: patientId,
        metadata: { noteId: row!.id },
      });
      return this.toDto(tx, row!.id);
    });
  }

  /** Historial de notas con access check + tx propia (endpoint standalone). */
  async list(patientId: string): Promise<PatientNoteDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      return this.listNotes(tx, patientId);
    });
  }

  /** Historial de notas (más reciente primero). Lectura tras access check. */
  async listNotes(tx: TenantTx, patientId: string): Promise<PatientNoteDto[]> {
    const rows = await tx
      .select({
        id: patientNotes.id,
        authorMembershipId: patientNotes.authorMembershipId,
        authorName: users.fullName,
        content: patientNotes.content,
        createdAt: patientNotes.createdAt,
      })
      .from(patientNotes)
      .innerJoin(memberships, eq(memberships.id, patientNotes.authorMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(patientNotes.patientId, patientId))
      .orderBy(desc(patientNotes.createdAt));
    return rows.map((r) => ({
      id: r.id,
      authorMembershipId: r.authorMembershipId,
      authorName: r.authorName,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async toDto(tx: TenantTx, noteId: string): Promise<PatientNoteDto> {
    const rows = await tx
      .select({
        id: patientNotes.id,
        authorMembershipId: patientNotes.authorMembershipId,
        authorName: users.fullName,
        content: patientNotes.content,
        createdAt: patientNotes.createdAt,
      })
      .from(patientNotes)
      .innerJoin(memberships, eq(memberships.id, patientNotes.authorMembershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(patientNotes.id, noteId))
      .limit(1);
    const r = rows[0]!;
    return {
      id: r.id,
      authorMembershipId: r.authorMembershipId,
      authorName: r.authorName,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
