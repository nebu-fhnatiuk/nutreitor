import { Inject, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import passportJwt from "passport-jwt";

import { APP_ENV, type ApiEnv } from "../../config/app-config.module.js";
import type { AccessPayload } from "../auth.service.js";

// passport-jwt es CJS: default import + destructure para interop ESM robusta.
const { ExtractJwt, Strategy } = passportJwt;

/** Extrae el access token de la cookie httpOnly `access_token`. */
const cookieExtractor = (req: Request): string | null => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.access_token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(APP_ENV) env: ApiEnv) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      secretOrKey: env.JWT_ACCESS_SECRET,
      ignoreExpiration: false,
    });
  }

  /** El valor retornado queda en `req.user`. El guard hace las verificaciones extra. */
  validate(payload: AccessPayload): AccessPayload {
    return payload;
  }
}
