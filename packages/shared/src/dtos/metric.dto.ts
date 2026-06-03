import { z } from "zod";

/** Métricas comunes (columnas wide). El resto va en `extra` (clave→número). */
const weight = z.number().min(1).max(999.99);
const pct = z.number().min(0).max(100);
const cm = z.number().min(1).max(300);

const coreMetrics = {
  weightKg: weight.nullish(),
  bodyFatPct: pct.nullish(),
  muscleMassKg: weight.nullish(),
  waistCm: cm.nullish(),
  hipCm: cm.nullish(),
  // Medidas ad-hoc: número finito (sin NaN/Infinity) y cota de cantidad de claves
  // para no inflar el JSONB.
  extra: z
    .record(z.string().min(1).max(60), z.number().finite())
    .refine((o) => Object.keys(o).length <= 20, "Demasiadas métricas extra (máx 20).")
    .optional(),
  note: z.string().max(500).nullish(),
};

/** Al menos una métrica presente (una medición sin valores no aporta). */
function hasSomeValue(v: {
  weightKg?: number | null;
  bodyFatPct?: number | null;
  muscleMassKg?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  extra?: Record<string, number>;
}): boolean {
  return (
    v.weightKg != null ||
    v.bodyFatPct != null ||
    v.muscleMassKg != null ||
    v.waistCm != null ||
    v.hipCm != null ||
    (v.extra != null && Object.keys(v.extra).length > 0)
  );
}

/** Alta de medición: fecha (YYYY-MM-DD) + al menos una métrica. */
export const recordMetricSchema = z
  .object({
    measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD"),
    ...coreMetrics,
  })
  .refine(hasSomeValue, { message: "Cargá al menos una métrica." });
export type RecordMetricDto = z.infer<typeof recordMetricSchema>;

/** Edición de una medición (todos los campos opcionales). */
export const updateMetricSchema = z.object({
  measuredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha esperada YYYY-MM-DD")
    .optional(),
  ...coreMetrics,
});
export type UpdateMetricDto = z.infer<typeof updateMetricSchema>;

export interface PatientMetricDto {
  id: string;
  measuredAt: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  waistCm: number | null;
  hipCm: number | null;
  extra: Record<string, number>;
  note: string | null;
  recordedByMembershipId: string;
  recordedByName: string;
  /** Rol del autor: 'patient' ⇒ auto-reportado por el paciente desde su portal. */
  recordedByRole: "admin" | "professional" | "patient";
  createdAt: string;
  updatedAt: string;
}
