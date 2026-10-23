import { z } from "zod";

/**
 * Reporte mensual del paciente (Fase 4.4). Se arma solo con los datos del mes; el
 * profesional agrega su comentario y lo publica al portal. Publicado, los números
 * quedan fijos. (Con Bedrock activo, NUTRI podrá redactar el borrador del comentario.)
 */
export const createReportSchema = z.object({
  /** "YYYY-MM" */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido (YYYY-MM)."),
});
export type CreateReportDto = z.infer<typeof createReportSchema>;

export const updateReportSchema = z.object({
  comment: z.string().trim().max(4000).nullable(),
});
export type UpdateReportDto = z.infer<typeof updateReportSchema>;

export type ReportStatus = "draft" | "published";

/** Cambio de una medida en el mes: primera y última medición. */
export interface ReportMeasureDto {
  start: number | null;
  end: number | null;
  delta: number | null;
}

export interface ReportDataDto {
  from: string;
  to: string;
  measurements: {
    count: number;
    weightKg: ReportMeasureDto;
    bodyFatPct: ReportMeasureDto;
    waistCm: ReportMeasureDto;
  };
  adherence: {
    pct: number | null;
    logs: number;
    /** Días del mes con al menos una comida registrada. */
    daysLogged: number;
    /** Días seguidos con registro, la racha más larga del mes (KAN-76). Falta en los
     *  reportes publicados antes: se leen como 0. */
    longestStreak?: number;
    byMeal: { meal: string; pct: number; logs: number }[];
  };
  checkins: { count: number; hunger: number | null; energy: number | null; mood: number | null };
  appointments: { completed: number; cancelled: number; booked: number };
  plan: { title: string | null; version: number | null; versionsInMonth: number };
}

export interface PatientReportDto {
  id: string;
  patientId: string;
  /** "YYYY-MM" */
  month: string;
  status: ReportStatus;
  data: ReportDataDto;
  comment: string | null;
  authorName: string;
  updatedAt: string;
  publishedAt: string | null;
}

/** "septiembre de 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

/** Primer y último día (YYYY-MM-DD) de un "YYYY-MM". */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Delta redondeado a 1 decimal (null si falta alguna punta). */
export function measureChange(start: number | null, end: number | null): ReportMeasureDto {
  return {
    start,
    end,
    delta: start != null && end != null ? Math.round((end - start) * 10) / 10 : null,
  };
}
