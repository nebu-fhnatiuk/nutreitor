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
  // Plano de control (ADR 0048): si no viene, mismo servidor con el rol control.
  const control = process.env.DATABASE_CONTROL_URL ?? controlFrom(app);
  env.DATABASE_CONTROL_URL = withDb(control, db);
}

function controlFrom(url: string): string {
  const u = new URL(url);
  u.username = "nutreitor_control";
  u.password = "control_dev_pwd";
  return u.toString();
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
