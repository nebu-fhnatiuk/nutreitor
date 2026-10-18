import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthModule } from "../../core/auth/auth.module.js";
import { OnboardingStatusService } from "./onboarding-status.service.js";
import {
  OnboardingStatusController,
  PlatformAuthController,
  PlatformController,
  SignupController,
} from "./onboarding.controllers.js";
import { PlatformAuthService, PlatformGuard } from "./platform-auth.js";
import { PlatformService } from "./platform.service.js";
import { SignupService } from "./signup.service.js";

/** Alta de organizaciones + consola de plataforma (ADR 0025). */
@Module({
  imports: [AuthModule, JwtModule.register({})],
  controllers: [
    SignupController,
    PlatformAuthController,
    PlatformController,
    OnboardingStatusController,
  ],
  providers: [
    SignupService,
    PlatformAuthService,
    PlatformGuard,
    PlatformService,
    OnboardingStatusService,
  ],
  exports: [PlatformGuard, PlatformAuthService],
})
export class OnboardingModule {}
