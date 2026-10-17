import { createDb } from "@nutreitor/db";

import { testDbName } from "./test-db.js";

/**
 * Crea la base de tests si no existe (una vez por corrida). Corre con el owner
 * conectado a la base de siempre: CREATE DATABASE no puede ir dentro de la base
 * que se crea. Las migraciones y el seed los aplica cada spec en su beforeAll.
 */
export default async function setup(): Promise<void> {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) return; // tests unitarios sueltos, sin base
  const db = testDbName(ownerUrl);
  const { pool } = createDb(ownerUrl);
  try {
    const { rowCount } = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) await pool.query(`CREATE DATABASE "${db.replace(/"/g, '""')}"`);
  } finally {
    await pool.end();
  }
}
