import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { PortalSchedulingController } from "./portal-scheduling.controller.js";
import { PublicSchedulingController } from "./public-scheduling.controller.js";
import { SchedulingController } from "./scheduling.controller.js";
import { SchedulingService } from "./scheduling.service.js";

/**
 * Agendamiento (motor propio, etapa 2 del recorrido). Disponibilidad semanal del
 * profesional + citas tenant-scoped bajo RLS; slots derivados en el huso del
 * profesional (DST por Luxon). No-overlap forzado por la DB (EXCLUDE gist).
 *
 * Invariante: UTC en storage, conversión en presentación, DST por país. La
 * decisión motor-propio-vs-Cal.com queda registrada como ADR en docs/decisions.
 */
@Module({
  imports: [AuthModule],
  controllers: [SchedulingController, PortalSchedulingController, PublicSchedulingController],
  providers: [SchedulingService],
})
export class SchedulingModule {}
