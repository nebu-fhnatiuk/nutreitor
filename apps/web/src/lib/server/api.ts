import "server-only";

import { cookies } from "next/headers";
import type { BrandingDto, MeResponse } from "@nutreitor/shared";

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
  const env = serverEnv();
  const cookieHeader = (await cookies()).toString();
  const r = await fetch(`${env.API_INTERNAL_URL}/auth/me`, {
    headers: {
      "x-internal-secret": env.EDGE_SHARED_SECRET,
      cookie: cookieHeader,
      "x-tenant-slug": slug,
    },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}
