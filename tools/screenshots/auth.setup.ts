import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type FullConfig } from "@playwright/test";

/**
 * Inicia sesión UNA vez por rol y guarda la sesión (cookies) para todas las
 * capturas de la corrida. Antes cada viewport iniciaba sesión por su cuenta y unas
 * pocas corridas seguidas chocaban con el rate-limit del login (10 por email cada
 * 15 min, ADR 0017).
 */
export const ROLE_EMAILS = {
  pro: "pro@demo.test",
  admin: "admin@demo.test",
  paciente: "patient@demo.test",
} as const;

export const authFile = (role: string) => join(__dirname, "out", ".auth", `${role}.json`);

export default async function globalSetup(config: FullConfig) {
  const use = config.projects[0]!.use;
  const browser = await chromium.launch(use.launchOptions);
  mkdirSync(join(__dirname, "out", ".auth"), { recursive: true });
  try {
    for (const [role, email] of Object.entries(ROLE_EMAILS)) {
      const page = await browser.newPage({ baseURL: use.baseURL });
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Contraseña", { exact: true }).fill(process.env.DEMO_PASSWORD ?? "demo1234");
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
      await page.context().storageState({ path: authFile(role) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
