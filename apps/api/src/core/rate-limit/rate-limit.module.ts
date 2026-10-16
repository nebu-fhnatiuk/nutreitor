import { Global, Module } from "@nestjs/common";

import { RateLimitGuard } from "./rate-limit.guard.js";
import { RateLimitService } from "./rate-limit.service.js";

/** Rate-limiting (ADR 0017). Global: cualquier controller puede usar @RateLimit. */
@Global()
@Module({
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
