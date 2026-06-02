import { AsyncLocalStorage } from "node:async_hooks";

import type { AuthOrg, MembershipRole, TenantContext } from "@nutreitor/shared";

/**
 * Almacén del contexto por request, basado en AsyncLocalStorage.
 *
 * Por qué ALS y no un provider request-scoped de Nest: el scope REQUEST obliga a
 * Nest a re-instanciar todo el subárbol de providers que lo consume en cada
 * request, y es "viral". ALS da el mismo aislamiento por request manteniendo los
 * providers como singletons → mejor throughput, sobre todo bajo Fargate.
 *
 * El store guarda un holder MUTABLE: el middleware abre el scope para todo
 * request; el guard de auth completa `context`/`org`/`user` cuando autentica. Las
 * rutas públicas simplemente nunca lo completan.
 */
export interface AuthPrincipal {
  id: string;
  role: MembershipRole;
}

export interface TenantStore {
  /** Contexto de tenant para RLS (tenantId/orgId/region). */
  context?: TenantContext;
  /** Org completa de la sesión (para /me y branding). */
  org?: AuthOrg;
  /** Usuario autenticado (id + rol en la org). */
  user?: AuthPrincipal;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Devuelve el contexto actual o `undefined` si la ruta no está autenticada. */
export function getTenantContextOrNull(): TenantContext | undefined {
  return tenantStorage.getStore()?.context;
}

/** Devuelve el contexto actual o tira si no hay (toda operación tenant-scoped). */
export function getTenantContext(): TenantContext {
  const ctx = getTenantContextOrNull();
  if (!ctx) {
    throw new Error(
      "No hay TenantContext en el scope actual. ¿Falta el TenantContextMiddleware " +
        "o un guard de auth en esta ruta?",
    );
  }
  return ctx;
}

/** Devuelve el principal autenticado (usuario + org) o tira si no hay. */
export function getAuth(): { user: AuthPrincipal; org: AuthOrg } {
  const store = tenantStorage.getStore();
  if (!store?.user || !store.org) {
    throw new Error("No hay sesión autenticada en el scope actual.");
  }
  return { user: store.user, org: store.org };
}
