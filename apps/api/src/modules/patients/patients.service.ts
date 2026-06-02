import { Injectable } from "@nestjs/common";
import { patients } from "@nutreitor/db";
import type { CreatePatientDto, PatientDto } from "@nutreitor/shared";
import { desc } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";

/**
 * Servicio de pacientes. Nunca filtra por tenant_id a mano: corre todo dentro de
 * `tenantDb.run()`, y la policy RLS garantiza que sólo se vean/escriban filas del
 * tenant del contexto. Es la demostración del patrón POOL + RLS.
 */
@Injectable()
export class PatientsService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(): Promise<PatientDto[]> {
    const rows = await this.tenantDb.run((tx) =>
      tx.select().from(patients).orderBy(desc(patients.createdAt)),
    );
    return rows.map(toDto);
  }

  async create(dto: CreatePatientDto): Promise<PatientDto> {
    const ctx = this.tenantDb.context;
    const [row] = await this.tenantDb.run((tx) =>
      tx
        .insert(patients)
        // tenant_id y region salen del contexto, jamás del request.
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          fullName: dto.fullName,
        })
        .returning(),
    );
    return toDto(row!);
  }
}

function toDto(row: typeof patients.$inferSelect): PatientDto {
  return {
    id: row.id,
    fullName: row.fullName,
    region: row.region,
    createdAt: row.createdAt.toISOString(),
  };
}
