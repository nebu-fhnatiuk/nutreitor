import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";

import { clientIp } from "./client-ip.js";
import { RateLimitService } from "./rate-limit.service.js";
import { RATE_LIMIT_KEY, type RateLimitRule } from "./rate-limiter.js";

/**
 * Aplica las reglas declaradas con @RateLimit. Corre antes de los pipes, así que
 * el body llega sin validar: el email se normaliza acá y, si no hay, la regla por
 * email simplemente no aplica (la de IP sigue cubriendo). 429 + `Retry-After`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<RateLimitRule[] | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!rules?.length) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    for (const rule of rules) {
      const subject = subjectFor(rule, req);
      if (!subject) continue;
      const verdict = await this.limiter.check(rule, subject);
      if (!verdict.ok) {
        http.getResponse<Response>().setHeader("Retry-After", String(verdict.retryAfterSec));
        throw new HttpException(
          "Demasiados intentos. Esperá un momento y volvé a probar.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}

/** Sujeto de la regla. El email se scopea al tenant (mismo email, otra org = otra cuenta). */
export function subjectFor(rule: RateLimitRule, req: Request): string | null {
  if (rule.by === "ip") return clientIp(req);
  const body = req.body as { email?: unknown } | undefined;
  if (typeof body?.email !== "string" || !body.email.trim()) return null;
  const slug = req.headers["x-tenant-slug"];
  return `${(Array.isArray(slug) ? slug[0] : slug) ?? ""}|${body.email.trim().toLowerCase()}`;
}
