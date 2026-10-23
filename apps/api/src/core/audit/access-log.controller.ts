import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { AccessLogEntry } from "@nutreitor/shared";

import { CapabilityGuard } from "../auth/capability.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../auth/require-capability.decorator.js";
import { AccessLogService } from "./access-log.service.js";

/** Quién vio datos de salud (KAN-23). Sólo el admin (`audit:read`). */
@Controller("access-log")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class AccessLogController {
  constructor(private readonly accessLog: AccessLogService) {}

  /** Más nuevo primero; cursor `before` = createdAt ISO de la última fila vista. */
  @Get()
  @RequireCapability("audit:read")
  list(
    @Query("patientId") patientId?: string,
    @Query("before") before?: string,
    @Query("limit") limit?: string,
  ): Promise<AccessLogEntry[]> {
    return this.accessLog.list({ patientId, before, limit });
  }
}
