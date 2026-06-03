import { Global, Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

/**
 * Audit log. Global: `AuditService` se inyecta desde cualquier módulo que mute
 * estado administrativo. El controller expone la lectura (capability audit:read).
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
