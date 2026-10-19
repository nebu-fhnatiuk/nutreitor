import "server-only";

import { z } from "zod";

/**
 * Env del lado servidor de web (route handlers / server components). Validación
 * LAZY + memoizada: se valida en el primer uso (runtime), no al importar, para no
 * acoplar `next build` a secretos de runtime. Fail-fast igual: el primer request
 * que la use rompe si falta algo. NO son NEXT_PUBLIC: nunca llegan al browser.
 */
const schema = z.object({
  API_INTERNAL_URL: z.string().url().default("http://api:3001"),
  ROOT_DOMAIN: z.string().default("localhost"),
  // Secreto compartido edge↔API; el proxy/SSR lo manda en cada llamada a la API.
  EDGE_SHARED_SECRET: z.string().min(16),
  // Cuántos proxies de confianza AGREGAN a X-Forwarded-For delante de Next (ALB = 1,
  // CloudFront + ALB = 2). La IP real del cliente es la entrada N desde la derecha;
  // lo de más a la izquierda lo puede inventar el cliente. Ver ADR 0017.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).default(1),
  // Landing de producto (apps/site, ADR 0028). En prod CloudFront sirve "/" desde S3
  // y la web nunca la recibe: se deja vacío. En dev, la raíz de la web redirige acá.
  SITE_URL: z.string().url().optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables de entorno (web server) inválidas:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
