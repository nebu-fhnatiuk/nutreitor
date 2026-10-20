import type { Calc } from "@nutreitor/shared";

/** Formato compartido de antropometría (ficha individual y planilla del plantel). */

export const val = <T,>(c: Calc<T>): T | null => (c.ok ? c.value : null);

/** "1 de octubre de 2026". La fecha de medición es un día, sin hora: se arma local
 * (con `new Date("2026-10-01")` sería medianoche UTC y en Argentina mostraría el 30). */
export function fmtMeasured(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

export const fmt = (n: number | null, d = 1) =>
  n === null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Número tipeado con coma o punto; vacío o inválido → null. */
export const parseDecimal = (s: string): number | null => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
