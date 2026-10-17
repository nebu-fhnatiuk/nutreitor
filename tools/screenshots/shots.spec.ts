import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Recorre las pantallas de cada rol del tenant demo y guarda una captura de página
 * completa por viewport. No es un test de regresión (no compara): es material para
 * revisar UX/UI. LABEL separa corridas ("antes", "despues", una fecha…).
 */
const LABEL = process.env.LABEL ?? "actual";
const PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";
const PATIENT_ID = "00000000-0000-0000-0000-0000000000d1";

const ROLES = {
  pro: {
    email: "pro@demo.test",
    pages: [
      ["inicio", "/pro"],
      ["ficha", `/pro/patients/${PATIENT_ID}`],
      ["agenda", "/pro/agenda"],
      ["perfil", "/pro/profile"],
    ],
  },
  admin: {
    email: "admin@demo.test",
    pages: [
      ["inicio", "/admin"],
      ["pacientes", "/admin/patients"],
      ["ficha", `/admin/patients/${PATIENT_ID}`],
      ["miembros", "/admin/members"],
      ["publica", "/admin/public"],
      ["config", "/admin/settings"],
    ],
  },
  paciente: {
    email: "patient@demo.test",
    pages: [["portal", "/app"]],
  },
} as const;

const PUBLIC_PAGES = [
  ["landing", "http://localhost:3000/"],
  ["vidriera-org", "/"],
  ["vidriera-pro", "/profesional-demo"],
  ["login", "/login"],
] as const;

async function shot(page: Page, project: string, name: string) {
  const dir = join(__dirname, "out", LABEL, project);
  mkdirSync(dir, { recursive: true });
  // Esperar a que terminen los fetch del cliente (spinners "Cargando…").
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Cargando…")).toHaveCount(0, { timeout: 15_000 }).catch(() => {});
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  // Por tipo de campo: los <label> del login no están asociados (pendiente de a11y).
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("páginas públicas", async ({ page }, info) => {
  for (const [name, path] of PUBLIC_PAGES) {
    await page.goto(path);
    await shot(page, info.project.name, `publico-${name}`);
  }
});

for (const [role, cfg] of Object.entries(ROLES)) {
  test(`rol ${role}`, async ({ page }, info) => {
    await login(page, cfg.email);
    for (const [name, path] of cfg.pages) {
      await page.goto(path);
      await shot(page, info.project.name, `${role}-${name}`);
    }
  });
}
