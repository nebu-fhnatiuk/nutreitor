import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { auditLog } from "@nutreitor/db";
import type { AuditLogEntry } from "@nutreitor/shared";
import { desc, lt } from "drizzle-orm";

import { CapabilityGuard } from "../auth/capability.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../auth/require-capability.decorator.js";
import { TenantDbService } from "../database/tenant-db.service.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

@Controller("audit")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class AuditController {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Lista el audit log del tenant, más nuevo primero. Paginación por cursor
   * (`before` = createdAt ISO de la última fila vista) + desempate por `id` para
   * orden estable. El audit_log crece sin cota: nunca devolver "sólo los últimos".
   */
  @Get()
  @RequireCapability("audit:read")
  async list(
    @Query("before") before?: string,
    @Query("limit") limit?: string,
  ): Promise<AuditLogEntry[]> {
    const take = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const beforeDate = before ? new Date(before) : null;
    const cond =
      beforeDate && !Number.isNaN(beforeDate.getTime())
        ? lt(auditLog.createdAt, beforeDate)
        : undefined;

    const rows = await this.tenantDb.run((tx) =>
      tx
        .select()
        .from(auditLog)
        .where(cond)
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(take),
    );
    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      actorRole: r.actorRole,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
