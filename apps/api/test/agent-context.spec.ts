import { describe, expect, it } from "vitest";

import { signAgentContext, verifyAgentContext } from "../src/core/security/agent-context.js";

/**
 * Contexto firmado gateway → servicio de agentes. Es la barrera que reemplaza al
 * ALS in-process cuando el agente corre en otro proceso: sin firma válida y vigente,
 * no hay contexto de tenant (fail-closed).
 */
const SECRET = "agents-dev-secret";
const NOW = 1_800_000_000_000;
const base = {
  tenantId: "00000000-0000-0000-0000-0000000000de",
  region: "us-east-1",
  userId: "00000000-0000-0000-0000-0000000000f2",
  role: "professional" as const,
};

describe("agent-context (HMAC + TTL)", () => {
  it("round-trip: firma y verifica devuelve el contexto", () => {
    const token = signAgentContext(base, SECRET, 60_000, NOW);
    const ctx = verifyAgentContext(token, SECRET, NOW + 1_000);
    expect(ctx).toMatchObject({ ...base, exp: NOW + 60_000 });
  });

  it("token adulterado → null", () => {
    const token = signAgentContext(base, SECRET, 60_000, NOW);
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(verifyAgentContext(tampered, SECRET, NOW)).toBeNull();
  });

  it("payload modificado (otra org) invalida la firma → null", () => {
    const token = signAgentContext(base, SECRET, 60_000, NOW);
    const [, sig] = token.split(".");
    const fakeBody = Buffer.from(
      JSON.stringify({ ...base, tenantId: "ffffffff-ffff-ffff-ffff-ffffffffffff", exp: NOW + 60_000 }),
    ).toString("base64url");
    expect(verifyAgentContext(`${fakeBody}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("secreto distinto → null", () => {
    const token = signAgentContext(base, SECRET, 60_000, NOW);
    expect(verifyAgentContext(token, "otro-secreto", NOW)).toBeNull();
  });

  it("expirado (exp < now) → null", () => {
    const token = signAgentContext(base, SECRET, 60_000, NOW);
    expect(verifyAgentContext(token, SECRET, NOW + 61_000)).toBeNull();
  });

  it("forma inválida → null", () => {
    expect(verifyAgentContext("sin-punto", SECRET, NOW)).toBeNull();
    expect(verifyAgentContext(".x", SECRET, NOW)).toBeNull();
  });
});
