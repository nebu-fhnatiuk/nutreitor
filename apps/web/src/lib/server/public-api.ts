import "server-only";

import type { PublicOrg, PublicProfessional } from "@nutreitor/shared";

import { serverEnv } from "./env";

/**
 * Fetch del contenido PÚBLICO, cacheado para ISR: `force-cache` + tags + TTL de
 * red de seguridad. La revalidación on-demand (PR 2) invalida estos tags al editar.
 * Distinto de los fetch de auth (no-store). Igual lleva el secreto de borde.
 */
export const orgTag = (slug: string) => `org:${slug}`;
export const proTag = (slug: string, proSlug: string) => `pro:${slug}:${proSlug}`;

const REVALIDATE_SECONDS = 3600;

async function publicFetch<T>(path: string, tags: string[]): Promise<T | null> {
  const env = serverEnv();
  const r = await fetch(`${env.API_INTERNAL_URL}${path}`, {
    headers: { "x-internal-secret": env.EDGE_SHARED_SECRET },
    cache: "force-cache",
    next: { tags, revalidate: REVALIDATE_SECONDS },
  });
  if (!r.ok) return null;
  return r.json() as Promise<T>;
}

export function fetchPublicOrg(slug: string): Promise<PublicOrg | null> {
  return publicFetch<PublicOrg>(
    `/public/orgs/${encodeURIComponent(slug)}`,
    [orgTag(slug)],
  );
}

export function fetchPublicProfessional(
  slug: string,
  profileSlug: string,
): Promise<PublicProfessional | null> {
  return publicFetch<PublicProfessional>(
    `/public/orgs/${encodeURIComponent(slug)}/professionals/${encodeURIComponent(profileSlug)}`,
    [orgTag(slug), proTag(slug, profileSlug)],
  );
}
