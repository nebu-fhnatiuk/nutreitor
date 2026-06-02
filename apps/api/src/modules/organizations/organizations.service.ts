import { Injectable } from "@nestjs/common";
import { organizations } from "@nutreitor/db";
import type {
  CreateOrganizationDto,
  OrganizationDto,
} from "@nutreitor/shared";
import { desc } from "drizzle-orm";

import { AdminDbService } from "../../core/database/admin-db.service.js";

/**
 * Servicio de organizaciones = control-plane. El alta de un tenant no pertenece a
 * ningún tenant, así que usa AdminDbService (rol owner, fuera de RLS). El listado
 * también: ve todas las orgs de la plataforma.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly admin: AdminDbService) {}

  async create(dto: CreateOrganizationDto): Promise<OrganizationDto> {
    const [row] = await this.admin.db
      .insert(organizations)
      .values(dto)
      .returning();
    return toDto(row!);
  }

  async list(): Promise<OrganizationDto[]> {
    const rows = await this.admin.db
      .select()
      .from(organizations)
      .orderBy(desc(organizations.createdAt));
    return rows.map(toDto);
  }
}

function toDto(row: typeof organizations.$inferSelect): OrganizationDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    region: row.region,
    createdAt: row.createdAt.toISOString(),
  };
}
