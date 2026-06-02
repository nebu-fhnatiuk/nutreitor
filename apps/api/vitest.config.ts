import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.e2e.spec.ts", "src/**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Tests de integración contra una DB real: sin paralelismo entre archivos
    // para evitar contención sobre el mismo Postgres de dev.
    fileParallelism: false,
  },
});
