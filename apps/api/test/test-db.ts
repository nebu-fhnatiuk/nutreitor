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
