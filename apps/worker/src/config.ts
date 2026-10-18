import { z } from "zod";

/** Configuración del worker (env). Falla al arrancar si falta algo obligatorio. */
const schema = z.object({
  /** Rol `nutreitor_worker` (sin BYPASSRLS). */
  DATABASE_WORKER_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** URL del portal de un consultorio; `{slug}` se reemplaza. */
  WEB_URL_TEMPLATE: z.string().default("https://{slug}.nutreitor.com"),
  MAIL_PROVIDER: z.enum(["console", "ses"]).default("console"),
  /** Remitente verificado en SES (el nombre visible es el del consultorio). */
  MAIL_FROM: z.string().email().default("avisos@nutreitor.com"),
  AWS_REGION: z.string().default("us-east-1"),
  /** Cada cuánto se buscan avisos pendientes de generar. */
  SCAN_EVERY_MS: z.coerce.number().int().min(10_000).default(5 * 60_000),
});
export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return schema.parse(env);
}

export const webUrl = (template: string, slug: string, path = "") => `${template.replace("{slug}", slug)}${path}`;
