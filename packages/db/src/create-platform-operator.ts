import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import pg from "pg";

/**
 * Da de alta a un operador de plataforma en un entorno real, donde el seed no corre.
 * Si el email ya tiene cuenta, sólo le da el permiso y no toca su contraseña.
 *
 * No recibe ninguna contraseña: una cuenta nueva queda con una al azar, que nadie
 * conoce, y el operador elige la suya con "¿Olvidaste tu contraseña?" (ADR 0029). Así
 * no queda en el historial de la terminal, en los logs ni en la definición de la tarea.
 *
 * Corre con el rol owner (DATABASE_OWNER_URL), en la tarea de migraciones.
 */
export type OperatorResult = "created" | "promoted" | "unchanged";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createPlatformOperator(
  ownerUrl: string,
  operator: { email: string; fullName: string },
): Promise<OperatorResult> {
  const email = operator.email.trim().toLowerCase();
  const fullName = operator.fullName.trim();
  if (!EMAIL.test(email)) throw new Error("El email del operador no es válido.");
  if (!fullName) throw new Error("Falta el nombre del operador.");

  const hashedPassword = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ created: boolean }>(
      `INSERT INTO users (email, hashed_password, full_name, is_platform_admin)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE SET is_platform_admin = true
         WHERE users.is_platform_admin = false
       RETURNING (xmax = 0) AS created`,
      [email, hashedPassword, fullName],
    );
    const row = rows[0];
    if (!row) return "unchanged";
    return row.created ? "created" : "promoted";
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const owner = process.env.DATABASE_OWNER_URL;
  const email = process.env.OPERATOR_EMAIL;
  const fullName = process.env.OPERATOR_NAME;
  if (!owner) throw new Error("DATABASE_OWNER_URL no está seteada.");
  if (!email || !fullName) throw new Error("Faltan OPERATOR_EMAIL y OPERATOR_NAME.");
  createPlatformOperator(owner, { email, fullName })
    .then((result) => console.log(`Operador de plataforma: ${result}.`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
