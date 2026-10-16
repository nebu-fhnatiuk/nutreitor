import "server-only";

/**
 * IP del cliente a partir de X-Forwarded-For. Cada proxy AGREGA a la derecha, así
 * que lo confiable se lee desde la derecha: la entrada `hops` (cantidad de proxies
 * de confianza delante de Next) es la que vio el primero de ellos. Lo de más a la
 * izquierda lo controla el cliente y no se usa. Sin proxy delante (dev), Next pone
 * la IP del socket en el header, así que `hops = 1` también aplica.
 */
export function clientIp(xff: string | null, hops: number): string | null {
  if (!xff) return null;
  const parts = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - hops] ?? parts[0] ?? null;
}
