import { defineConfig } from "drizzle-kit";

/**
 * Config de drizzle-kit. Se usa SÓLO para AUTORAR migraciones:
 * `pnpm db:generate` produce el DDL a partir del diff del schema.
 *
 * El DDL generado se revisa y se consolida en archivos numerados dentro de
 * ./migrations, que aplica nuestro runner (src/migrate.ts). Esto es deliberado:
 * las policies RLS, roles y GRANTs NO se expresan en el schema de Drizzle, así
 * que viven como SQL versionado a mano junto al DDL de tablas. Una sola fuente
 * de verdad ordenada, aplicada transaccionalmente.
 *
 * Usa la conexión OWNER: generar/aplicar DDL requiere el rol dueño del schema.
 */
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
