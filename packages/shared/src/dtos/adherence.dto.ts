import { z } from "zod";

/**
 * Adherencia (Fase 4.3): el paciente marca cada comida del plan (cumplí / en parte /
 * no) y, una vez por día, cómo se sintió. El profesional asignado lo ve en la
 * evolución. Fechas como "YYYY-MM-DD" en la hora local del paciente.
 */
export const adherenceStatuses = ["done", "partial", "skipped"] as const;
export type AdherenceStatus = (typeof adherenceStatuses)[number];

export const adherenceStatusLabels: Record<AdherenceStatus, string> = {
  done: "Cumplí",
  partial: "En parte",
  skipped: "No",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const scale = z.number().int().min(1).max(5).nullable().optional();

export const logMealSchema = z.object({
  date: isoDate,
  mealName: z.string().trim().min(1).max(120),
  status: z.enum(adherenceStatuses),
  note: z.string().trim().max(300).nullable().optional(),
});
export type LogMealDto = z.infer<typeof logMealSchema>;

export const checkinSchema = z.object({
  date: isoDate,
  hunger: scale,
  energy: scale,
  mood: scale,
  note: z.string().trim().max(500).nullable().optional(),
});
export type CheckinDto = z.infer<typeof checkinSchema>;

/** Rango a consultar (máx. 62 días). */
export const adherenceRangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to && daysBetween(r.from, r.to) <= 62, "Rango inválido (máx. 62 días).");
export type AdherenceRangeDto = z.infer<typeof adherenceRangeSchema>;

export interface MealLogDto {
  date: string;
  mealName: string;
  status: AdherenceStatus;
  note: string | null;
}
export interface CheckinRecordDto {
  date: string;
  hunger: number | null;
  energy: number | null;
  mood: number | null;
  note: string | null;
}
export interface AdherenceDto {
  logs: MealLogDto[];
  checkins: CheckinRecordDto[];
}

/** Días entre dos fechas ISO (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Fecha ISO local (YYYY-MM-DD) de un Date, opcionalmente corrida `offset` días. */
export function isoDay(d: Date, offset = 0): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/**
 * Días hacia atrás que el paciente puede registrar (hoy incluido). El servidor
 * suma un día de tolerancia a cada lado por la zona horaria del paciente.
 */
export const ADHERENCE_BACKFILL_DAYS = 3;

export function isLoggableDate(date: string, todayUtc: string): boolean {
  const diff = daysBetween(date, todayUtc);
  return diff >= -1 && diff <= ADHERENCE_BACKFILL_DAYS + 1;
}

/**
 * Puntaje de adherencia sobre lo REGISTRADO: cumplí = 1, en parte = ½, no = 0.
 * Null sin registros (no es 0 %: no sabemos).
 */
export function adherenceScore(logs: Pick<MealLogDto, "status">[]): {
  done: number;
  partial: number;
  skipped: number;
  pct: number | null;
} {
  const done = logs.filter((l) => l.status === "done").length;
  const partial = logs.filter((l) => l.status === "partial").length;
  const skipped = logs.length - done - partial;
  return {
    done,
    partial,
    skipped,
    pct: logs.length ? Math.round(((done + partial / 2) / logs.length) * 100) : null,
  };
}

/** Recordatorio diario de registro (opt-in del paciente; lo manda el worker). */
export const notificationPreferencesSchema = z.object({
  adherenceReminder: z.boolean(),
  /** Hora local (0–23) a partir de la cual se recuerda si no marcó nada en el día. */
  adherenceReminderHour: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64).refine(isValidTimeZone, "Zona horaria inválida."),
});
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesDto = {
  adherenceReminder: false,
  adherenceReminderHour: 21,
  timezone: "America/Argentina/Buenos_Aires",
};

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
