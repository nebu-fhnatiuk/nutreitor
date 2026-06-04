import {
  applyClinicalVisibility,
  clinicalFields,
  type PatientClinical,
} from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/**
 * Stripping de campos clínicos hacia el portal del paciente. Es el ÚNICO punto de
 * decisión (lo usa portal.getMe), así que el contrato se fija acá: default
 * conservador (nada visible) y passthrough sólo de lo explícitamente habilitado.
 */
const full: PatientClinical = {
  reasonForConsult: "baja de peso",
  medicalHistory: "HTA",
  allergies: "maní",
  currentMedication: "enalapril",
  diagnosedConditions: "prediabetes",
  familyHistory: "DBT2 materna",
};

describe("applyClinicalVisibility", () => {
  it("default conservador: visibility {} oculta TODOS los campos", () => {
    const out = applyClinicalVisibility(full, {});
    for (const f of clinicalFields) expect(out[f]).toBeNull();
  });

  it("sólo pasa los campos marcados true; el resto queda null", () => {
    const out = applyClinicalVisibility(full, {
      allergies: true,
      currentMedication: true,
    });
    expect(out.allergies).toBe("maní");
    expect(out.currentMedication).toBe("enalapril");
    expect(out.reasonForConsult).toBeNull();
    expect(out.medicalHistory).toBeNull();
    expect(out.diagnosedConditions).toBeNull();
    expect(out.familyHistory).toBeNull();
  });

  it("false explícito = oculto (no se filtra por valor truthy del flag)", () => {
    const out = applyClinicalVisibility(full, { allergies: false });
    expect(out.allergies).toBeNull();
  });

  it("no inventa claves fuera del set clínico ni muta la entrada", () => {
    const input = { ...full };
    const out = applyClinicalVisibility(input, { allergies: true });
    expect(Object.keys(out).sort()).toEqual([...clinicalFields].sort());
    expect(input).toEqual(full); // pura: no mutó
  });
});
