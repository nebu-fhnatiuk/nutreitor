import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Capability, MembershipRole } from "@nutreitor/shared";
import { describe, expect, it } from "vitest";

import { CapabilityGuard } from "../src/core/auth/capability.guard.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";

/**
 * Verifica la autorización por capacidad (enforcement real del guard): el rol del
 * ALS se evalúa contra el mapa rol→capacidades.
 */
function evaluate(role: MembershipRole | null, required: Capability[]): boolean {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  const guard = new CapabilityGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  const run = () => guard.canActivate(ctx);
  if (role === null) return run(); // sin sesión (sólo válido si no hay required)

  return tenantStorage.run(
    {
      user: { id: "u1", role },
      org: { id: "o1", name: "Org", slug: "org", region: "us-east-1", status: "active", kind: "team" },
      context: { tenantId: "o1", orgId: "o1", region: "us-east-1" },
    },
    run,
  );
}

describe("CapabilityGuard", () => {
  it("admin tiene member:invite", () => {
    expect(evaluate("admin", ["member:invite"])).toBe(true);
  });

  it("professional NO tiene member:invite → Forbidden", () => {
    expect(() => evaluate("professional", ["member:invite"])).toThrow(
      ForbiddenException,
    );
  });

  it("professional tiene patient:read", () => {
    expect(evaluate("professional", ["patient:read"])).toBe(true);
  });

  it("patient NO tiene patient:read_clinical → Forbidden", () => {
    expect(() => evaluate("patient", ["patient:read_clinical"])).toThrow(
      ForbiddenException,
    );
  });

  it("sin @RequireCapability (lista vacía) no restringe", () => {
    expect(evaluate(null, [])).toBe(true);
  });
});
