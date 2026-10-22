/**
 * Ficha en cuatro momentos de trabajo (KAN-68): cada momento agrupa las secciones
 * que se usan juntas en la consulta. La URL es `?tab=<momento>&sec=<sección>`.
 */
export type Moment = "evaluar" | "prescribir" | "seguir" | "conversar";

export type Section =
  | "antropometria"
  | "ingesta"
  | "hidratacion"
  | "requerimiento"
  | "plan"
  | "evolucion"
  | "reportes"
  | "notas"
  | "mensajes"
  | "asistentes";

export const MOMENTS: { id: Moment; label: string; hint: string; sections: { id: Section; label: string }[] }[] = [
  {
    id: "evaluar",
    label: "Evaluar",
    hint: "Antropometría, ingesta e hidratación",
    sections: [
      { id: "antropometria", label: "Antropometría" },
      { id: "ingesta", label: "Ingesta" },
      { id: "hidratacion", label: "Hidratación" },
    ],
  },
  {
    id: "prescribir",
    label: "Prescribir",
    hint: "Requerimiento y plan",
    sections: [
      { id: "requerimiento", label: "Requerimiento" },
      { id: "plan", label: "Plan" },
    ],
  },
  {
    id: "seguir",
    label: "Seguir",
    hint: "Evolución, adherencia y reportes",
    sections: [
      { id: "evolucion", label: "Evolución y adherencia" },
      { id: "reportes", label: "Reportes" },
    ],
  },
  {
    id: "conversar",
    label: "Conversar",
    hint: "Notas, mensajes y asistentes",
    sections: [
      { id: "notas", label: "Notas" },
      { id: "mensajes", label: "Mensajes" },
      { id: "asistentes", label: "Asistentes" },
    ],
  },
];

const MOMENT_IDS = MOMENTS.map((m) => m.id);
const SECTION_MOMENT = Object.fromEntries(
  MOMENTS.flatMap((m) => m.sections.map((s) => [s.id, m.id])),
) as Record<Section, Moment>;

/**
 * Lee la URL. Acepta los links viejos de 12 pestañas (`?tab=plan`, `?tab=ficha`…):
 * `canonical` dice a qué URL redirigir. `resumen` y `ficha` ya no son pestañas: el
 * resumen es el encabezado y la ficha clínica, el panel lateral (`clinical`).
 */
export function resolveTab(
  tab: string | null,
  sec: string | null,
  allowed: (s: Section) => boolean,
): { moment: Moment; section: Section; clinical: boolean; canonical: boolean } {
  const first = (m: Moment) => MOMENTS.find((x) => x.id === m)!.sections.find((s) => allowed(s.id))!.id;
  if (tab && (MOMENT_IDS as string[]).includes(tab)) {
    const moment = tab as Moment;
    const section =
      sec && SECTION_MOMENT[sec as Section] === moment && allowed(sec as Section) ? (sec as Section) : first(moment);
    return { moment, section, clinical: false, canonical: true };
  }
  if (tab && tab in SECTION_MOMENT && allowed(tab as Section)) {
    const section = tab as Section;
    return { moment: SECTION_MOMENT[section], section, clinical: false, canonical: false };
  }
  return { moment: "evaluar", section: first("evaluar"), clinical: tab === "ficha", canonical: !tab };
}

export function tabHref(pathname: string, moment: Moment, section: Section): string {
  const def = MOMENTS.find((m) => m.id === moment)!.sections[0]!.id;
  if (moment === "evaluar" && section === def) return pathname;
  return section === def ? `${pathname}?tab=${moment}` : `${pathname}?tab=${moment}&sec=${section}`;
}
