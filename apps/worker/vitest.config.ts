import { defineConfig } from "vitest/config";

// Mismo criterio que la API: los tests corren contra `<base>_test`, nunca contra la
// base de desarrollo. El rol del worker se deriva de DATABASE_URL si no viene.
const withDb = (url: string, db: string, user?: [string, string]) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) [u.username, u.password] = user;
  return u.toString();
};
const owner = process.env.DATABASE_OWNER_URL;
const app = process.env.DATABASE_URL;
const env: Record<string, string> = {};
if (owner && app) {
  const name = new URL(owner).pathname.slice(1);
  const db = process.env.TEST_DATABASE_NAME ?? (name.endsWith("_test") ? name : `${name}_test`);
  env.DATABASE_OWNER_URL = withDb(owner, db);
  env.DATABASE_WORKER_URL = process.env.DATABASE_WORKER_URL
    ? withDb(process.env.DATABASE_WORKER_URL, db)
    : withDb(app, db, ["nutreitor_worker", "worker_dev_pwd"]);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env,
    fileParallelism: false,
  },
});
