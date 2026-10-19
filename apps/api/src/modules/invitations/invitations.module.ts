import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { InvitationsAdminController } from "./invitations.admin.controller.js";
import { InvitationsPublicController } from "./invitations.public.controller.js";
import { InvitationsService } from "./invitations.service.js";

@Module({
  imports: [AuthModule],
  controllers: [InvitationsAdminController, InvitationsPublicController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
