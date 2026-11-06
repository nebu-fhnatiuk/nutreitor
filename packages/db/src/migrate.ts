import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

/**
 * Runner de migraciones minimalista.
 *
 * Aplica en orden lexicográfico los `*.sql` de packages/db/migrations, cada uno
 * en su propia transacción, y registra los aplicados en `schema_migrations`.
 * Corre con el rol OWNER (DATABASE_OWNER_URL): crear tablas/roles y administrar
 * RLS requiere el dueño del schema, no el rol de runtime.
 *
 * Por qué propio y no drizzle-migrate: necesitamos ejecutar SQL crudo de roles,
 * GRANTs y policies RLS (que el schema de Drizzle no expresa) como ciudadanos de
 * primera clase junto al DDL de tablas, con una sola secuencia ordenada.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Aplica las migraciones pendientes. Reutilizable desde tests/bootstrap.
 * Requiere la conexión OWNER.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text        PRIMARY KEY,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    for (const filename of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      const checksum = sha256(sql);
      const prev = applied.get(filename);

      if (prev) {
        if (prev !== checksum) {
          throw new Error(
            `La migración ya aplicada '${filename}' cambió de contenido ` +
              `(checksum distinto). Las migraciones aplicadas son inmutables: ` +
              `creá una migración nueva.`,
          );
        }
        console.log(`= ${filename} (ya aplicada)`);
        continue;
      }

      console.log(`→ aplicando ${filename} ...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [filename, checksum],
        );
        await client.query("COMMIT");
        console.log(`✓ ${filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    // Toda tabla con RLS, también las que agregue una migración nueva, le deja al
    // owner su policy explícita: en RDS no es superusuario (0053, ADR 0049).
    const { rows: fn } = await client.query<{ ok: boolean }>(
      "SELECT to_regprocedure('ensure_owner_policies()') IS NOT NULL AS ok",
    );
    if (fn[0]?.ok) await client.query("SELECT ensure_owner_policies()");

    console.log("Migraciones al día.");
  } finally {
    await client.end();
  }
}

// Ejecución directa: `pnpm db:migrate`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env.DATABASE_OWNER_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_OWNER_URL no está seteada. Las migraciones requieren el rol owner.",
    );
  }
  runMigrations(connectionString).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
