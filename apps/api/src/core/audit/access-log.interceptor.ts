import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { mergeMap, type Observable } from "rxjs";

import { ACCESS_LOG_KEY, type AccessLogSpec } from "./access-log.decorator.js";
import { AccessLogService } from "./access-log.service.js";

/**
 * Global: en los handlers marcados con `@LogsAccess`, registra la lectura cuando
 * el handler terminó bien y ANTES de responder. Si el registro falla, la lectura
 * falla: no hay acceso a datos de salud sin rastro (ADR 0042).
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessLog: AccessLogService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const spec = this.reflector.get<AccessLogSpec | undefined>(ACCESS_LOG_KEY, ctx.getHandler());
    if (!spec) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        await this.accessLog.recordRead(spec, req.params as Record<string, string>);
        return body;
      }),
    );
  }
}
