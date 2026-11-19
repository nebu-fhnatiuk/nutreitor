import { z } from "zod";

/**
 * Plantilla de la nota de consulta asistida (KAN-94, épica KAN-91, ADR 0050).
 *
 * El asistente arma un BORRADOR a partir de la transcripción con esta estructura; el
 * profesional lo revisa, lo corrige y lo aprueba. Las secciones y sus textos se
 * validan en docs/validation/nota-de-consulta.md: cambiar una sección es editar
 * `CONSULTATION_NOTE_SECTIONS`, y de ahí salen la interfaz, el prompt del agente y el
 * JSON Schema que se le pasa al modelo.
 *
 * Reglas que el schema hace cumplir:
 *  - Una sección en `null` significa "no se habló en la consulta". El modelo no
 *    completa con supuestos.
 *  - Lo que el modelo no entendió o le resultó ambiguo va a `doubts`, para que el
 *    profesional lo resuelva antes de aprobar.
 *  - Las mediciones dictadas no se cargan desde acá: la sección de antropometría es
 *    un resumen en texto. Pasar valores a la ficha es otro flujo, con revisión campo
 *    por campo (KAN-96).
 */

export const consultationNoteKinds = ["initial", "follow_up"] as const;
export type ConsultationNoteKind = (typeof consultationNoteKinds)[number];
export const CONSULTATION_NOTE_KIND_LABEL: Record<ConsultationNoteKind, string> = {
  initial: "Primera consulta",
  follow_up: "Control",
};

export const consultationNoteSectionKeys = [
  "reasonForConsult",
  "clinicalHistory",
  "progressSinceLastVisit",
  "dietaryHistory",
  "habitsAndTraining",
  "anthropometry",
  "assessment",
  "goalsAndPlan",
  "supplementation",
  "nextSteps",
] as const;
export type ConsultationNoteSectionKey = (typeof consultationNoteSectionKeys)[number];

export interface ConsultationNoteSection {
  /** Título que ve el profesional. */
  label: string;
  /** Qué va en la sección. Se muestra como ayuda y forma parte del prompt. */
  guidance: string;
  /** Tipos de nota que la incluyen. */
  kinds: readonly ConsultationNoteKind[];
  maxLength: number;
}

const BOTH = consultationNoteKinds;

/** Orden de la nota = orden de este objeto. */
export const CONSULTATION_NOTE_SECTIONS: Record<ConsultationNoteSectionKey, ConsultationNoteSection> = {
  reasonForConsult: {
    label: "Motivo de consulta",
    guidance: "Por qué consulta, con sus palabras, y qué espera lograr.",
    kinds: ["initial"],
    maxLength: 1500,
  },
  clinicalHistory: {
    label: "Antecedentes, medicación y alergias",
    guidance:
      "Patologías, cirugías, medicación con dosis y horario, alergias e intolerancias, síntomas gastrointestinales, lesiones y, si corresponde, ciclo menstrual.",
    kinds: ["initial"],
    maxLength: 3000,
  },
  progressSinceLastVisit: {
    label: "Evolución desde el último control",
    guidance:
      "Adherencia al plan, qué funcionó y qué no, síntomas nuevos, cambios de medicación o de salud desde la consulta anterior.",
    kinds: ["follow_up"],
    maxLength: 3000,
  },
  dietaryHistory: {
    label: "Anamnesis alimentaria",
    guidance:
      "Comidas habituales, horarios, recordatorio de 24 horas si se hizo, preferencias, aversiones, alcohol e hidratación habitual.",
    kinds: BOTH,
    maxLength: 4000,
  },
  habitsAndTraining: {
    label: "Hábitos, sueño y entrenamiento",
    guidance:
      "Horas de sueño, actividad fuera del deporte, días y turnos de entrenamiento, momento de la temporada y competencias próximas.",
    kinds: BOTH,
    maxLength: 3000,
  },
  anthropometry: {
    label: "Antropometría",
    guidance:
      "Resumen de lo medido o dictado en la consulta y de los cambios respecto de la evaluación anterior. Los valores se cargan en la ficha por separado.",
    kinds: BOTH,
    maxLength: 2000,
  },
  assessment: {
    label: "Evaluación",
    guidance: "Lectura profesional de la situación, tal como la expresó el profesional en la consulta.",
    kinds: BOTH,
    maxLength: 3000,
  },
  goalsAndPlan: {
    label: "Objetivos y plan",
    guidance: "Objetivos acordados y cambios del plan alimentario: energía, macros, distribución y timing.",
    kinds: BOTH,
    maxLength: 4000,
  },
  supplementation: {
    label: "Suplementación",
    guidance: "Suplementos indicados, mantenidos o suspendidos, con dosis, momento y motivo.",
    kinds: BOTH,
    maxLength: 2000,
  },
  nextSteps: {
    label: "Próximos pasos",
    guidance: "Qué tiene que hacer el deportista y qué queda pendiente para el profesional antes del próximo control.",
    kinds: BOTH,
    maxLength: 2000,
  },
};

/** Secciones de un tipo de nota, en orden. */
export function consultationNoteSectionsFor(kind: ConsultationNoteKind): ConsultationNoteSectionKey[] {
  return consultationNoteSectionKeys.filter((k) => CONSULTATION_NOTE_SECTIONS[k].kinds.includes(kind));
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD).");
const MAX_DOUBTS = 20;
const MAX_DOUBT_LENGTH = 300;
const MAX_NEXT_CONTROL_LENGTH = 120;

function sectionsSchema(kind: ConsultationNoteKind) {
  const shape = Object.fromEntries(
    consultationNoteSectionsFor(kind).map((k) => [k, z.string().trim().min(1).max(CONSULTATION_NOTE_SECTIONS[k].maxLength).nullable()]),
  );
  return z.object(shape as Record<ConsultationNoteSectionKey, z.ZodNullable<z.ZodString>>).strict();
}

function noteSchemaFor<K extends ConsultationNoteKind>(kind: K) {
  return z
    .object({
      kind: z.literal(kind),
      sections: sectionsSchema(kind),
      nextControl: z
        .object({
          /** Solo si se dijo una fecha concreta. */
          date: isoDate.nullable(),
          /** Lo que se dijo, tal cual: "en tres semanas", "después del torneo". */
          text: z.string().trim().min(1).max(MAX_NEXT_CONTROL_LENGTH),
        })
        .strict()
        .nullable(),
      /** Lo que no se entendió o quedó ambiguo; el profesional lo resuelve antes de aprobar. */
      doubts: z.array(z.string().trim().min(1).max(MAX_DOUBT_LENGTH)).max(MAX_DOUBTS),
    })
    .strict()
    .refine((n) => Object.values(n.sections).some((v) => v !== null), "La nota no tiene ninguna sección con contenido.");
}

export const initialConsultationNoteSchema = noteSchemaFor("initial");
export const followUpConsultationNoteSchema = noteSchemaFor("follow_up");

/** Nota completa (borrador del asistente o versión editada por el profesional). */
export const consultationNoteSchema = z.union([initialConsultationNoteSchema, followUpConsultationNoteSchema]);
export type ConsultationNote = z.infer<typeof consultationNoteSchema>;

/**
 * JSON Schema (draft 2020-12) de la nota, para pedirle al modelo una salida
 * estructurada. Se arma desde `CONSULTATION_NOTE_SECTIONS` para que no se desincronice
 * del schema de Zod; la salida del modelo se valida igual con `consultationNoteSchema`.
 */
export function consultationNoteJsonSchema(kind: ConsultationNoteKind): Record<string, unknown> {
  const keys = consultationNoteSectionsFor(kind);
  const nullableString = (description: string, maxLength: number) => ({
    type: ["string", "null"],
    minLength: 1,
    maxLength,
    description,
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `Nota de consulta: ${CONSULTATION_NOTE_KIND_LABEL[kind]}`,
    type: "object",
    additionalProperties: false,
    required: ["kind", "sections", "nextControl", "doubts"],
    properties: {
      kind: { const: kind },
      sections: {
        type: "object",
        additionalProperties: false,
        required: keys,
        properties: Object.fromEntries(
          keys.map((k) => {
            const s = CONSULTATION_NOTE_SECTIONS[k];
            return [k, nullableString(`${s.label}. ${s.guidance} null si no se habló en la consulta.`, s.maxLength)];
          }),
        ),
      },
      nextControl: {
        description: "Próximo control, solo si se habló de él; si no, null.",
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["date", "text"],
            properties: {
              date: {
                type: ["string", "null"],
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                description: "Fecha AAAA-MM-DD solo si se dijo una fecha concreta.",
              },
              text: { type: "string", minLength: 1, maxLength: MAX_NEXT_CONTROL_LENGTH, description: "Lo que se dijo, tal cual." },
            },
          },
          { type: "null" },
        ],
      },
      doubts: {
        type: "array",
        maxItems: MAX_DOUBTS,
        description: "Lo que no se entendió o quedó ambiguo en la transcripción. Lista vacía si no hay.",
        items: { type: "string", minLength: 1, maxLength: MAX_DOUBT_LENGTH },
      },
    },
  };
}
