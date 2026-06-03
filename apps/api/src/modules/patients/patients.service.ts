import { Injectable } from "@nestjs/common";
import { patients } from "@nutreitor/db";
import type { CreatePatientDto, PatientDto } from "@nutreitor/shared";
import { desc } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";

/**
 * Servicio de pacientes (entidad clínica). Nunca filtra por tenant_id a mano:
 * corre todo dentro de `tenantDb.run()`, y la policy RLS garantiza el aislamiento.
 */
@Injectable()
export class PatientsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PatientDto[]> {
    const rows = await this.tenantDb.run((tx) =>
      tx.select().from(patients).orderBy(desc(patients.createdAt)),
    );
    return rows.map(toDto);
  }

  async create(dto: CreatePatientDto): Promise<PatientDto> {
    const ctx = this.tenantDb.context;
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(patients)
        // tenant_id y region salen del contexto, jamás del request.
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          fullName: dto.fullName,
          email: dto.email ?? null,
        })
        .returning();
      await this.audit.recordForSession(tx, {
        action: "patient.created",
        targetType: "patient",
        targetId: row!.id,
      });
      return toDto(row!);
    });
  }
}

function toDto(row: typeof patients.$inferSelect): PatientDto {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    region: row.region,
    hasAccount: row.userId !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
