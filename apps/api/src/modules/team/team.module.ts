import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { TeamController } from "./team.controller.js";
import { TeamService } from "./team.service.js";

/** Tablero del cuerpo técnico (KAN-109). */
@Module({
  imports: [AuthModule, PatientsModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
