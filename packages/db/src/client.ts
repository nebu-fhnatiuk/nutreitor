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
  // Una conexión INACTIVA del pool que se corta del lado del servidor (reinicio o
  // failover de RDS, timeout de red, DROP DATABASE ... WITH (FORCE)) emite 'error'
  // en el pool. Sin este handler es un 'error' no manejado y Node tira el proceso:
  // la API entera se caía en vez de reconectar. pg ya descarta el cliente roto; la
  // próxima query abre uno nuevo. Las queries en curso siguen fallando y se manejan
  // donde se hacen.
  pool.on("error", (err) => {
    console.warn(`[db] conexión del pool cortada por el servidor: ${err.message}`);
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
export type { NodePgDatabase };
