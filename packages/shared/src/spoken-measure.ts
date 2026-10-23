/**
 * Dictado por voz del modo cancha (KAN-74): convierte lo que devuelve el
 * reconocimiento de voz del navegador ("tríceps doce coma cinco", "12,5",
 * "setenta y cuatro con dos") en un sitio y un valor. Función pura, sin servicio
 * externo; el texto ya viene transcripto por el navegador.
 */

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const DECIMAL_WORDS = new Set(["coma", "punto", "con"]);

/** Minúsculas, sin tildes ni signos. */
export function normalizeSpoken(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9,.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Entero escrito en palabras (hasta 999.999), o null. "setenta y cuatro" → 74. */
function wordsToInt(words: string[]): number | null {
  if (!words.length) return null;
  let total = 0;
  let seen = false;
  for (const w of words) {
    if (w === "y") continue;
    if (w === "mil") {
      total = (total || 1) * 1000;
      seen = true;
      continue;
    }
    if (w in HUNDREDS) total += HUNDREDS[w]!;
    else if (w in TENS) total += TENS[w]!;
    else if (w in UNITS) total += UNITS[w]!;
    else if (/^\d+$/.test(w)) total += Number(w);
    else return null;
    seen = true;
  }
  return seen ? total : null;
}

/**
 * Número dictado: dígitos ("12,5", "12.5"), palabras ("doce coma cinco"), mezcla
 * ("12 coma 5"), "y medio" (+0,5). Los decimales dichos de a uno respetan los ceros:
 * "coma cero cinco" → ,05. Devuelve null si no hay número.
 */
export function parseSpokenNumber(text: string): number | null {
  const t = normalizeSpoken(text);
  if (!t) return null;
  const digits = t.match(/\d+(?:[.,]\d+)?/);
  if (digits && !/[a-z]/.test(t.replace(digits[0], "").replace(/\b(mm|cm|kg|ml|litros?|gramos?|kilos?)\b/g, "").trim())) {
    return Number(digits[0].replace(",", "."));
  }
  const words = t.split(" ").filter((w) => !/^(mm|cm|kg|ml|milimetros?|centimetros?|kilos?|gramos?)$/.test(w));
  let half = false;
  if (words.slice(-2).join(" ") === "y medio" || words.slice(-2).join(" ") === "y media") {
    half = true;
    words.splice(-2, 2);
  }
  const sep = words.findIndex((w) => DECIMAL_WORDS.has(w));
  const intWords = sep === -1 ? words : words.slice(0, sep);
  const decWords = sep === -1 ? [] : words.slice(sep + 1);
  const int = wordsToInt(intWords);
  if (int === null) return null;
  let dec = 0;
  if (decWords.length) {
    // "coma cero cinco": dígito a dígito si empieza con cero o son todas unidades sueltas.
    const single = decWords.every((w) => w in UNITS && UNITS[w]! < 10) || /^\d+$/.test(decWords.join(""));
    if (single && decWords.length > 0) {
      const ds = decWords.map((w) => (w in UNITS ? String(UNITS[w]) : w)).join("");
      dec = Number(`0.${ds}`);
    } else {
      const n = wordsToInt(decWords);
      if (n === null) return null;
      dec = n / 10 ** String(n).length;
    }
  }
  const value = int + dec + (half ? 0.5 : 0);
  return Math.round(value * 1000) / 1000;
}

export interface SpokenTarget {
  key: string;
  label: string;
  /** Formas extra de nombrarlo ("abdomen", "peso antes"). */
  aliases?: string[];
}

export interface SpokenMeasure {
  key: string | null;
  value: number | null;
  /** Lo que se entendió, para mostrarlo. */
  heard: string;
}

/**
 * Sitio + valor. El sitio se reconoce por su nombre sin lo que va entre paréntesis
 * ("Cintura (mínima)" → "cintura"), por la primera palabra si no la comparte con
 * otro sitio de la lista, o por sus alias. Gana el nombre más largo que aparezca.
 */
export function parseSpokenMeasure(text: string, targets: SpokenTarget[]): SpokenMeasure {
  const t = normalizeSpoken(text);
  const names = targets.map((x) => {
    const base = normalizeSpoken(x.label.replace(/\(.*?\)/g, ""));
    return { key: x.key, base, first: base.split(" ")[0]!, aliases: (x.aliases ?? []).map(normalizeSpoken) };
  });
  const firstCount = new Map<string, number>();
  for (const n of names) firstCount.set(n.first, (firstCount.get(n.first) ?? 0) + 1);

  let best: { key: string; phrase: string } | null = null;
  for (const n of names) {
    const phrases = [n.base, ...n.aliases, ...(firstCount.get(n.first) === 1 ? [n.first] : [])];
    for (const p of phrases) {
      if (p && new RegExp(`(^| )${p}( |$)`).test(t) && (!best || p.length > best.phrase.length)) best = { key: n.key, phrase: p };
    }
  }
  const rest = best ? t.replace(new RegExp(`(^| )${best.phrase}( |$)`), " ").trim() : t;
  return { key: best?.key ?? null, value: parseSpokenNumber(rest), heard: text.trim() };
}
