import {
  CONSULTATION_NOTE_SECTIONS,
  consultationNoteJsonSchema,
  consultationNoteKinds,
  consultationNoteSchema,
  consultationNoteSectionsFor,
  type ConsultationNoteKind,
} from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Plantilla de la nota de consulta asistida (KAN-94). Las secciones las valida la
 * nutricionista en docs/validation/nota-de-consulta.md; acá se cuida que el schema de
 * Zod (con el que se valida la salida del modelo) y el JSON Schema (el que se le pasa
 * al modelo) digan lo mismo.
 */
const emptySections = (kind: ConsultationNoteKind) =>
  Object.fromEntries(consultationNoteSectionsFor(kind).map((k) => [k, null]));

const control = {
  kind: "follow_up",
  sections: {
    ...emptySections("follow_up"),
    progressSinceLastVisit: "Cumplió el plan los días de doble turno; refiere cansancio en el segundo entrenamiento.",
    supplementation: "Mantiene creatina monohidrato 3 g/día.",
  },
  nextControl: { date: null, text: "en tres semanas" },
  doubts: ["No queda claro si la cafeína es 3 o 6 mg/kg."],
};

describe("secciones por tipo de nota", () => {
  it("la primera consulta tiene motivo y antecedentes; el control, evolución", () => {
    expect(consultationNoteSectionsFor("initial")).toEqual([
      "reasonForConsult",
      "clinicalHistory",
      "dietaryHistory",
      "habitsAndTraining",
      "anthropometry",
      "assessment",
      "goalsAndPlan",
      "supplementation",
      "nextSteps",
    ]);
    expect(consultationNoteSectionsFor("follow_up")).toEqual([
      "progressSinceLastVisit",
      "dietaryHistory",
      "habitsAndTraining",
      "anthropometry",
      "assessment",
      "goalsAndPlan",
      "supplementation",
      "nextSteps",
    ]);
  });
});

describe("consultationNoteSchema", () => {
  it("acepta un control con secciones sin hablar en null", () => {
    expect(consultationNoteSchema.parse(control)).toEqual(control);
  });

  it("rechaza una sección que no corresponde al tipo de nota", () => {
    const r = consultationNoteSchema.safeParse({ ...control, sections: { ...control.sections, reasonForConsult: "x" } });
    expect(r.success).toBe(false);
  });

  it("rechaza que falte una sección: no hablada es null, no ausente", () => {
    const { supplementation: _omit, ...rest } = control.sections;
    expect(consultationNoteSchema.safeParse({ ...control, sections: rest }).success).toBe(false);
  });

  it("rechaza una nota sin ninguna sección con contenido", () => {
    expect(consultationNoteSchema.safeParse({ ...control, sections: emptySections("follow_up") }).success).toBe(false);
  });

  it("rechaza texto vacío en vez de null y secciones más largas que el máximo", () => {
    expect(consultationNoteSchema.safeParse({ ...control, sections: { ...control.sections, assessment: "  " } }).success).toBe(false);
    const largo = "a".repeat(CONSULTATION_NOTE_SECTIONS.assessment.maxLength + 1);
    expect(consultationNoteSchema.safeParse({ ...control, sections: { ...control.sections, assessment: largo } }).success).toBe(false);
  });

  it("solo acepta fecha de control en formato AAAA-MM-DD", () => {
    const conFecha = (date: string) => ({ ...control, nextControl: { date, text: "el 12 de diciembre" } });
    expect(consultationNoteSchema.safeParse(conFecha("2026-12-12")).success).toBe(true);
    expect(consultationNoteSchema.safeParse(conFecha("12/12/2026")).success).toBe(false);
  });

  it("rechaza campos que no están en la plantilla", () => {
    expect(consultationNoteSchema.safeParse({ ...control, diagnosis: "x" }).success).toBe(false);
  });
});

describe("consultationNoteJsonSchema", () => {
  it.each(consultationNoteKinds)("%s: pide exactamente las secciones del schema de Zod", (kind) => {
    const schema = consultationNoteJsonSchema(kind) as {
      properties: { kind: { const: string }; sections: { required: string[]; properties: Record<string, { maxLength: number }> } };
    };
    const keys = consultationNoteSectionsFor(kind);
    expect(schema.properties.kind.const).toBe(kind);
    expect(schema.properties.sections.required).toEqual(keys);
    expect(Object.keys(schema.properties.sections.properties)).toEqual(keys);
    for (const k of keys) {
      expect(schema.properties.sections.properties[k]!.maxLength).toBe(CONSULTATION_NOTE_SECTIONS[k].maxLength);
    }
  });
});
