import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthModule } from "../auth/auth.module.js";
import { AccessLogController } from "./access-log.controller.js";
import { AccessLogInterceptor } from "./access-log.interceptor.js";
import { AccessLogService } from "./access-log.service.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

/**
 * Audit log (cambios) y registro de lecturas de datos de salud (KAN-23). Global:
 * `AuditService` se inyecta desde cualquier módulo que mute estado administrativo;
 * el AccessLogInterceptor actúa en los GET marcados con `@LogsAccess`.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController, AccessLogController],
  providers: [AuditService, AccessLogService, { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor }],
  exports: [AuditService, AccessLogService],
})
export class AuditModule {}
