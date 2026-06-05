import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { AgentsController } from "./agents.controller.js";
import { AgentsService } from "./agents.service.js";

/**
 * Gateway hacia el servicio de agentes (Python). Sólo valida + firma + reenvía; la
 * inferencia y el acceso a datos (bajo RLS) viven en el servicio Python (ADR 0013).
 */
@Module({
  imports: [AuthModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
