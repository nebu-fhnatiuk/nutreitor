import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { BrandingController } from "./branding.controller.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";
import { OrgModulesController } from "./org-modules.controller.js";
import { OrgModulesService } from "./org-modules.service.js";
import { OrgPublicProfileController } from "./public-profile.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [
    OrganizationsController,
    BrandingController,
    OrgPublicProfileController,
    OrgModulesController,
  ],
  providers: [OrganizationsService, OrgModulesService],
})
export class OrganizationsModule {}
