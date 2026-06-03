import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { PortalController } from "./portal.controller.js";
import { PortalService } from "./portal.service.js";

/** Portal del paciente (lectura de su propia ficha + auto-reporte de mediciones). */
@Module({
  imports: [AuthModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
