import { z } from "zod";

import {
  ANTHRO_SITES,
  anthroSiteKeys,
  needsThirdTake,
  type AnthroResults,
  type AnthroSiteKey,
  type AnthroTakes,
} from "../anthropometry.js";

/**
 * Sesión de antropometría ISAK (ADR 0030). Se guardan las TOMAS crudas; los
 * resultados se calculan al leer (`anthropometryResults`), nunca se guardan.
 */
const takesForSite = (key: AnthroSiteKey) => {
  const site = ANTHRO_SITES.find((s) => s.key === key)!;
  return z
    .array(z.number().finite().min(site.min, `${site.label}: fuera de rango.`).max(site.max, `${site.label}: fuera de rango.`))
    .min(1)
    .max(3);
};

const takesSchema = z
  .object(Object.fromEntries(anthroSiteKeys.map((k) => [k, takesForSite(k).optional()])) as Record<AnthroSiteKey, z.ZodOptional<z.ZodArray<z.ZodNumber>>>)
  .strict()
  .superRefine((takes, ctx) => {
    for (const k of anthroSiteKeys) {
      const t = takes[k];
      // La 3ª toma es obligatoria si las dos primeras difieren más de la tolerancia ISAK.
      if (t && t.length === 2 && needsThirdTake(k, t)) {
        const site = ANTHRO_SITES.find((s) => s.key === k)!;
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: `${site.label}: las tomas difieren, falta la tercera.` });
      }
    }
  });

export const saveAnthropometrySchema = z.object({
  measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  takes: takesSchema,
  note: z.string().trim().max(1000).nullish(),
});
export type SaveAnthropometryDto = z.infer<typeof saveAnthropometrySchema>;

export interface AnthropometrySessionDto {
  id: string;
  patientId: string;
  measuredAt: string;
  measuredByName: string | null;
  takes: AnthroTakes;
  /** Tiene el bloque de Kerr cargado. */
  kerrBlock: boolean;
  note: string | null;
  results: AnthroResults;
  /** Fórmulas aún sin validar por la nutricionista (beta). */
  validated: boolean;
  createdAt: string;
}

/**
 * Qué resultados de antropometría ve el deportista en el portal (mismo mecanismo
 * que la visibilidad clínica: ausente/false = oculto).
 */
export const anthroVisibilityFields = [
  "anthroSkinfolds",
  "anthroFat",
  "anthroKerr",
  "anthroSomatotype",
] as const;
export type AnthroVisibilityField = (typeof anthroVisibilityFields)[number];

/** Lo que llega al portal: sólo lo visible y sólo con fórmulas validadas. */
export interface PortalAnthropometryDto {
  measuredAt: string;
  sum6: number | null;
  sum8: number | null;
  fatPct: { durninWomersley: number | null; yuhasz: number | null; faulkner: number | null } | null;
  kerr: { muscleKg: number; adiposeKg: number; boneKg: number } | null;
  somatotype: { endo: number; meso: number; ecto: number } | null;
}
