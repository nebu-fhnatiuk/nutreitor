import { ANTHRO_SITES, needsThirdTake, takeTolerance, type AnthroSiteKey } from "@nutreitor/shared";

import { fmt, parseDecimal } from "@/components/patients/anthro-format";
import type { FieldStep } from "./field-mode";

export type Take = 0 | 1 | 2;
type Raw = [string, string, string] | undefined;

/** La masa corporal se toma una sola vez. */
export const SINGLE_TAKE: AnthroSiteKey[] = ["bodyMass"];

const firstTwo = (raw: Raw) =>
  [parseDecimal(raw?.[0] ?? ""), parseDecimal(raw?.[1] ?? "")].filter((n): n is number => n !== null);

/** ¿El sitio se carga en esta toma? (regla ISAK: la 3ª sólo si las dos primeras difieren). */
export function takeApplies(key: AnthroSiteKey, raw: Raw, take: Take): boolean {
  if (take === 0) return true;
  if (SINGLE_TAKE.includes(key)) return false;
  if (take === 1) return true;
  return needsThirdTake(key, firstTwo(raw)) || (raw?.[2] ?? "") !== "";
}

/** Debajo del número: las otras tomas y si hace falta una tercera. */
export function takeHint(key: AnthroSiteKey, raw: Raw, take: Take): React.ReactNode {
  if (SINGLE_TAKE.includes(key) || take === 0) return null;
  const [a, b] = [parseDecimal(raw?.[0] ?? ""), parseDecimal(raw?.[1] ?? "")];
  const parts: string[] = [];
  if (a !== null) parts.push(`T1 ${fmt(a)}`);
  if (take === 2 && b !== null) parts.push(`T2 ${fmt(b)}`);
  const cur = parseDecimal(raw?.[take] ?? "");
  if (take === 1 && a !== null && cur !== null && a > 0) {
    const diff = Math.abs(cur - a) / a;
    parts.push(diff > takeTolerance(key) ? `Δ ${fmt(diff * 100)} % · pide 3ª toma` : `Δ ${fmt(diff * 100)} % · ok`);
  }
  return parts.length ? <span className="font-display font-semibold tabular-nums">{parts.join(" · ")}</span> : null;
}

/** Un paso del modo cancha para un sitio de antropometría. */
export function anthroStep(id: string, who: string, key: AnthroSiteKey, raw: Raw, take: Take): FieldStep {
  const s = ANTHRO_SITES.find((x) => x.key === key)!;
  return {
    id,
    who,
    key,
    label: s.label.replace(/ \(.*\)$/, ""),
    unit: s.unit,
    sub: SINGLE_TAKE.includes(key) ? "Toma única" : `Toma ${take + 1}`,
    value: raw?.[take] ?? "",
    min: s.min,
    max: s.max,
    hint: takeHint(key, raw, take),
  };
}
