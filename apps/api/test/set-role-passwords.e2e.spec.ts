import { createDb } from "@nutreitor/db";
import { setRolePasswords } from "@nutreitor/db/set-role-passwords";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * La tarea de migraciones fija la contraseña de los roles desde sus URLs (ADR 0047).
 * Se prueba con un rol descartable para no tocar los del resto de la suite.
 */
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const ROLE = "nutreitor_pwd_probe";

async function asOwner(sql: string) {
  const { pool } = createDb(OWNER_URL);
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

function urlFor(password: string): string {
  const u = new URL(OWNER_URL);
  u.username = ROLE;
  u.password = encodeURIComponent(password);
  return u.toString();
}

async function canLogin(password: string): Promise<boolean> {
  const { pool } = createDb(urlFor(password));
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

beforeAll(() => asOwner(`DROP ROLE IF EXISTS ${ROLE}; CREATE ROLE ${ROLE} LOGIN PASSWORD 'vieja'`));
afterAll(() => asOwner(`DROP ROLE IF EXISTS ${ROLE}`));

describe("setRolePasswords", () => {
  it("cambia la contraseña del rol por la de su URL, también con caracteres raros", async () => {
    const nueva = "n'ueva:con@raros%";
    expect(await setRolePasswords(OWNER_URL, [urlFor(nueva)])).toEqual([ROLE]);
    expect(await canLogin(nueva)).toBe(true);
    expect(await canLogin("vieja")).toBe(false);
  });

  it("rechaza una URL sin contraseña", async () => {
    const u = new URL(OWNER_URL);
    u.username = ROLE;
    u.password = "";
    await expect(setRolePasswords(OWNER_URL, [u.toString()])).rejects.toThrow(/usuario y contraseña/);
  });
});
