import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";

import { RateLimitGuard } from "./rate-limit.guard.js";
import { RATE_LIMIT_KEY, type RateLimitRule } from "./rate-limiter.js";

/**
 * Limita el handler con TODAS las reglas listadas (cualquiera que se pase → 429).
 * Va por handler, no global: sólo lo expuesto sin sesión necesita este control.
 */
export const RateLimit = (...rules: RateLimitRule[]) =>
  applyDecorators(SetMetadata(RATE_LIMIT_KEY, rules), UseGuards(RateLimitGuard));
