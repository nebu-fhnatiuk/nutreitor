import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { schema } from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

/**
 * Crea un pool de Postgres + instancia Drizzle tipada con el schema completo.
 *
 * La API debe usar la URL del rol `nutreitor_app` (sujeto a RLS). Las migraciones
 * y el seed usan la URL del rol `nutreitor_owner` (bypassa RLS por ser owner).
 * Mantener ambos pools separados es lo que hace que el aislamiento sea real y no
 * dependa de disciplina del desarrollador.
 */
export function createDb(connectionString: string): {
  db: Database;
  pool: pg.Pool;
} {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
export type { NodePgDatabase };
