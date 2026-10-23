/**
 * Paleta de comandos (KAN-75): qué acciones arma el workspace y cómo se buscan.
 * Funciones puras: la web arma los ítems con los pacientes y grupos que la API ya
 * devolvió filtrados (el profesional sólo ve a sus asignados) y busca acá.
 */

export type CommandKind = "nav" | "patient" | "group" | "action";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle?: string;
  href: string;
  /** Palabras extra por las que se encuentra (verbos, sinónimos). */
  keywords: string[];
}

/** Acciones sobre un deportista: verbo(s) → sección de la ficha (KAN-68). */
export const PATIENT_ACTIONS: { id: string; title: string; verbs: string[]; query: string; needsMessages?: boolean }[] = [
  { id: "medir", title: "Medir", verbs: ["medir", "medicion", "antropometria", "pliegues", "isak"], query: "" },
  { id: "plan", title: "Plan", verbs: ["plan", "dieta", "prescribir", "menu"], query: "?tab=prescribir&sec=plan" },
  { id: "requerimiento", title: "Requerimiento", verbs: ["requerimiento", "energia", "calorias", "kcal", "gasto"], query: "?tab=prescribir" },
  { id: "recordatorio", title: "Recordatorio de 24 h", verbs: ["recordatorio", "ingesta", "24h", "frecuencia", "consumo"], query: "?tab=evaluar&sec=ingesta" },
  { id: "hidratacion", title: "Hidratación", verbs: ["hidratacion", "sudor", "sudoracion", "liquidos"], query: "?tab=evaluar&sec=hidratacion" },
  { id: "evolucion", title: "Evolución", verbs: ["evolucion", "adherencia", "seguir", "progreso"], query: "?tab=seguir" },
  { id: "notas", title: "Notas", verbs: ["nota", "notas", "conversar"], query: "?tab=conversar" },
  { id: "mensajes", title: "Mensajes", verbs: ["mensaje", "mensajes", "chat", "escribir"], query: "?tab=conversar&sec=mensajes", needsMessages: true },
];

export const GROUP_ACTIONS: { id: string; title: string; verbs: string[]; path: string }[] = [
  { id: "pizarra", title: "Pizarra", verbs: ["plantel", "grupo", "pizarra", "equipo"], path: "" },
  { id: "medir", title: "Medir plantel", verbs: ["medir", "medicion", "antropometria", "pliegues"], path: "/medir" },
  { id: "hidratacion", title: "Hidratación del plantel", verbs: ["hidratacion", "sudor", "sudoracion"], path: "/hidratacion" },
];

/** Minúsculas, sin tildes ni signos (para comparar). */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras que no aportan a la búsqueda ("plan de Sofía", "medir a Juan"). */
const STOP = new Set(["de", "del", "a", "al", "la", "el", "los", "las", "para", "con"]);

export function buildCommands(input: {
  patients: { id: string; fullName: string; groups?: { name: string }[] }[];
  groups: { id: string; name: string; memberCount?: number }[];
  patientsPath: string;
  groupsPath: string;
  canMessage: boolean;
  nav: { href: string; label: string }[];
}): CommandItem[] {
  const out: CommandItem[] = input.nav.map((n) => ({
    id: `nav:${n.href}`,
    kind: "nav",
    title: n.label,
    subtitle: "Ir a",
    href: n.href,
    keywords: ["ir"],
  }));
  for (const p of input.patients) {
    const base = `${input.patientsPath}/${p.id}`;
    const sub = p.groups?.map((g) => g.name).join(" · ") || undefined;
    out.push({ id: `patient:${p.id}`, kind: "patient", title: p.fullName, subtitle: sub ?? "Ficha", href: base, keywords: ["ficha", "deportista", "paciente"] });
    for (const a of PATIENT_ACTIONS) {
      if (a.needsMessages && !input.canMessage) continue;
      out.push({ id: `patient:${p.id}:${a.id}`, kind: "action", title: `${a.title} · ${p.fullName}`, subtitle: sub, href: base + a.query, keywords: a.verbs });
    }
  }
  for (const g of input.groups) {
    const base = `${input.groupsPath}/${g.id}`;
    for (const a of GROUP_ACTIONS) {
      out.push({
        id: `group:${g.id}:${a.id}`,
        kind: a.id === "pizarra" ? "group" : "action",
        title: a.id === "pizarra" ? g.name : `${a.title} · ${g.name}`,
        subtitle: a.id === "pizarra" ? (g.memberCount != null ? `Plantel · ${g.memberCount}` : "Plantel") : undefined,
        href: base + a.path,
        keywords: a.verbs,
      });
    }
  }
  return out;
}

/**
 * Busca: cada palabra de la consulta tiene que ser el comienzo de alguna palabra del
 * ítem (título o palabras clave). Puntaje: coincidir por palabra clave (un verbo como
 * "sudor", o "plantel") favorece a ese ítem; sin palabra clave gana la ficha o el
 * plantel; el título que empieza igual, más arriba.
 */
export function searchCommands(items: CommandItem[], query: string, limit = 8): CommandItem[] {
  const q = normalizeQuery(query)
    .split(" ")
    .filter((w) => w && !STOP.has(w));
  if (!q.length) return items.filter((i) => i.kind === "nav").slice(0, limit);
  const scored: { item: CommandItem; score: number }[] = [];
  for (const item of items) {
    const titleWords = normalizeQuery(item.title).split(" ");
    const kw = item.keywords.map(normalizeQuery);
    let score = 0;
    let usedVerb = false;
    let ok = true;
    for (const w of q) {
      const inTitle = titleWords.some((t) => t.startsWith(w));
      const inKw = kw.some((k) => k.startsWith(w));
      if (!inTitle && !inKw) {
        ok = false;
        break;
      }
      if (inKw && !inTitle) usedVerb = true;
      score += inTitle ? 2 : 1;
    }
    if (!ok) continue;
    // Una palabra clave ("sudor", "plantel") dice la intención: ese ítem va primero.
    if (usedVerb) score += 3;
    else if (item.kind !== "action") score += 2;
    if (normalizeQuery(item.title).startsWith(q.join(" "))) score += 1;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "es"))
    .slice(0, limit)
    .map((s) => s.item);
}
