import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthModule } from "../../core/auth/auth.module.js";
import { OnboardingStatusService } from "./onboarding-status.service.js";
import {
  OnboardingStatusController,
  PlatformAuthController,
  PlatformController,
  PlatformLeadsController,
  PublicLeadsController,
  SignupController,
} from "./onboarding.controllers.js";
import { LeadsService } from "./leads.service.js";
import { PlatformAuthService, PlatformGuard } from "./platform-auth.js";
import { PlatformService } from "./platform.service.js";
import { SignupService } from "./signup.service.js";

/** Alta de organizaciones + consola de plataforma (ADR 0025) + consultas comerciales (ADR 0041). */
@Module({
  imports: [AuthModule, JwtModule.register({})],
  controllers: [
    SignupController,
    PlatformAuthController,
    PlatformController,
    OnboardingStatusController,
    PublicLeadsController,
    PlatformLeadsController,
  ],
  providers: [
    SignupService,
    PlatformAuthService,
    PlatformGuard,
    PlatformService,
    OnboardingStatusService,
    LeadsService,
  ],
  exports: [PlatformGuard, PlatformAuthService],
})
export class OnboardingModule {}
