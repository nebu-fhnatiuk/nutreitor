import "server-only";

import { cookies } from "next/headers";
import type {
  BrandingDto,
  MeResponse,
  OwnProfessionalProfile,
  RosterAdminEntry,
} from "@nutreitor/shared";

import { serverEnv } from "./env";

/**
 * Acceso server-side a la API (server components / layouts). Para datos públicos
 * (branding) no hace falta cookie; para `me` se reenvía la cookie de sesión.
 * Toda llamada incluye el secreto de borde (x-internal-secret). El login/logout
 * NO pasan por acá: van por el proxy /api para que el browser reciba las cookies
 * first-party.
 */

/** Branding público de la org por slug (sin auth). null si no existe. */
export async function fetchTenant(slug: string): Promise<BrandingDto | null> {
  const env = serverEnv();
  const r = await fetch(
    `${env.API_INTERNAL_URL}/auth/tenant/${encodeURIComponent(slug)}`,
    { headers: { "x-internal-secret": env.EDGE_SHARED_SECRET }, cache: "no-store" },
  );
  if (!r.ok) return null;
  return r.json();
}

/** Sesión actual reenviando la cookie. null si no autenticado. */
export async function fetchMe(slug: string): Promise<MeResponse | null> {
  return authGet<MeResponse>(slug, "/auth/me");
}

/** GET autenticado a la API (reenvía cookie + secreto de borde + slug). */
async function authGet<T>(slug: string, path: string): Promise<T | null> {
  const env = serverEnv();
  const cookieHeader = (await cookies()).toString();
  const r = await fetch(`${env.API_INTERNAL_URL}${path}`, {
    headers: {
      "x-internal-secret": env.EDGE_SHARED_SECRET,
      cookie: cookieHeader,
      "x-tenant-slug": slug,
    },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json() as Promise<T>;
}

/** Roster completo para curaduría del admin (incluye no-listados). */
export function fetchRoster(slug: string): Promise<RosterAdminEntry[] | null> {
  return authGet<RosterAdminEntry[]>(slug, "/members/roster");
}

/** Perfil público propio del profesional (campos privados + visibilidad). */
export function fetchOwnProfile(
  slug: string,
): Promise<OwnProfessionalProfile | null> {
  return authGet<OwnProfessionalProfile>(slug, "/professional/me/profile");
}
