import { z } from "zod";

/**
 * Métricas de eficiencia del profesional (Fase 4.4). La admin ve a todo el equipo;
 * cada profesional, sólo lo suyo. Medianas (no promedios): un editor olvidado
 * abierto o una respuesta de un fin de semana no deforman el número.
 */
export const efficiencyQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(30),
  /** Sólo la fila propia (la admin que atiende mira lo suyo en "Hoy"). */
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type EfficiencyQueryDto = z.infer<typeof efficiencyQuerySchema>;

export interface ProfessionalEfficiencyDto {
  membershipId: string;
  name: string;
  activePatients: number;
  plans: {
    saved: number;
    /** Mediana de minutos de armado (versiones con dato). */
    medianMinutes: number | null;
    measured: number;
    bySource: { scratch: number; previous: number; template: number; nutri: number };
  };
  adherence: {
    /** % sobre lo registrado por sus pacientes (cumplí 1, en parte ½). */
    pct: number | null;
    logs: number;
  };
  replies: {
    /** Mediana de minutos entre un mensaje del paciente y su respuesta. */
    medianMinutes: number | null;
    answered: number;
    /** Mensajes de pacientes todavía sin responder. */
    pending: number;
  };
}

export interface EfficiencyDto {
  days: number;
  from: string;
  professionals: ProfessionalEfficiencyDto[];
}

/** "< 1 min", "12 min", "1 h 20 min", "2 d 3 h"; "—" sin dato. */
export function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 1) return "< 1 min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const h = Math.round(m / 60);
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}
