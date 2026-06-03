import { describe, expect, it } from "vitest";

import {
  hasPublicRosterContent,
  toPublicProfessional,
  toRosterEntry,
  type ProfileLike,
} from "../src/modules/public/public-serializer.js";

function profile(overrides: Partial<ProfileLike> = {}): ProfileLike {
  return {
    profileSlug: "ana",
    isPubliclyListed: true,
    specialty: null,
    headline: null,
    bio: null,
    photoUrl: null,
    credentials: null,
    specialties: [],
    services: [],
    visibility: {},
    ...overrides,
  };
}

describe("public-serializer — visibilidad por campo", () => {
  it("toPublicProfessional sólo expone campos marcados visibles", () => {
    const p = profile({
      headline: "Nutrición deportiva",
      bio: "secreta",
      credentials: "MN 1234",
      specialties: ["Deporte"],
      visibility: { headline: true }, // bio/credentials/specialties privados
    });
    const out = toPublicProfessional(p, "Ana Gómez");
    expect(out.headline).toBe("Nutrición deportiva");
    expect(out.bio).toBeNull();
    expect(out.credentials).toBeNull();
    expect(out.specialties).toEqual([]);
  });

  it("default privado: sin visibility, nada se expone (salvo nombre/slug)", () => {
    const out = toPublicProfessional(
      profile({ headline: "x", bio: "y", credentials: "z" }),
      "Ana",
    );
    expect(out.headline).toBeNull();
    expect(out.bio).toBeNull();
    expect(out.credentials).toBeNull();
    expect(out.fullName).toBe("Ana");
  });
});

describe("public-serializer — regla de roster (Ajuste 1)", () => {
  it("listado=true + sin contenido público → NO aparece en el roster", () => {
    expect(toRosterEntry(profile({ isPubliclyListed: true }), "Ana")).toBeNull();
    expect(hasPublicRosterContent(profile())).toBe(false);
  });

  it("listado=true + headline público no vacío → aparece", () => {
    const p = profile({ headline: "Nutrición clínica", visibility: { headline: true } });
    expect(hasPublicRosterContent(p)).toBe(true);
    const entry = toRosterEntry(p, "Ana");
    expect(entry?.headline).toBe("Nutrición clínica");
  });

  it("headline marcado público pero vacío → NO cuenta como contenido", () => {
    const p = profile({ headline: "   ", visibility: { headline: true } });
    expect(toRosterEntry(p, "Ana")).toBeNull();
  });

  it("no listado → NO aparece aunque tenga contenido público", () => {
    const p = profile({
      isPubliclyListed: false,
      bio: "Hola",
      visibility: { bio: true },
    });
    expect(toRosterEntry(p, "Ana")).toBeNull();
  });
});
