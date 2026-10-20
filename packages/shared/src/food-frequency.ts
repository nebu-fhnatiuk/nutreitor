/**
 * Frecuencia de consumo por grupos de alimentos (ADR 0034). Catálogo, conversión de
 * frecuencias y comparación con las Guías Alimentarias para la Población Argentina
 * (GAPA, Ministerio de Salud, 2016). Funciones PURAS: API y UI.
 *
 * Las GAPA son para la POBLACIÓN GENERAL: a un deportista pueden quedarle cortas (más
 * carbohidratos, más agua). Se muestran como referencia, no como objetivo; el objetivo
 * del deportista es su requerimiento (ADR 0032).
 */

export type FfqGroup = "vegetablesFruits" | "starches" | "dairy" | "protein" | "fats" | "optional" | "drinks" | "sport";

export const FFQ_GROUP_LABEL: Record<FfqGroup, string> = {
  vegetablesFruits: "Verduras y frutas",
  starches: "Legumbres, cereales, papa, pan y pastas",
  dairy: "Leche, yogur y queso",
  protein: "Carnes y huevos",
  fats: "Aceites, frutas secas y semillas",
  optional: "Consumo opcional",
  drinks: "Bebidas",
  sport: "Deporte",
};

export interface FfqItem {
  key: string;
  group: FfqGroup;
  label: string;
  examples: string;
  /** Qué es una porción, para preguntar "¿cuántas porciones cada vez?". */
  portion: string;
}

export const FFQ_ITEMS = [
  { key: "vegetables", group: "vegetablesFruits", label: "Verduras", examples: "crudas o cocidas, de todo tipo y color", portion: "½ plato o 1 taza" },
  { key: "fruits", group: "vegetablesFruits", label: "Frutas", examples: "frescas, enteras", portion: "1 fruta mediana" },
  { key: "legumes", group: "starches", label: "Legumbres", examples: "lentejas, garbanzos, porotos, arvejas", portion: "½ taza cocida" },
  { key: "wholeGrains", group: "starches", label: "Cereales integrales", examples: "avena, arroz y pan integral", portion: "½ taza cocida o 1 rebanada" },
  { key: "refinedGrains", group: "starches", label: "Cereales refinados", examples: "pan blanco, pastas, arroz blanco", portion: "½ taza cocida o 1 rebanada" },
  { key: "tubers", group: "starches", label: "Papa, batata, choclo, mandioca", examples: "", portion: "1 unidad mediana" },
  { key: "dairy", group: "dairy", label: "Leche, yogur y queso", examples: "", portion: "1 taza de leche o yogur, o 1 porción de queso" },
  { key: "redMeat", group: "protein", label: "Carne roja", examples: "vaca, cerdo, cordero", portion: "1 porción (la palma de la mano)" },
  { key: "poultry", group: "protein", label: "Pollo y otras carnes blancas", examples: "", portion: "1 porción (la palma de la mano)" },
  { key: "fish", group: "protein", label: "Pescado y mariscos", examples: "", portion: "1 porción (la palma de la mano)" },
  { key: "eggs", group: "protein", label: "Huevo", examples: "", portion: "1 huevo" },
  { key: "processedMeat", group: "optional", label: "Fiambres, embutidos y hamburguesas", examples: "salame, jamón, salchichas", portion: "1 porción" },
  { key: "oil", group: "fats", label: "Aceite crudo", examples: "como condimento", portion: "1 cucharada" },
  { key: "nutsSeeds", group: "fats", label: "Frutas secas y semillas", examples: "nueces, almendras, maní, chía", portion: "1 puñado" },
  { key: "sugaryDrinks", group: "optional", label: "Gaseosas y jugos azucarados", examples: "", portion: "1 vaso" },
  { key: "sweetsSnacks", group: "optional", label: "Golosinas, galletitas y snacks", examples: "alfajores, papas fritas de paquete", portion: "1 paquete o unidad" },
  { key: "pastries", group: "optional", label: "Facturas, tortas y productos de panadería", examples: "", portion: "1 unidad" },
  { key: "alcohol", group: "drinks", label: "Bebidas alcohólicas", examples: "", portion: "1 trago (vaso de vino, lata de cerveza)" },
  { key: "water", group: "drinks", label: "Agua", examples: "sola, o en infusiones sin azúcar", portion: "1 vaso (250 ml)" },
  { key: "sportsDrinks", group: "sport", label: "Bebidas deportivas y geles", examples: "", portion: "1 botella o gel" },
  { key: "proteinSupplements", group: "sport", label: "Suplementos proteicos", examples: "proteína en polvo, barras", portion: "1 medida o barra" },
] as const satisfies readonly FfqItem[];

export type FfqItemKey = (typeof FFQ_ITEMS)[number]["key"];
export const ffqItemKeys = FFQ_ITEMS.map((i) => i.key) as [FfqItemKey, ...FfqItemKey[]];

/** Categorías clásicas de un cuestionario de frecuencia, con su equivalente en veces por semana. */
export const FFQ_FREQUENCIES = [
  { key: "never", label: "Nunca o casi nunca", perWeek: 0 },
  { key: "monthly", label: "1–3 por mes", perWeek: 0.5 },
  { key: "weekly1", label: "1 por semana", perWeek: 1 },
  { key: "weekly2to4", label: "2–4 por semana", perWeek: 3 },
  { key: "weekly5to6", label: "5–6 por semana", perWeek: 5.5 },
  { key: "daily1", label: "1 por día", perWeek: 7 },
  { key: "daily2to3", label: "2–3 por día", perWeek: 17.5 },
  { key: "daily4to5", label: "4–5 por día", perWeek: 31.5 },
  { key: "daily6plus", label: "6 o más por día", perWeek: 42 },
] as const;

export type FfqFrequencyKey = (typeof FFQ_FREQUENCIES)[number]["key"];
export const ffqFrequencyKeys = FFQ_FREQUENCIES.map((f) => f.key) as [FfqFrequencyKey, ...FfqFrequencyKey[]];

export interface FfqAnswer {
  frequency: FfqFrequencyKey;
  /** Porciones cada vez (default 1). */
  portions: number;
}

export type FfqAnswers = Partial<Record<FfqItemKey, FfqAnswer>>;

const r1 = (n: number) => Math.round(n * 10) / 10;
const perWeekOf = (f: FfqFrequencyKey) => FFQ_FREQUENCIES.find((x) => x.key === f)!.perWeek;

export interface FfqItemResult {
  key: FfqItemKey;
  /** Veces por semana (sin contar porciones). */
  timesPerWeek: number;
  portionsPerWeek: number;
  portionsPerDay: number;
}

/** Porciones por día y por semana de cada item contestado. */
export function ffqItemResults(answers: FfqAnswers): FfqItemResult[] {
  return ffqItemKeys.flatMap((key) => {
    const a = answers[key];
    if (!a) return [];
    const times = perWeekOf(a.frequency);
    const perWeek = times * a.portions;
    return [{ key, timesPerWeek: r1(times), portionsPerWeek: r1(perWeek), portionsPerDay: r1(perWeek / 7) }];
  });
}

// ── Comparación con las GAPA ──────────────────────────────────────────────────

export type FfqSex = "female" | "male";

export interface FfqRule {
  id: string;
  label: string;
  items: FfqItemKey[];
  /** Cómo se mide: porciones por día, porciones por semana, o veces por semana. */
  measure: "portionsPerDay" | "portionsPerWeek" | "timesPerWeek";
  min?: number;
  max?: number;
  /** Para reglas por sexo (alcohol). */
  maxBySex?: Record<FfqSex, number>;
  recommendation: string;
}

export const GAPA_RULES: FfqRule[] = [
  { id: "vegFruit", label: "Verduras y frutas", items: ["vegetables", "fruits"], measure: "portionsPerDay", min: 5, recommendation: "5 porciones por día o más" },
  { id: "dairy", label: "Leche, yogur y queso", items: ["dairy"], measure: "portionsPerDay", min: 3, recommendation: "3 porciones por día" },
  { id: "fish", label: "Pescado", items: ["fish"], measure: "timesPerWeek", min: 2, recommendation: "2 veces por semana o más" },
  { id: "redMeat", label: "Carne roja", items: ["redMeat"], measure: "timesPerWeek", max: 3, recommendation: "hasta 3 veces por semana" },
  { id: "eggs", label: "Huevo", items: ["eggs"], measure: "portionsPerDay", max: 1, recommendation: "hasta 1 por día" },
  { id: "water", label: "Agua", items: ["water"], measure: "portionsPerDay", min: 8, recommendation: "8 vasos por día (2 litros)" },
  {
    id: "optional",
    label: "Consumo opcional (azucarados, golosinas, panadería, fiambres)",
    items: ["sugaryDrinks", "sweetsSnacks", "pastries", "processedMeat"],
    measure: "portionsPerDay",
    max: 1,
    recommendation: "limitarlo: hasta 1 porción por día entre todos",
  },
  {
    id: "alcohol",
    label: "Bebidas alcohólicas",
    items: ["alcohol"],
    measure: "portionsPerDay",
    maxBySex: { female: 1, male: 2 },
    recommendation: "no más de 1 trago por día en mujeres y 2 en varones",
  },
];

export type FfqRuleStatus = "ok" | "below" | "above" | "unanswered";

export interface FfqRuleResult {
  id: string;
  label: string;
  recommendation: string;
  value: number | null;
  unit: string;
  status: FfqRuleStatus;
}

const UNIT: Record<FfqRule["measure"], string> = {
  portionsPerDay: "porciones/día",
  portionsPerWeek: "porciones/semana",
  timesPerWeek: "veces/semana",
};

export function gapaComparison(answers: FfqAnswers, sex: FfqSex | null): FfqRuleResult[] {
  const byKey = new Map(ffqItemResults(answers).map((r) => [r.key, r]));
  return GAPA_RULES.map((rule) => {
    const answered = rule.items.filter((k) => byKey.has(k));
    const base = { id: rule.id, label: rule.label, recommendation: rule.recommendation, unit: UNIT[rule.measure] };
    if (answered.length === 0) return { ...base, value: null, status: "unanswered" as const };
    const value = r1(answered.reduce((acc, k) => acc + byKey.get(k)![rule.measure], 0));
    const max = rule.maxBySex ? (sex ? rule.maxBySex[sex] : Math.min(...Object.values(rule.maxBySex))) : rule.max;
    const status: FfqRuleStatus =
      rule.min != null && value < rule.min ? "below" : max != null && value > max ? "above" : "ok";
    return { ...base, value, status };
  });
}

/** Proporción de integrales sobre el total de cereales (las GAPA recomiendan preferirlos). */
export function wholeGrainShare(answers: FfqAnswers): number | null {
  const byKey = new Map(ffqItemResults(answers).map((r) => [r.key, r]));
  const whole = byKey.get("wholeGrains")?.portionsPerWeek ?? 0;
  const refined = byKey.get("refinedGrains")?.portionsPerWeek ?? 0;
  return whole + refined > 0 ? Math.round((whole / (whole + refined)) * 100) : null;
}
