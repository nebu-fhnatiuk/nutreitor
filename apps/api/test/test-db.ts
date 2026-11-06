/**
 * Base de datos de los tests, SEPARADA de la de desarrollo. Los e2e escriben de
 * verdad (planes, citas, charlas, alimentos propios): contra la base de dev
 * ensuciaban lo que se ve al probar a mano y las capturas de UX.
 *
 * Se deriva de las URLs de siempre cambiando el nombre de la base por
 * `<base>_test` (o `TEST_DATABASE_NAME`). Mismo servidor, mismos roles (son del
 * cluster), mismas migraciones.
 */
export function testDbName(url: string): string {
  const fromEnv = process.env.TEST_DATABASE_NAME;
  if (fromEnv) return fromEnv;
  const name = new URL(url).pathname.replace(/^\//, "");
  return name.endsWith("_test") ? name : `${name}_test`;
}

export function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/**
 * Conexión del plano de control (rol nutreitor_control, ADR 0049) para los tests de
 * AdminDbService. Se cierra con `pool.end()` en el afterAll del spec.
 */
export function controlUrl(): string {
  const url = process.env.DATABASE_CONTROL_URL;
  if (!url) throw new Error("Falta DATABASE_CONTROL_URL para los tests del plano de control.");
  return url;
}
