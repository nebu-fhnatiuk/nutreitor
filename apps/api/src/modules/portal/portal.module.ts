import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { PortalController } from "./portal.controller.js";
import { PortalService } from "./portal.service.js";

/** Portal del paciente (su propia ficha, auto-reporte de mediciones y adherencia). */
@Module({
  imports: [AuthModule, PatientsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
