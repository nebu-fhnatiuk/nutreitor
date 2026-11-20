import {
  ALLERGY_FLAG_TAG,
  allergensSchema,
  allergyFlags,
  allergyFlagsSchema,
  foodRefFor,
  mergeAllergens,
  type FoodDto,
} from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

/** Alérgenos estructurados (KAN-105): lógica pura de shared. */
describe("listas validadas", () => {
  it("cada casilla de la ficha mira una marca del alimento", () => {
    for (const f of allergyFlags) expect(ALLERGY_FLAG_TAG[f]).toBeTruthy();
    expect(ALLERGY_FLAG_TAG.celiaquia).toBe("tacc");
    expect(ALLERGY_FLAG_TAG.intolerancia_lactosa).toBe("lactosa");
    expect(ALLERGY_FLAG_TAG.sesamo).toBe("sesamo");
  });

  it("la lactosa no es una alergia: no se puede tildar como tal", () => {
    expect(allergyFlagsSchema.safeParse(["lactosa"]).success).toBe(false);
    expect(allergyFlagsSchema.parse(["intolerancia_lactosa"])).toEqual(["intolerancia_lactosa"]);
  });
});

describe("schemas", () => {
  it("normalizan: sin repetidos y en el orden de la lista", () => {
    expect(allergensSchema.parse(["lactosa", "tacc", "lactosa"])).toEqual(["tacc", "lactosa"]);
    expect(allergyFlagsSchema.parse(["celiaquia", "mani"])).toEqual(["mani", "celiaquia"]);
  });

  it("rechazan claves desconocidas", () => {
    expect(allergensSchema.safeParse(["gato"]).success).toBe(false);
  });
});

describe("mergeAllergens", () => {
  it("une las marcas de los ingredientes e ignora los que no tienen dato", () => {
    expect(mergeAllergens([["leche", "lactosa"], null, ["tacc"], undefined, ["leche"]])).toEqual(["tacc", "leche", "lactosa"]);
  });
});

describe("foodRefFor", () => {
  it("copia los alérgenos al vincular el alimento al plan, como los nutrientes", () => {
    const food: FoodDto = {
      id: "00000000-0000-4000-8000-000000000001",
      source: "catalog",
      name: "Leche entera",
      group: "Lácteos",
      per100g: { energyKcal: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, fiberG: null, sugarsG: null, satFatG: null, sodiumMg: null },
      portions: [],
      extra: {},
      allergens: ["leche", "lactosa"],
      attribution: null,
      archived: false,
    };
    expect(foodRefFor(food, 200).allergens).toEqual(["leche", "lactosa"]);
  });
});
