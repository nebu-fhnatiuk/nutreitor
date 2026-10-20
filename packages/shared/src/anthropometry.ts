/**
 * Antropometría deportiva ISAK (ADR 0030): catálogo de sitios, regla de tomas y
 * cálculos. Funciones PURAS (sin I/O): las usan la API (al leer, nunca se guardan
 * resultados) y la UI (vista previa mientras se carga).
 *
 * ESTADO: habilitada (2026-10-20, por decisión de la nutricionista). Las fórmulas
 * siguen los coeficientes publicados (citados en cada función) y tienen tests. Si
 * `ANTHROPOMETRY_VALIDATED` vuelve a false, el portal deja de mostrar resultados y la
 * UI profesional los marca como "en validación".
 */

export const ANTHROPOMETRY_VALIDATED = true;

export type AnthroUnit = "kg" | "cm" | "mm";
export type AnthroGroup = "basic" | "skinfold" | "girth" | "breadth";

export interface AnthroSite {
  key: AnthroSiteKey;
  label: string;
  unit: AnthroUnit;
  group: AnthroGroup;
  /** Bloque opcional para el fraccionamiento de Kerr. */
  kerr: boolean;
  /** Rango plausible (atrapa errores de tipeo, no es un criterio clínico). */
  min: number;
  max: number;
}

/** Perfil restringido ISAK + bloque Kerr. El orden es el de la planilla de carga. */
export const ANTHRO_SITES = [
  // Básicas
  { key: "bodyMass", label: "Masa corporal", unit: "kg", group: "basic", kerr: false, min: 15, max: 250 },
  { key: "stature", label: "Talla", unit: "cm", group: "basic", kerr: false, min: 100, max: 230 },
  { key: "sittingHeight", label: "Talla sentado", unit: "cm", group: "basic", kerr: true, min: 50, max: 120 },
  // Pliegues
  { key: "triceps", label: "Tríceps", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 60 },
  { key: "subscapular", label: "Subescapular", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 60 },
  { key: "biceps", label: "Bíceps", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 60 },
  { key: "iliacCrest", label: "Cresta ilíaca", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 70 },
  { key: "supraspinale", label: "Supraespinal", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 60 },
  { key: "abdominal", label: "Abdominal", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 80 },
  { key: "frontThigh", label: "Muslo frontal", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 70 },
  { key: "medialCalf", label: "Pantorrilla medial", unit: "mm", group: "skinfold", kerr: false, min: 2, max: 60 },
  // Perímetros
  { key: "armRelaxed", label: "Brazo relajado", unit: "cm", group: "girth", kerr: false, min: 15, max: 60 },
  { key: "armFlexed", label: "Brazo flexionado y contraído", unit: "cm", group: "girth", kerr: false, min: 15, max: 65 },
  { key: "waist", label: "Cintura (mínima)", unit: "cm", group: "girth", kerr: false, min: 40, max: 180 },
  { key: "hip", label: "Cadera (máxima)", unit: "cm", group: "girth", kerr: false, min: 50, max: 180 },
  { key: "calf", label: "Pantorrilla (máxima)", unit: "cm", group: "girth", kerr: false, min: 20, max: 60 },
  { key: "forearm", label: "Antebrazo (máximo)", unit: "cm", group: "girth", kerr: true, min: 15, max: 45 },
  { key: "chest", label: "Tórax (mesoesternal)", unit: "cm", group: "girth", kerr: true, min: 50, max: 160 },
  { key: "midThigh", label: "Muslo medio", unit: "cm", group: "girth", kerr: true, min: 30, max: 90 },
  { key: "head", label: "Cabeza", unit: "cm", group: "girth", kerr: true, min: 45, max: 65 },
  // Diámetros
  { key: "humerus", label: "Húmero (biepicondilar)", unit: "cm", group: "breadth", kerr: false, min: 4, max: 10 },
  { key: "wrist", label: "Biestiloideo (muñeca)", unit: "cm", group: "breadth", kerr: false, min: 4, max: 8 },
  { key: "femur", label: "Fémur (bicondilar)", unit: "cm", group: "breadth", kerr: false, min: 6, max: 13 },
  { key: "biacromial", label: "Biacromial", unit: "cm", group: "breadth", kerr: true, min: 25, max: 50 },
  { key: "biiliocristal", label: "Biiliocrestídeo", unit: "cm", group: "breadth", kerr: true, min: 18, max: 40 },
  { key: "chestTransverse", label: "Tórax transverso", unit: "cm", group: "breadth", kerr: true, min: 18, max: 45 },
  { key: "chestAP", label: "Tórax anteroposterior", unit: "cm", group: "breadth", kerr: true, min: 12, max: 35 },
] as const;

export type AnthroSiteKey = (typeof ANTHRO_SITES)[number]["key"];
export const anthroSiteKeys = ANTHRO_SITES.map((s) => s.key) as [AnthroSiteKey, ...AnthroSiteKey[]];

/** Tomas por sitio (1 a 3 valores; la masa suele tomarse una vez). */
export type AnthroTakes = Partial<Record<AnthroSiteKey, number[]>>;

const SITE = Object.fromEntries(ANTHRO_SITES.map((s) => [s.key, s as AnthroSite])) as Record<AnthroSiteKey, AnthroSite>;
export const anthroSite = (key: AnthroSiteKey): AnthroSite => SITE[key];

// ── Regla de tomas (ISAK) ─────────────────────────────────────────────────────

/** Tolerancia entre las dos primeras tomas: 5% en pliegues, 1% en el resto. */
export function takeTolerance(key: AnthroSiteKey): number {
  return SITE[key].group === "skinfold" ? 0.05 : 0.01;
}

/** ¿Las dos primeras tomas difieren más de la tolerancia? → hace falta la 3ª. */
export function needsThirdTake(key: AnthroSiteKey, takes: number[]): boolean {
  if (takes.length < 2) return false;
  const [a, b] = takes as [number, number];
  const ref = Math.min(a, b);
  if (ref <= 0) return false;
  return Math.abs(a - b) / ref > takeTolerance(key);
}

/** Valor final: la toma única, la media de dos o la mediana de tres. */
export function finalValue(takes: number[] | undefined): number | null {
  const t = (takes ?? []).filter((v) => Number.isFinite(v));
  if (t.length === 0) return null;
  if (t.length === 1) return t[0]!;
  if (t.length === 2) return (t[0]! + t[1]!) / 2;
  const s = [...t].slice(0, 3).sort((x, y) => x - y);
  return s[1]!;
}

/** Valores finales de todos los sitios cargados. */
export function finalValues(takes: AnthroTakes): Partial<Record<AnthroSiteKey, number>> {
  const out: Partial<Record<AnthroSiteKey, number>> = {};
  for (const key of anthroSiteKeys) {
    const v = finalValue(takes[key]);
    if (v !== null) out[key] = v;
  }
  return out;
}

// ── Resultados ────────────────────────────────────────────────────────────────

export type AnthroSex = "female" | "male";

export interface AnthroSubject {
  /** Sólo femenino/masculino: las ecuaciones están validadas por sexo. */
  sex: AnthroSex | null;
  /** Edad en años cumplidos a la fecha de la medición. */
  ageYears: number | null;
}

/** Un resultado o por qué no se pudo calcular (sitios faltantes, sexo, edad). */
export type Calc<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface KerrResult {
  skinKg: number;
  adiposeKg: number;
  muscleKg: number;
  residualKg: number;
  boneKg: number;
  /** Suma de los 5 componentes. */
  totalKg: number;
  /** (estimada − medida) / medida × 100. Kerr la considera aceptable dentro de ±5%. */
  diffPct: number;
  pct: { skin: number; adipose: number; muscle: number; residual: number; bone: number };
  muscleBoneIndex: number;
}

export interface Somatotype {
  endo: number;
  meso: number;
  ecto: number;
  /** Coordenadas de la somatocarta. */
  x: number;
  y: number;
}

export interface AnthroResults {
  sum6: Calc<number>;
  sum8: Calc<number>;
  fat: {
    durninWomersley: Calc<number>;
    yuhasz: Calc<number>;
    faulkner: Calc<number>;
  };
  somatotype: Calc<Somatotype>;
  kerr: Calc<KerrResult>;
}

type V = Partial<Record<AnthroSiteKey, number>>;

const SUM6: AnthroSiteKey[] = ["triceps", "subscapular", "supraspinale", "abdominal", "frontThigh", "medialCalf"];
const SUM8: AnthroSiteKey[] = [...SUM6, "biceps", "iliacCrest"];

/** Sitios sin valor, o null si están todos. */
function missing(v: V, keys: AnthroSiteKey[]): string[] | null {
  const m = keys.filter((k) => v[k] === undefined).map((k) => SITE[k].label);
  return m.length ? m : null;
}

function need(v: V, keys: AnthroSiteKey[]): string | null {
  const m = missing(v, keys);
  return m ? `Faltan: ${m.join(", ")}.` : null;
}

function sumOf(v: V, keys: AnthroSiteKey[]): Calc<number> {
  const miss = need(v, keys);
  if (miss) return { ok: false, reason: miss };
  return { ok: true, value: round(keys.reduce((n, k) => n + v[k]!, 0), 1) };
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const noSex = { ok: false as const, reason: "La ecuación requiere sexo femenino o masculino en la ficha." };

/**
 * Durnin & Womersley (1974): densidad = c − m·log10(Σ bíceps, tríceps, subescapular,
 * cresta ilíaca), con c y m por sexo y edad; % graso por Siri (1961): 495/D − 450.
 * Las tablas parten de los 17 años.
 */
const DW: Record<AnthroSex, { from: number; c: number; m: number }[]> = {
  male: [
    { from: 50, c: 1.1715, m: 0.0779 },
    { from: 40, c: 1.162, m: 0.07 },
    { from: 30, c: 1.1422, m: 0.0544 },
    { from: 20, c: 1.1631, m: 0.0632 },
    { from: 17, c: 1.162, m: 0.063 },
  ],
  female: [
    { from: 50, c: 1.1339, m: 0.0645 },
    { from: 40, c: 1.1333, m: 0.0612 },
    { from: 30, c: 1.1423, m: 0.0632 },
    { from: 20, c: 1.1599, m: 0.0717 },
    { from: 17, c: 1.1549, m: 0.0678 },
  ],
};

export function durninWomersley(v: V, s: AnthroSubject): Calc<number> {
  if (!s.sex) return noSex;
  if (s.ageYears === null) return { ok: false, reason: "Falta la fecha de nacimiento en la ficha." };
  const row = DW[s.sex].find((r) => s.ageYears! >= r.from);
  if (!row) return { ok: false, reason: "Durnin-Womersley no aplica a menores de 17 años." };
  const miss = need(v, ["biceps", "triceps", "subscapular", "iliacCrest"]);
  if (miss) return { ok: false, reason: miss };
  const sum = v.biceps! + v.triceps! + v.subscapular! + v.iliacCrest!;
  const density = row.c - row.m * Math.log10(sum);
  return { ok: true, value: round(495 / density - 450, 1) };
}

/** Yuhasz modificada por Carter (1982), Σ6 pliegues. Varones 0,1051·Σ6 + 2,585; mujeres 0,1548·Σ6 + 3,580. */
export function yuhasz(v: V, s: AnthroSubject): Calc<number> {
  if (!s.sex) return noSex;
  const sum = sumOf(v, SUM6);
  if (!sum.ok) return sum;
  const pct = s.sex === "male" ? 0.1051 * sum.value + 2.585 : 0.1548 * sum.value + 3.58;
  return { ok: true, value: round(pct, 1) };
}

/** Faulkner (1968): 0,153·(tríceps + subescapular + supraespinal + abdominal) + 5,783. */
export function faulkner(v: V): Calc<number> {
  const keys: AnthroSiteKey[] = ["triceps", "subscapular", "supraspinale", "abdominal"];
  const miss = need(v, keys);
  if (miss) return { ok: false, reason: miss };
  return { ok: true, value: round(0.153 * keys.reduce((n, k) => n + v[k]!, 0) + 5.783, 1) };
}

/**
 * Somatotipo antropométrico de Heath-Carter (Carter & Heath, 1990).
 *  - Endo: X = (tríceps + subescapular + supraespinal)·170,18/talla;
 *    −0,7182 + 0,1451X − 0,00068X² + 0,0000014X³.
 *  - Meso: 0,858·húmero + 0,601·fémur + 0,188·(brazo flex − tríceps/10)
 *    + 0,161·(pantorrilla − pliegue pantorrilla/10) − 0,131·talla + 4,5.
 *  - Ecto: IP = talla / ∛masa; ≥ 40,75 → 0,732·IP − 28,58; 38,25–40,75 → 0,463·IP − 17,63;
 *    ≤ 38,25 → 0,1.
 *  - Somatocarta: x = ecto − endo; y = 2·meso − (endo + ecto).
 */
export function somatotype(v: V): Calc<Somatotype> {
  const miss = need(v, ["stature", "bodyMass", "triceps", "subscapular", "supraspinale", "humerus", "femur", "armFlexed", "calf", "medialCalf"]);
  if (miss) return { ok: false, reason: miss };
  const h = v.stature!;
  const x = (v.triceps! + v.subscapular! + v.supraspinale!) * (170.18 / h);
  const endo = -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3;
  const meso =
    0.858 * v.humerus! +
    0.601 * v.femur! +
    0.188 * (v.armFlexed! - v.triceps! / 10) +
    0.161 * (v.calf! - v.medialCalf! / 10) -
    0.131 * h +
    4.5;
  const hwr = h / Math.cbrt(v.bodyMass!);
  const ecto = hwr >= 40.75 ? 0.732 * hwr - 28.58 : hwr > 38.25 ? 0.463 * hwr - 17.63 : 0.1;
  const e = Math.max(endo, 0.1);
  const m = Math.max(meso, 0.1);
  const c = Math.max(ecto, 0.1);
  return {
    ok: true,
    value: { endo: round(e, 1), meso: round(m, 1), ecto: round(c, 1), x: round(c - e, 1), y: round(2 * m - (e + c), 1) },
  };
}

/**
 * Fraccionamiento en 5 componentes de Kerr (1988), con el Phantom de Ross & Wilson.
 * Para cada componente: Z = (Σ·(P/h)^d − p)/s y masa = (Z·S + M)/(P/h)³, con
 * P = 170,18 cm (o 89,92 cm de talla sentado para la masa residual).
 *  - Piel: superficie corporal (DuBois, constante 68,308 en ≥ 12 años) × grosor
 *    (2,07 mm varones, 1,96 mm mujeres) × 1,05.
 *  - Adiposa: Σ6 pliegues; p 116,41, s 34,79; S 5,85, M 25,6.
 *  - Muscular: brazo, antebrazo, tórax, muslo y pantorrilla corregidos por pliegue
 *    (perímetro − π·pliegue/10); p 207,21, s 13,74; S 5,4, M 24,5.
 *  - Residual: cintura corregida + tórax transverso + tórax AP, escalado por talla
 *    sentado; p 109,35, s 7,08; S 1,24, M 6,10.
 *  - Ósea: cabeza (Z = (perímetro − 56,0)/1,44; masa Z·0,18 + 1,20) + cuerpo
 *    (biacromial + biiliocrestídeo + 2·húmero + 2·fémur; p 98,88, s 5,33; S 1,34, M 6,70).
 */
export function kerr(v: V, s: AnthroSubject): Calc<KerrResult> {
  if (!s.sex) return noSex;
  const miss = missing(v, [
    "bodyMass", "stature", "sittingHeight",
    "triceps", "subscapular", "supraspinale", "abdominal", "frontThigh", "medialCalf",
    "armRelaxed", "forearm", "chest", "midThigh", "calf", "waist", "head",
    "humerus", "femur", "biacromial", "biiliocristal", "chestTransverse", "chestAP",
  ]);
  if (miss) return { ok: false, reason: `Para el fraccionamiento faltan: ${miss.join(", ")}.` };

  const W = v.bodyMass!;
  const H = v.stature!;
  const k = 170.18 / H;
  const k3 = k ** 3;
  const corr = (girth: number, skinfoldMm: number) => girth - (Math.PI * skinfoldMm) / 10;

  // Piel
  const bsa = (68.308 * W ** 0.425 * H ** 0.725) / 10000;
  const skinKg = bsa * (s.sex === "male" ? 2.07 : 1.96) * 1.05;

  // Adiposa
  const sumSk = SUM6.reduce((n, key) => n + v[key]!, 0);
  const zA = (sumSk * k - 116.41) / 34.79;
  const adiposeKg = (zA * 5.85 + 25.6) / k3;

  // Muscular
  const sumCG =
    corr(v.armRelaxed!, v.triceps!) +
    v.forearm! +
    corr(v.chest!, v.subscapular!) +
    corr(v.midThigh!, v.frontThigh!) +
    corr(v.calf!, v.medialCalf!);
  const zM = (sumCG * k - 207.21) / 13.74;
  const muscleKg = (zM * 5.4 + 24.5) / k3;

  // Residual (escala por talla sentado)
  const ks = 89.92 / v.sittingHeight!;
  const sumR = corr(v.waist!, v.abdominal!) + v.chestTransverse! + v.chestAP!;
  const zR = (sumR * ks - 109.35) / 7.08;
  const residualKg = (zR * 1.24 + 6.1) / ks ** 3;

  // Ósea
  const headKg = ((v.head! - 56.0) / 1.44) * 0.18 + 1.2;
  const sumB = v.biacromial! + v.biiliocristal! + 2 * v.humerus! + 2 * v.femur!;
  const zB = (sumB * k - 98.88) / 5.33;
  const boneKg = headKg + (zB * 1.34 + 6.7) / k3;

  const totalKg = skinKg + adiposeKg + muscleKg + residualKg + boneKg;
  const pct = (x: number) => round((x / totalKg) * 100, 1);
  return {
    ok: true,
    value: {
      skinKg: round(skinKg),
      adiposeKg: round(adiposeKg),
      muscleKg: round(muscleKg),
      residualKg: round(residualKg),
      boneKg: round(boneKg),
      totalKg: round(totalKg),
      diffPct: round(((totalKg - W) / W) * 100, 1),
      pct: { skin: pct(skinKg), adipose: pct(adiposeKg), muscle: pct(muscleKg), residual: pct(residualKg), bone: pct(boneKg) },
      muscleBoneIndex: round(muscleKg / boneKg),
    },
  };
}

/** Todos los resultados de una sesión. */
export function anthropometryResults(takes: AnthroTakes, subject: AnthroSubject): AnthroResults {
  const v = finalValues(takes);
  return {
    sum6: sumOf(v, SUM6),
    sum8: sumOf(v, SUM8),
    fat: { durninWomersley: durninWomersley(v, subject), yuhasz: yuhasz(v, subject), faulkner: faulkner(v) },
    somatotype: somatotype(v),
    kerr: kerr(v, subject),
  };
}

/** Edad en años cumplidos a una fecha (ISO yyyy-mm-dd). */
export function ageAt(birthDate: string | null, onDate: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [y, m, d] = onDate.split("-").map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age >= 0 ? age : null;
}
