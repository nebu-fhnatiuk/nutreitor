import { buildCommands, searchCommands } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Paleta de comandos (KAN-75): qué se arma y cómo se busca. */
const items = buildCommands({
  patients: [
    { id: "j", fullName: "Juan Pérez", groups: [{ name: "Primera" }] },
    { id: "s", fullName: "Sofía Núñez" },
    { id: "m", fullName: "Martina Juárez" },
  ],
  groups: [{ id: "g", name: "Sub-17", memberCount: 22 }],
  patientsPath: "/pro/patients",
  groupsPath: "/pro/groups",
  canMessage: true,
  nav: [
    { href: "/pro", label: "Hoy" },
    { href: "/pro/agenda", label: "Agenda" },
  ],
});
const first = (q: string) => searchCommands(items, q)[0];

describe("paleta de comandos", () => {
  it("el nombre solo abre la ficha", () => {
    expect(first("juan")).toMatchObject({ kind: "patient", href: "/pro/patients/j" });
  });

  it("verbo + nombre va a la sección, aunque se escriba 'a', 'de' o sin tildes", () => {
    expect(first("medir a juan")?.href).toBe("/pro/patients/j");
    expect(first("medir a juan")?.kind).toBe("action");
    expect(first("plan de sofia")?.href).toBe("/pro/patients/s?tab=prescribir&sec=plan");
    expect(first("sudor sof")?.href).toBe("/pro/patients/s?tab=evaluar&sec=hidratacion");
    expect(first("recordatorio martina")?.href).toBe("/pro/patients/m?tab=evaluar&sec=ingesta");
  });

  it("plantel: la pizarra primero; 'medir plantel' a la planilla", () => {
    expect(first("plantel sub-17")).toMatchObject({ kind: "group", href: "/pro/groups/g" });
    expect(first("medir sub")?.href).toBe("/pro/groups/g/medir");
  });

  it("todas las palabras tienen que estar; prefijos de palabra, no subcadenas", () => {
    expect(searchCommands(items, "juan sofia")).toEqual([]);
    expect(searchCommands(items, "uan")).toEqual([]);
    // "jua" es comienzo de Juan y de Juárez: aparecen los dos.
    expect(searchCommands(items, "jua").filter((i) => i.kind === "patient").map((i) => i.title)).toEqual(["Juan Pérez", "Martina Juárez"]);
  });

  it("sin mensajes (admin) no se arma esa acción", () => {
    const admin = buildCommands({ patients: [{ id: "j", fullName: "Juan" }], groups: [], patientsPath: "/admin/patients", groupsPath: "/admin/groups", canMessage: false, nav: [] });
    expect(admin.some((i) => i.id.endsWith(":mensajes"))).toBe(false);
    expect(searchCommands(admin, "chat juan")).toEqual([]);
  });

  it("vacío: muestra la navegación; límite de resultados", () => {
    expect(searchCommands(items, "").map((i) => i.title)).toEqual(["Hoy", "Agenda"]);
    expect(searchCommands(items, "m", 5)).toHaveLength(5);
  });
});
