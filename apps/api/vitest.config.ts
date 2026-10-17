import { defineConfig } from "vitest/config";

import { testDbName, withDb } from "./test/test-db.js";

// Los tests corren contra `<base>_test`, nunca contra la base de desarrollo
// (ver test/test-db.ts). La base se crea en globalSetup si no existe.
const owner = process.env.DATABASE_OWNER_URL;
const app = process.env.DATABASE_URL;
const env: Record<string, string> = {};
if (owner && app) {
  const db = testDbName(owner);
  env.DATABASE_OWNER_URL = withDb(owner, db);
  env.DATABASE_URL = withDb(app, db);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./test/global-setup.ts"],
    env,
    // Tests de integración contra una DB real: sin paralelismo entre archivos
    // para evitar contención sobre el mismo Postgres.
    fileParallelism: false,
  },
});
