import { z } from "zod";

import { saveFoodFrequencySchema } from "./food-frequency.dto.js";
import { activityLevels, type ActivityLevel } from "./patient.dto.js";

/**
 * Formularios previos a la consulta (KAN-60, ADR 0045). El profesional pide la
 * anamnesis o la frecuencia de consumo, el deportista la completa en el portal y el
 * profesional elige campo por campo qué pasa a la ficha (queda como autorreportado).
 * La lista de preguntas se valida en docs/validation/anamnesis.md.
 */
export const intakeKinds = ["anamnesis", "food_frequency"] as const;
export type IntakeKind = (typeof intakeKinds)[number];
export const INTAKE_KIND_LABEL: Record<IntakeKind, string> = {
  anamnesis: "Anamnesis",
  food_frequency: "Frecuencia de consumo",
};

export const intakeStatuses = ["requested", "submitted", "reviewed", "cancelled"] as const;
export type IntakeStatus = (typeof intakeStatuses)[number];
export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  requested: "Pedido",
  submitted: "Para revisar",
  reviewed: "Revisado",
  cancelled: "Cancelado",
};

// ── Perfil deportivo (nuevo en la ficha) ─────────────────────────────────────

export const competitionLevels = ["recreational", "amateur", "semi_pro", "pro"] as const;
export type CompetitionLevel = (typeof competitionLevels)[number];
export const COMPETITION_LEVEL_LABEL: Record<CompetitionLevel, string> = {
  recreational: "Recreativo (sin competencia)",
  amateur: "Amateur o liga",
  semi_pro: "Semiprofesional",
  pro: "Profesional",
};

export const sportProfileSchema = z.object({
  sport: z.string().trim().max(60).nullish(),
  position: z.string().trim().max(60).nullish(),
  trainingDaysPerWeek: z.number().int().min(0).max(7).nullish(),
  trainingHoursPerWeek: z.number().min(0).max(60).nullish(),
  competitionLevel: z.enum(competitionLevels).nullish(),
  injuries: z.string().trim().max(1000).nullish(),
  supplements: z.string().trim().max(1000).nullish(),
  sleepHours: z.number().min(3).max(14).nullish(),
  mealsPerDay: z.number().int().min(1).max(10).nullish(),
});
export type SportProfile = z.infer<typeof sportProfileSchema>;
export type SportProfileKey = keyof SportProfile;

// ── Anamnesis: campos de la ficha + perfil deportivo ─────────────────────────

/** Campos de la ficha (columnas de `patients`) que pregunta la anamnesis. */
export const anamnesisFichaKeys = [
  "reasonForConsult",
  "goal",
  "medicalHistory",
  "diagnosedConditions",
  "allergies",
  "currentMedication",
  "familyHistory",
  "activityLevel",
  "dietaryPreferences",
] as const;
export type AnamnesisFichaKey = (typeof anamnesisFichaKeys)[number];

export const sportProfileKeys = [
  "sport",
  "position",
  "trainingDaysPerWeek",
  "trainingHoursPerWeek",
  "competitionLevel",
  "injuries",
  "supplements",
  "sleepHours",
  "mealsPerDay",
] as const satisfies readonly SportProfileKey[];

export const anamnesisKeys = [...anamnesisFichaKeys, ...sportProfileKeys] as const;
export type AnamnesisKey = (typeof anamnesisKeys)[number];

/** Campos de la ficha con datos clínicos (sólo los ve quien tiene `patient:read_clinical`). */
export const clinicalAnamnesisKeys: readonly AnamnesisKey[] = [
  "reasonForConsult",
  "medicalHistory",
  "diagnosedConditions",
  "allergies",
  "currentMedication",
  "familyHistory",
];

type FieldKind = "text" | "longtext" | "int" | "number" | "activity" | "competition";

/** Pregunta tal como la ve el deportista, y su rótulo en la ficha. */
export const ANAMNESIS_FIELDS: Record<
  AnamnesisKey,
  { label: string; question: string; help?: string; kind: FieldKind; section: "salud" | "deporte" | "habitos"; unit?: string; min?: number; max?: number }
> = {
  reasonForConsult: { label: "Motivo de consulta", question: "¿Por qué venís a la consulta?", kind: "longtext", section: "salud" },
  goal: { label: "Objetivo", question: "¿Qué te gustaría lograr?", help: "Ej.: bajar grasa sin perder rendimiento, ganar masa muscular.", kind: "text", section: "salud" },
  medicalHistory: { label: "Antecedentes", question: "¿Tuviste enfermedades, cirugías o internaciones?", kind: "longtext", section: "salud" },
  diagnosedConditions: { label: "Patologías diagnosticadas", question: "¿Tenés alguna enfermedad diagnosticada hoy?", help: "Ej.: diabetes, celiaquía, hipotiroidismo, anemia.", kind: "longtext", section: "salud" },
  allergies: { label: "Alergias e intolerancias", question: "¿Tenés alergias o intolerancias a algún alimento?", kind: "text", section: "salud" },
  currentMedication: { label: "Medicación", question: "¿Tomás alguna medicación?", help: "Nombre y para qué.", kind: "text", section: "salud" },
  familyHistory: { label: "Antecedentes familiares", question: "¿Hay enfermedades en tu familia directa?", help: "Ej.: diabetes, colesterol alto, enfermedad cardíaca.", kind: "longtext", section: "salud" },
  sport: { label: "Deporte", question: "¿Qué deporte practicás?", kind: "text", section: "deporte" },
  position: { label: "Posición o especialidad", question: "¿En qué posición o especialidad?", help: "Ej.: delantero, arquera, 100 m llanos.", kind: "text", section: "deporte" },
  trainingDaysPerWeek: { label: "Días de entrenamiento", question: "¿Cuántos días por semana entrenás?", kind: "int", unit: "días", min: 0, max: 7, section: "deporte" },
  trainingHoursPerWeek: { label: "Horas de entrenamiento", question: "¿Cuántas horas por semana, en total?", help: "Contando campo y gimnasio.", kind: "number", unit: "h/semana", min: 0, max: 60, section: "deporte" },
  competitionLevel: { label: "Nivel de competencia", question: "¿En qué nivel competís?", kind: "competition", section: "deporte" },
  activityLevel: { label: "Nivel de actividad", question: "Fuera del deporte, ¿qué tan activo sos en el día?", kind: "activity", section: "deporte" },
  injuries: { label: "Lesiones", question: "¿Tenés o tuviste lesiones en el último año?", help: "Cuál y si te sigue molestando.", kind: "longtext", section: "deporte" },
  supplements: { label: "Suplementos", question: "¿Tomás suplementos?", help: "Ej.: proteína, creatina, cafeína, multivitamínico. Cuál y cuánto.", kind: "longtext", section: "habitos" },
  dietaryPreferences: { label: "Preferencias alimentarias", question: "¿Hay alimentos que no comés o preferís?", help: "Ej.: vegetariano, no me gusta el pescado.", kind: "longtext", section: "habitos" },
  mealsPerDay: { label: "Comidas por día", question: "¿Cuántas comidas hacés por día?", kind: "int", unit: "comidas", min: 1, max: 10, section: "habitos" },
  sleepHours: { label: "Horas de sueño", question: "¿Cuántas horas dormís por noche?", kind: "number", unit: "h", min: 3, max: 14, section: "habitos" },
};

export const ACTIVITY_LEVEL_LABEL: Record<ActivityLevel, string> = {
  sedentary: "Sedentario (casi todo el día sentado)",
  light: "Poco activo",
  moderate: "Moderado",
  active: "Activo",
  very_active: "Muy activo (trabajo físico)",
};

const text = (max: number) => z.string().trim().max(max).nullish();

export const anamnesisAnswersSchema = z
  .object({
    reasonForConsult: text(4000),
    goal: text(200),
    medicalHistory: text(8000),
    diagnosedConditions: text(4000),
    allergies: text(4000),
    currentMedication: text(4000),
    familyHistory: text(4000),
    activityLevel: z.enum(activityLevels).nullish(),
    dietaryPreferences: text(2000),
    ...sportProfileSchema.shape,
  })
  .strict()
  .refine((a) => Object.values(a).some((v) => v !== null && v !== undefined && v !== ""), "Respondé al menos una pregunta.");
export type AnamnesisAnswers = z.infer<typeof anamnesisAnswersSchema>;

// ── Pedidos y respuestas ─────────────────────────────────────────────────────

export const requestIntakeSchema = z.object({
  kind: z.enum(intakeKinds),
  message: z.string().trim().max(500).nullish(),
});
export type RequestIntakeDto = z.infer<typeof requestIntakeSchema>;

export const submitAnamnesisSchema = z.object({ answers: anamnesisAnswersSchema });
export const submitFoodFrequencySchema = z.object({ answers: saveFoodFrequencySchema.shape.answers });

/**
 * Revisión: qué campos de la anamnesis pasan a la ficha (vacío = ninguno, se archiva
 * igual). En la frecuencia de consumo, `accept` la guarda como encuesta autorreportada.
 */
export const reviewIntakeSchema = z.object({
  fields: z.array(z.enum(anamnesisKeys)).max(anamnesisKeys.length).default([]),
  accept: z.boolean().default(false),
});
export type ReviewIntakeDto = z.infer<typeof reviewIntakeSchema>;

/** Origen de un dato de la ficha que vino del deportista. */
export interface FieldSource {
  source: "self_reported";
  requestId: string;
  reviewedBy: string;
  at: string;
}
export type FieldSources = Partial<Record<AnamnesisKey, FieldSource>>;

export interface IntakeRequestDto {
  id: string;
  patientId: string;
  kind: IntakeKind;
  status: IntakeStatus;
  message: string | null;
  /** Respuestas tal como las mandó (null hasta que las mande). */
  answers: Record<string, unknown> | null;
  requestedByName: string;
  createdAt: string;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** Campos que pasaron a la ficha (anamnesis) o id de la encuesta creada (FFQ). */
  applied: { fields?: AnamnesisKey[]; surveyId?: string } | null;
}

/** Lo que ve el deportista en su portal. */
export interface PortalIntakeDto {
  id: string;
  kind: IntakeKind;
  status: IntakeStatus;
  message: string | null;
  requestedByName: string;
  createdAt: string;
}
