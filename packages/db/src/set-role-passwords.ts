import pg from "pg";

/**
 * Fija la contraseña de los roles de runtime (app, control, worker, agents) desde sus URLs.
 *
 * Las migraciones crean los roles con la contraseña de desarrollo si no existen; en
 * un entorno real la tarea de migraciones corre esto después de migrar, con las URLs
 * que inyecta Secrets Manager (ADR 0047). Así la única fuente de la contraseña es el
 * secreto, y rotarla es actualizar el secreto y volver a correr la tarea.
 *
 * Corre con el rol owner (DATABASE_OWNER_URL).
 */
const ROLE_URLS = ["DATABASE_URL", "DATABASE_CONTROL_URL", "DATABASE_WORKER_URL", "DATABASE_AGENTS_URL"] as const;

export async function setRolePasswords(ownerUrl: string, urls: string[]): Promise<string[]> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const done: string[] = [];
  try {
    for (const url of urls) {
      const { username, password } = new URL(url);
      const role = decodeURIComponent(username);
      if (!role || !password) throw new Error("Cada URL tiene que traer usuario y contraseña.");
      // ALTER ROLE no acepta parámetros: se escapan identificador y literal.
      await client.query(
        `ALTER ROLE ${client.escapeIdentifier(role)} WITH PASSWORD ${client.escapeLiteral(decodeURIComponent(password))}`,
      );
      done.push(role);
    }
  } finally {
    await client.end();
  }
  return done;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const owner = process.env.DATABASE_OWNER_URL;
  if (!owner) throw new Error("DATABASE_OWNER_URL no está seteada.");
  const urls = ROLE_URLS.map((k) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} no está seteada.`);
    return v;
  });
  setRolePasswords(owner, urls)
    .then((roles) => console.log(`Contraseñas fijadas: ${roles.join(", ")}.`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
