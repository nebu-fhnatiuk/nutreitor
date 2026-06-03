import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { ProfessionalProfileController } from "./professional-profile.controller.js";
import { ProfessionalProfileService } from "./professional-profile.service.js";

/**
 * Profesionales (staff del tenant). Por ahora: edición del perfil público propio
 * (vidriera por membership). Dashboard/planes/seguimiento llegan en etapas futuras.
 */
@Module({
  imports: [AuthModule],
  controllers: [ProfessionalProfileController],
  providers: [ProfessionalProfileService],
})
export class ProfessionalsModule {}
