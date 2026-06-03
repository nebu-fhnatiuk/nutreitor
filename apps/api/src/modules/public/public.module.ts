import { Module } from "@nestjs/common";

import { AuthModule } from "../../core/auth/auth.module.js";
import { PublicController } from "./public.controller.js";
import { PublicService } from "./public.service.js";

/** Capa pública (lecturas). AuthModule provee TenantResolverService (bootstrap slug→org). */
@Module({
  imports: [AuthModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
