import "server-only";

import { cookies } from "next/headers";
import type { MeResponse } from "@nutreitor/shared";

/**
 * Acceso server-side a la API (server components / layouts). Para datos públicos
 * (branding) no hace falta cookie; para `me` se reenvía la cookie de sesión.
 * El login/logout NO pasan por acá: van por el proxy /api para que el browser
 * reciba las cookies first-party.
 */
const API = process.env.API_INTERNAL_URL ?? "http://api:3001";

export interface TenantBranding {
  name: string;
  slug: string;
  region: string;
}

/** Branding público de la org por slug (sin auth). null si no existe. */
export async function fetchTenant(slug: string): Promise<TenantBranding | null> {
  const r = await fetch(`${API}/auth/tenant/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

/** Sesión actual reenviando la cookie. null si no autenticado. */
export async function fetchMe(slug: string): Promise<MeResponse | null> {
  const cookieHeader = (await cookies()).toString();
  const r = await fetch(`${API}/auth/me`, {
    headers: { cookie: cookieHeader, "x-tenant-slug": slug },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}
