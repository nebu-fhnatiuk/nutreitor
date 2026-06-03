/**
 * Fetch al proxy interno (/api/*) con cookie de sesión. Único lugar del contrato:
 * credentials include, parseo de JSON y mapeo de !ok → Error con el message del
 * backend. Lo usan los componentes cliente (no usar en server components: ahí va
 * lib/server/api.ts).
 */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`/api/${path}`, { credentials: "include", ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error((data as { message?: string })?.message ?? `HTTP ${r.status}`);
  }
  return data as T;
}
