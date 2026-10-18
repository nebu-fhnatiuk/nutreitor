import { defineConfig, devices } from "@playwright/test";

/**
 * Capturas de la web por rol, para revisar UX/UI antes y después de cada cambio.
 * Corre dentro de la red del compose: los subdominios de tenant (`demo.localhost`)
 * se resuelven al contenedor `web`, así el middleware de Next ve el Host real.
 *
 *   docker compose --profile tools run --rm screenshots
 *
 * Salida: tools/screenshots/out/<LABEL>/<viewport>/<rol>-<pantalla>.png
 */
export default defineConfig({
  testDir: ".",
  testMatch: "shots.spec.ts",
  globalSetup: "./auth.setup.ts",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://demo.localhost:3000",
    launchOptions: {
      args: [`--host-resolver-rules=MAP *.localhost ${process.env.WEB_HOST ?? "web"}, MAP localhost ${process.env.WEB_HOST ?? "web"}`],
    },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
