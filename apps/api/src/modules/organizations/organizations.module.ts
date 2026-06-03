import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { BrandingController } from "./branding.controller.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, BrandingController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
