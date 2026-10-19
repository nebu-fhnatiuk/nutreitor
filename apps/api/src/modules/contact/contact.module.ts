import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { InvitationsModule } from "../invitations/invitations.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { ContactRequestsController, PublicContactController } from "./contact.controllers.js";
import { ContactService } from "./contact.service.js";

/** Solicitudes de contacto desde la vidriera (ADR 0027). */
@Module({
  imports: [AuthModule, PatientsModule, InvitationsModule],
  controllers: [PublicContactController, ContactRequestsController],
  providers: [ContactService],
})
export class ContactModule {}
