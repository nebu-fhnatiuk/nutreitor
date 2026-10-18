import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { authFile } from "./auth.setup";

/**
 * Recorre las pantallas de cada rol del tenant demo y guarda una captura de página
 * completa por viewport. No es un test de regresión (no compara): es material para
 * revisar UX/UI. LABEL separa corridas ("antes", "despues", una fecha…).
 */
const LABEL = process.env.LABEL ?? "actual";
const PATIENT_ID = "00000000-0000-0000-0000-0000000000d1";

const ROLES = {
  pro: {
    pages: [
      ["inicio", "/pro"],
      ["pacientes", "/pro/patients"],
      ["ficha", `/pro/patients/${PATIENT_ID}`],
      ["ficha-plan", `/pro/patients/${PATIENT_ID}?tab=plan`],
      ["ficha-evolucion", `/pro/patients/${PATIENT_ID}?tab=evolucion`],
      ["ficha-clinica", `/pro/patients/${PATIENT_ID}?tab=ficha`],
      ["ficha-notas", `/pro/patients/${PATIENT_ID}?tab=notas`],
      ["ficha-asistentes", `/pro/patients/${PATIENT_ID}?tab=asistentes`],
      ["agenda", "/pro/agenda"],
      ["perfil", "/pro/profile"],
    ],
  },
  admin: {
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
    pages: [
      ["portal", "/app"],
      ["plan", "/app/plan"],
    ],
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

test("páginas públicas", async ({ page }, info) => {
  for (const [name, path] of PUBLIC_PAGES) {
    await page.goto(path);
    await shot(page, info.project.name, `publico-${name}`);
  }
});

for (const [role, cfg] of Object.entries(ROLES)) {
  test.describe(`rol ${role}`, () => {
    // Sesión iniciada una sola vez en auth.setup.ts.
    test.use({ storageState: authFile(role) });
    test("pantallas", async ({ page }, info) => {
      for (const [name, path] of cfg.pages) {
        await page.goto(path);
        await shot(page, info.project.name, `${role}-${name}`);
      }
    });
  });
}
