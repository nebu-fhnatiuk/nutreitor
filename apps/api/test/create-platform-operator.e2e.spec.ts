import { createDb, users, type Database } from "@nutreitor/db";
import { createPlatformOperator } from "@nutreitor/db/create-platform-operator";
import { eq, inArray } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Alta del primer operador de plataforma en un entorno real, donde el seed no corre.
 * Contra Postgres real: crea, promueve sin tocar la contraseña y se puede repetir.
 */
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const RUN = Math.random().toString(36).slice(2, 8);
const NEW_EMAIL = `operador-${RUN}@nutreitor.test`;
const EXISTING_EMAIL = `existente-${RUN}@nutreitor.test`;

let db: Database;
let pool: pg.Pool;

async function findUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

beforeAll(() => {
  ({ db, pool } = createDb(OWNER_URL));
});

afterAll(async () => {
  await db.delete(users).where(inArray(users.email, [NEW_EMAIL, EXISTING_EMAIL]));
  await pool.end();
});

describe("createPlatformOperator", () => {
  it("crea la cuenta como operador, con el email normalizado y una contraseña al azar", async () => {
    const result = await createPlatformOperator(OWNER_URL, {
      email: `  ${NEW_EMAIL.toUpperCase()} `,
      fullName: " Operadora ",
    });

    expect(result).toBe("created");
    const user = await findUser(NEW_EMAIL);
    expect(user?.isPlatformAdmin).toBe(true);
    expect(user?.fullName).toBe("Operadora");
    expect(user?.hashedPassword).toMatch(/^\$2[aby]\$/);
  });

  it("repetirlo no cambia nada", async () => {
    const before = await findUser(NEW_EMAIL);

    const result = await createPlatformOperator(OWNER_URL, {
      email: NEW_EMAIL,
      fullName: "Otro nombre",
    });

    expect(result).toBe("unchanged");
    const after = await findUser(NEW_EMAIL);
    expect(after?.hashedPassword).toBe(before?.hashedPassword);
    expect(after?.fullName).toBe("Operadora");
  });

  it("a una cuenta existente sólo le da el permiso: conserva contraseña y nombre", async () => {
    await db.insert(users).values({
      email: EXISTING_EMAIL,
      hashedPassword: "hash-propio",
      fullName: "Ya Tenía Cuenta",
    });

    const result = await createPlatformOperator(OWNER_URL, {
      email: EXISTING_EMAIL,
      fullName: "Otro nombre",
    });

    expect(result).toBe("promoted");
    const user = await findUser(EXISTING_EMAIL);
    expect(user?.isPlatformAdmin).toBe(true);
    expect(user?.hashedPassword).toBe("hash-propio");
    expect(user?.fullName).toBe("Ya Tenía Cuenta");
  });

  it("rechaza un email inválido o un nombre vacío", async () => {
    await expect(
      createPlatformOperator(OWNER_URL, { email: "no-es-un-mail", fullName: "Alguien" }),
    ).rejects.toThrow("email");
    await expect(
      createPlatformOperator(OWNER_URL, { email: NEW_EMAIL, fullName: "  " }),
    ).rejects.toThrow("nombre");
  });
});
