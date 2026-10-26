import {
  ACTIVITY_LEVEL_LABEL,
  ANAMNESIS_FIELDS,
  COMPETITION_LEVEL_LABEL,
  type ActivityLevel,
  type AnamnesisKey,
  type CompetitionLevel,
  type FieldSource,
} from "@nutreitor/shared";

/** Valor de una respuesta de la anamnesis como texto para leer (null si está vacía). */
export function anamnesisValue(key: AnamnesisKey, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const f = ANAMNESIS_FIELDS[key];
  if (f.kind === "activity") return ACTIVITY_LEVEL_LABEL[value as ActivityLevel] ?? String(value);
  if (f.kind === "competition") return COMPETITION_LEVEL_LABEL[value as CompetitionLevel] ?? String(value);
  if (f.unit) return `${String(value).replace(".", ",")} ${f.unit}`;
  return String(value);
}

/** "autorreportado · revisado por X el 26/10" */
export function sourceLabel(s: FieldSource): string {
  const at = new Date(s.at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  return `autorreportado · revisó ${s.reviewedBy} el ${at}`;
}
