/**
 * Alérgenos estructurados (KAN-105), validados por la nutricionista en
 * docs/validation/alergenos.md. Dos listas que se cruzan:
 *
 *  - Marcas del ALIMENTO (`allergenKeys`): las del Código Alimentario Argentino
 *    (art. 235 séptimo), más sésamo (decisión clínica) y lactosa (no es alérgeno: la
 *    usa la regla de intolerancia).
 *  - Casillas de la FICHA (`allergyFlags`): alergia a cada alérgeno, celiaquía e
 *    intolerancia a la lactosa. `ALLERGY_FLAG_TAG` dice qué marca del alimento mira
 *    cada una.
 *
 * Criterio de curación: solo alérgenos propios del alimento genérico; lo que depende
 * de la marca y las trazas ("puede contener") no se marcan.
 */
import { z } from "zod";

export const allergenKeys = [
  "tacc",
  "leche",
  "huevo",
  "pescado",
  "crustaceos",
  "mani",
  "frutos_secos",
  "soja",
  "sulfitos",
  "sesamo",
  "lactosa",
] as const;
export type AllergenKey = (typeof allergenKeys)[number];

export const ALLERGEN_LABEL: Record<AllergenKey, string> = {
  tacc: "Gluten (TACC)",
  leche: "Leche",
  huevo: "Huevo",
  pescado: "Pescado",
  crustaceos: "Crustáceos",
  mani: "Maní",
  frutos_secos: "Frutos secos",
  soja: "Soja",
  sulfitos: "Sulfitos",
  sesamo: "Sésamo",
  lactosa: "Lactosa",
};

/** Marcas de un alimento, sin repetidos y en el orden de `allergenKeys`. */
export const allergensSchema = z
  .array(z.enum(allergenKeys))
  .max(allergenKeys.length)
  .transform((list) => allergenKeys.filter((k) => list.includes(k)));

/** Unión de las marcas de varios alimentos (una receta hereda las de sus ingredientes). */
export function mergeAllergens(lists: readonly (readonly AllergenKey[] | null | undefined)[]): AllergenKey[] {
  const set = new Set(lists.flatMap((l) => l ?? []));
  return allergenKeys.filter((k) => set.has(k));
}

/** Alérgenos que se pueden tildar como alergia en la ficha (todos menos lactosa). */
export const allergyAllergens = [
  "tacc",
  "leche",
  "huevo",
  "pescado",
  "crustaceos",
  "mani",
  "frutos_secos",
  "soja",
  "sulfitos",
  "sesamo",
] as const satisfies readonly Exclude<AllergenKey, "lactosa">[];

export const allergyFlags = [...allergyAllergens, "celiaquia", "intolerancia_lactosa"] as const;
export type AllergyFlag = (typeof allergyFlags)[number];

export const ALLERGY_FLAG_LABEL: Record<AllergyFlag, string> = {
  ...(Object.fromEntries(allergyAllergens.map((k) => [k, ALLERGEN_LABEL[k]])) as Record<
    (typeof allergyAllergens)[number],
    string
  >),
  celiaquia: "Celiaquía",
  intolerancia_lactosa: "Intolerancia a la lactosa",
};

/** Qué marca del alimento mira cada casilla de la ficha. Las de alergia se muestran bajo "Alergias". */
export const ALLERGY_FLAG_TAG: Record<AllergyFlag, AllergenKey> = {
  ...(Object.fromEntries(allergyAllergens.map((k) => [k, k])) as Record<(typeof allergyAllergens)[number], AllergenKey>),
  celiaquia: "tacc",
  intolerancia_lactosa: "lactosa",
};

/** Casillas de la ficha, sin repetidos y en orden. */
export const allergyFlagsSchema = z
  .array(z.enum(allergyFlags))
  .max(allergyFlags.length)
  .transform((list) => allergyFlags.filter((k) => list.includes(k)));
