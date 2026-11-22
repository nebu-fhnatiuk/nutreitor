import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { patients, type TenantTx } from "@nutreitor/db";
import type { StaffSharingDto, StaffSharingSource, StaffSharingStatusDto } from "@nutreitor/shared";
import { eq } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

/**
 * Consentimiento del deportista para compartir su composición corporal (Σ6 y masa
 * muscular) con el cuerpo técnico de sus planteles (KAN-109, ADR 0054). Lo da él
 * desde el portal o lo registra el admin cuando firmó el papel del club. Default
 * apagado; cada cambio queda en la auditoría; revocar rige en la próxima lectura.
 */
@Injectable()
export class StaffSharingService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Estado del propio deportista (portal). */
  mine(): Promise<StaffSharingStatusDto> {
    return this.tenantDb.run(async (tx) => toStatus(await this.myPatient(tx)));
  }

  setByAthlete(dto: StaffSharingDto): Promise<StaffSharingStatusDto> {
    return this.tenantDb.run(async (tx) => this.save(tx, (await this.myPatient(tx)).id, dto, "athlete"));
  }

  setByAdmin(patientId: string, dto: StaffSharingDto): Promise<StaffSharingStatusDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      return this.save(tx, patientId, dto, "admin");
    });
  }

  private async myPatient(tx: TenantTx) {
    const { user } = getAuth();
    const [p] = await tx.select().from(patients).where(eq(patients.userId, user.id)).limit(1);
    if (!p || p.archivedAt) throw new NotFoundException();
    return p;
  }

  private async save(tx: TenantTx, patientId: string, dto: StaffSharingDto, by: StaffSharingSource): Promise<StaffSharingStatusDto> {
    const [row] = await tx
      .update(patients)
      .set({ shareBodyWithStaff: dto.shareBody, shareBodyWithStaffAt: new Date(), shareBodyWithStaffBy: by, updatedAt: new Date() })
      .where(eq(patients.id, patientId))
      .returning();
    if (!row) throw new NotFoundException();
    if (row.archivedAt) throw new ConflictException("El paciente está archivado.");
    await this.audit.recordForSession(tx, {
      action: "patient.staff_sharing_changed",
      targetType: "patient",
      targetId: patientId,
      metadata: { shareBody: dto.shareBody, by },
    });
    return toStatus(row);
  }
}

function toStatus(p: typeof patients.$inferSelect): StaffSharingStatusDto {
  return {
    shareBody: p.shareBodyWithStaff,
    at: p.shareBodyWithStaffAt ? p.shareBodyWithStaffAt.toISOString() : null,
    by: p.shareBodyWithStaffBy ?? null,
  };
}
