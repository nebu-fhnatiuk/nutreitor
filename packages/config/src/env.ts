import { z } from "zod";

/**
 * Esquemas de validación de entorno compartidos.
 *
 * Cada app compone el subconjunto que necesita y llama a `parseEnv`. Falla
 * temprano y ruidoso si falta una variable o tiene formato inválido — preferimos
 * un crash al boot antes que un comportamiento silenciosamente roto en runtime.
 */

export const nodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

/** Variables del backend (apps/api) y de tooling de DB (packages/db). */
export const databaseEnvSchema = z.object({
  // Conexión de runtime de la API: rol `nutreitor_app`, sujeto a RLS.
  DATABASE_URL: z.string().url(),
  // Conexión de migraciones/seed: rol `nutreitor_owner`, bypassa RLS.
  // Opcional porque el runtime de la API no la necesita.
  DATABASE_OWNER_URL: z.string().url().optional(),
});

export const authEnvSchema = z.object({
  // Secretos de firma. Access = JWT corto; refresh = token opaco (hash en DB).
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  ACCESS_TTL: z.string().default("900s"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Cookies: Secure=false en dev (http), true detrás de TLS.
  // OJO: z.coerce.boolean() haría Boolean("false") = true. Parseo explícito.
  COOKIE_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(false)
    .transform((v) => v === true || v === "true"),
  // Dominio raíz para distinguir host de marketing vs subdominio de tenant.
  ROOT_DOMAIN: z.string().default("localhost"),
  // Secreto compartido edge↔API: el edge (proxy de Next) lo manda en cada request;
  // la API rechaza lo que no lo traiga (defensa en profundidad si quedara expuesta).
  EDGE_SHARED_SECRET: z.string().min(16),
});

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    API_PORT: z.coerce.number().int().positive().default(3001),
    // Origen web del tenant para armar el link de invitación; `{slug}` se
    // reemplaza por el slug de la org. En prod: https://{slug}.nutreitor.com
    WEB_ORIGIN_TEMPLATE: z.string().default("http://{slug}.localhost:3000"),
    INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
    // Servicio de agentes (Python). El gateway Nest le reenvía con un contexto de
    // tenant FIRMADO (HMAC). Defaults de dev para que la API booteé aunque el
    // servicio no esté arriba; en prod se inyectan por Secrets Manager.
    AGENTS_SERVICE_URL: z.string().url().default("http://agents:8000"),
    AGENTS_SHARED_SECRET: z.string().min(16).default("dev-agents-shared-secret-change-me"),
    // Rotación sin downtime (dual-secret): lista separada por comas, el PRIMERO es el
    // primary (con el que se firma) y el resto son secondary (sólo se aceptan al
    // verificar). Si está vacío, se usa `AGENTS_SHARED_SECRET` (compat). El servicio
    // Python lee la MISMA lista (`AGENTS_SHARED_SECRETS`). Ver ADR 0013.
    AGENTS_SHARED_SECRETS: z.string().optional(),
    AGENTS_CONTEXT_TTL_MS: z.coerce.number().int().positive().default(60_000),
    // Control de costo/abuso por tenant (se evalúa en el gateway antes de egresar).
    // 0 = sin límite. El tope mensual se mide sobre el audit `agent_runs`.
    AGENTS_RATELIMIT_PER_MIN: z.coerce.number().int().nonnegative().default(30),
    AGENTS_MONTHLY_TOKEN_CAP: z.coerce.number().int().nonnegative().default(0),
    // Rate-limiting de endpoints públicos y login (contadores en Redis, ADR 0017).
    // Opcional en dev/test (sin Redis el limitador queda apagado); obligatorio en prod.
    REDIS_URL: z.string().url().optional(),
  })
  .merge(databaseEnvSchema)
  .merge(authEnvSchema)
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message: "REDIS_URL es obligatorio en producción (rate-limiting).",
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Valida `source` (por defecto `process.env`) contra `schema`. Tira un error
 * legible enumerando las variables inválidas si la validación falla.
 */
export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, unknown> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}
