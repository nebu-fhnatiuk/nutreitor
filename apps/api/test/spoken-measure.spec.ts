import { ANTHRO_SITES, parseSpokenMeasure, parseSpokenNumber } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Dictado del modo cancha (KAN-74): números en español y sitios ISAK. */
describe("números dictados", () => {
  it.each([
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["doce coma cinco", 12.5],
    ["12 coma 5", 12.5],
    ["doce coma veinticinco", 12.25],
    ["coma cero cinco", null],
    ["cero coma cero cinco", 0.05],
    ["setenta y cuatro con dos", 74.2],
    ["siete y medio", 7.5],
    ["ciento setenta y ocho coma cuatro", 178.4],
    ["veintidós", 22],
    ["mil doscientos", 1200],
    ["quinientos ml", 500],
    ["8,4 mm", 8.4],
    ["hola", null],
    ["", null],
  ])("%s → %s", (text, expected) => {
    expect(parseSpokenNumber(text)).toBe(expected);
  });
});

describe("sitio + valor", () => {
  const sites = ANTHRO_SITES.map((s) => ({ key: s.key, label: s.label }));

  it("nombre completo, sin tildes y con mayúsculas", () => {
    expect(parseSpokenMeasure("Tríceps doce coma cinco", sites)).toMatchObject({ key: "triceps", value: 12.5 });
    expect(parseSpokenMeasure("subescapular 9", sites)).toMatchObject({ key: "subscapular", value: 9 });
    expect(parseSpokenMeasure("cresta iliaca once", sites)).toMatchObject({ key: "iliacCrest", value: 11 });
  });

  it("sin lo que va entre paréntesis y por primera palabra si no es ambigua", () => {
    expect(parseSpokenMeasure("cintura setenta y ocho", sites)).toMatchObject({ key: "waist", value: 78 });
    expect(parseSpokenMeasure("húmero siete", sites)).toMatchObject({ key: "humerus", value: 7 });
    expect(parseSpokenMeasure("masa setenta y cuatro con dos", sites)).toMatchObject({ key: "bodyMass", value: 74.2 });
  });

  it("palabra ambigua: gana el nombre más largo; sola no elige", () => {
    // "pantorrilla" es pliegue (medial) y perímetro (máxima).
    expect(parseSpokenMeasure("pantorrilla medial seis", sites)).toMatchObject({ key: "medialCalf", value: 6 });
    expect(parseSpokenMeasure("pantorrilla seis", sites).key).toBe("calf"); // "Pantorrilla (máxima)" → "pantorrilla"
    expect(parseSpokenMeasure("muslo frontal diez coma cinco", sites)).toMatchObject({ key: "frontThigh", value: 10.5 });
  });

  it("sólo el número: sin sitio, el valor va al sitio actual", () => {
    expect(parseSpokenMeasure("doce coma cinco", sites)).toMatchObject({ key: null, value: 12.5 });
  });

  it("alias propios (hidratación)", () => {
    const hydro = [
      { key: "pre", label: "Peso antes", aliases: ["antes"] },
      { key: "post", label: "Peso después", aliases: ["despues"] },
      { key: "fluid", label: "Líquido tomado", aliases: ["tomo", "bebio"] },
    ];
    expect(parseSpokenMeasure("peso después setenta y dos coma cinco", hydro)).toMatchObject({ key: "post", value: 72.5 });
    expect(parseSpokenMeasure("tomó setecientos cincuenta", hydro)).toMatchObject({ key: "fluid", value: 750 });
  });
});
