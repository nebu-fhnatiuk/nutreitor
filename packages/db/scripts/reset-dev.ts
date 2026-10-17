/**
 * Recrea la base de DESARROLLO desde cero: DROP + CREATE + migraciones + seed.
 * Borra todo lo cargado a mano. Pensado para volver al estado demo limpio.
 *
 *   docker compose exec api pnpm --filter @nutreitor/db db:reset-dev
 *
 * Se niega a correr con NODE_ENV=production o contra una base que no sea la de
 * DATABASE_OWNER_URL del entorno de desarrollo.
 */
import pg from "pg";

import { runMigrations } from "../src/migrate.js";
import { runSeed } from "../src/seed.js";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("reset-dev no corre en producción.");
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) throw new Error("Falta DATABASE_OWNER_URL.");
  const target = new URL(ownerUrl);
  const db = target.pathname.replace(/^\//, "");
  if (!db || db === "postgres") throw new Error(`Base inválida: "${db}".`);

  // DROP/CREATE desde la base de mantenimiento `postgres` (no se puede borrar la
  // base a la que uno está conectado). WITH (FORCE) corta las conexiones abiertas
  // de la API/web, que se reconectan solas.
  const admin = new URL(ownerUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const ident = `"${db.replace(/"/g, '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${ident} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${ident}`);
  } finally {
    await client.end();
  }
  await runMigrations(ownerUrl);
  await runSeed(ownerUrl);
  console.log(`✓ ${db} recreada: migraciones + seed demo.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
