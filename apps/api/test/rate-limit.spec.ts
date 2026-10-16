import { HttpException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { clientIp } from "../src/core/rate-limit/client-ip.js";
import { RateLimitGuard, subjectFor } from "../src/core/rate-limit/rate-limit.guard.js";
import type { RateLimitService } from "../src/core/rate-limit/rate-limit.service.js";
import {
  checkRateLimit,
  type CounterStore,
  type RateLimitRule,
} from "../src/core/rate-limit/rate-limiter.js";

/** Store en memoria con la misma semántica que Redis (INCR por clave). */
class MemoryStore implements CounterStore {
  readonly counts = new Map<string, number>();
  async hit(key: string): Promise<number> {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }
}

const RULE: RateLimitRule = { name: "t", limit: 3, windowSec: 60, by: "ip" };
const T0 = Date.UTC(2026, 0, 1, 12, 0, 10); // 10 s dentro de una ventana de 60 s

function req(headers: Record<string, string>, body?: unknown, remote = "10.0.0.9"): Request {
  return { headers, body, socket: { remoteAddress: remote } } as unknown as Request;
}

describe("checkRateLimit (ventana fija)", () => {
  it("deja pasar hasta `limit` y corta el siguiente, con Retry-After al fin de la ventana", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(store, RULE, "1.1.1.1", T0)).ok).toBe(true);
    }
    const v = await checkRateLimit(store, RULE, "1.1.1.1", T0);
    expect(v.ok).toBe(false);
    expect(v.retryAfterSec).toBe(50);
  });

  it("cada sujeto tiene su propio contador", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await checkRateLimit(store, RULE, "1.1.1.1", T0);
    expect((await checkRateLimit(store, RULE, "2.2.2.2", T0)).ok).toBe(true);
  });

  it("la ventana siguiente arranca de cero", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 4; i++) await checkRateLimit(store, RULE, "1.1.1.1", T0);
    expect((await checkRateLimit(store, RULE, "1.1.1.1", T0 + 60_000)).ok).toBe(true);
  });

  it("el sujeto no queda legible en la clave (PII)", async () => {
    const store = new MemoryStore();
    await checkRateLimit(store, RULE, "ana@example.com", T0);
    const [key] = store.counts.keys();
    expect(key).not.toContain("ana");
    expect(key).toMatch(/^rl:t:/);
  });
});

describe("clientIp", () => {
  it("usa x-client-ip del edge si es una IP válida", () => {
    expect(clientIp(req({ "x-client-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("ignora un x-client-ip que no es IP y cae al socket", () => {
    expect(clientIp(req({ "x-client-ip": "no-ip" }))).toBe("10.0.0.9");
  });
});

describe("subjectFor", () => {
  const byEmail: RateLimitRule = { ...RULE, by: "email" };

  it("email normalizado y scopeado al tenant", () => {
    const r = req({ "x-tenant-slug": "demo" }, { email: "  Ana@Example.com " });
    expect(subjectFor(byEmail, r)).toBe("demo|ana@example.com");
  });

  it("sin email en el body la regla no aplica", () => {
    expect(subjectFor(byEmail, req({}, {}))).toBeNull();
    expect(subjectFor(byEmail, req({}, { email: 42 }))).toBeNull();
  });
});

describe("RateLimitGuard", () => {
  function run(verdictOk: boolean, rules: RateLimitRule[] | undefined) {
    const headers: Record<string, string> = {};
    const limiter = {
      check: async () => ({ ok: verdictOk, retryAfterSec: 42 }),
    } as unknown as RateLimitService;
    const reflector = { get: () => rules } as unknown as Reflector;
    const ctx = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req({ "x-client-ip": "203.0.113.7" }),
        getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
      }),
    } as unknown as ExecutionContext;
    return { result: new RateLimitGuard(reflector, limiter).canActivate(ctx), headers };
  }

  it("sin reglas no limita", async () => {
    await expect(run(false, undefined).result).resolves.toBe(true);
  });

  it("dentro del límite deja pasar", async () => {
    await expect(run(true, [RULE]).result).resolves.toBe(true);
  });

  it("pasado el límite → 429 con Retry-After", async () => {
    const { result, headers } = run(false, [RULE]);
    const err = await result.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(headers["Retry-After"]).toBe("42");
  });
});
