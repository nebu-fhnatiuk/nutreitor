/** Error de la API con el status HTTP (0 = no hubo respuesta: red caída). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch al proxy interno (/api/*) con cookie de sesión. Único lugar del contrato:
 * credentials include, parseo de JSON y mapeo de !ok → ApiError con el message del
 * backend. Lo usan los componentes cliente (no usar en server components: ahí va
 * lib/server/api.ts).
 */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/${path}`, { credentials: "include", ...init });
  } catch {
    throw new ApiError("", 0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const message = (data as { message?: unknown })?.message;
    throw new ApiError(typeof message === "string" ? message : "", r.status);
  }
  return data as T;
}

/**
 * Mensaje para mostrarle a la persona. Antes se hacía `String(e)` y la UI decía
 * "Error: HTTP 500" o "Error: Payload inválido". Los mensajes del backend que ya
 * están escritos para humanos (en castellano, p. ej. "Ese horario ya fue
 * reservado") se respetan; lo técnico se traduce por status.
 */
export function errorMessage(e: unknown, fallback = "Algo salió mal. Probá de nuevo."): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";
    if (e.status === 401) return "Tu sesión venció. Volvé a iniciar sesión.";
    // El 403 genérico de Nest ("Forbidden resource") se traduce; uno escrito para
    // humanos (p. ej. "Vas a poder invitar pacientes cuando…") se respeta.
    if (e.status === 403)
      return e.message && !/^Forbidden/i.test(e.message) ? e.message : "No tenés permiso para hacer esto.";
    if (e.status === 404) return e.message && !/^(Not Found|Cannot )/i.test(e.message) ? e.message : "No encontramos lo que buscabas.";
    if (e.status === 429) return e.message || "Demasiados intentos. Esperá un momento.";
    if (e.status >= 500) return "Algo falló de nuestro lado. Probá de nuevo en un momento.";
    if (e.message === "Payload inválido") return "Revisá los datos ingresados.";
    return e.message || fallback;
  }
  // Errores armados a mano por los fetch directos ("HTTP 500"): mismo criterio.
  const http = e instanceof Error ? /^HTTP (\d{3})$/.exec(e.message) : null;
  if (http) return errorMessage(new ApiError("", Number(http[1])), fallback);
  if (e instanceof Error && e.message === "Payload inválido") return "Revisá los datos ingresados.";
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
