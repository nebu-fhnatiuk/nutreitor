import type { CookieOptions, Response } from "express";

import type { ApiEnv } from "../config/app-config.module.js";
import type { IssuedSession } from "./auth.service.js";

/** ACCESS_TTL viene como "900s"; devuelve los segundos para el maxAge de la cookie. */
function accessTtlSeconds(env: ApiEnv): number {
  const m = /^(\d+)\s*s?$/.exec(env.ACCESS_TTL);
  return m ? Number(m[1]) : 900;
}

function baseCookie(env: ApiEnv): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: env.COOKIE_SECURE, path: "/" };
}

/** Setea las cookies httpOnly de sesión (access + refresh). */
export function setSessionCookies(
  res: Response,
  session: IssuedSession,
  env: ApiEnv,
): void {
  const base = baseCookie(env);
  res.cookie("access_token", session.accessToken, {
    ...base,
    maxAge: accessTtlSeconds(env) * 1000,
  });
  res.cookie("refresh_token", session.refreshToken, {
    ...base,
    maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** Limpia las cookies de sesión (logout). */
export function clearSessionCookies(res: Response): void {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
}
