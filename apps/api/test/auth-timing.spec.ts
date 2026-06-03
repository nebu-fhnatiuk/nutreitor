import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// bcryptjs mockeado: capturamos el spy de compare vía vi.hoisted (la factory de
// vi.mock se hoistea por encima de los imports).
const { compareMock } = vi.hoisted(() => ({ compareMock: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: {
    hashSync: () => "$2a$10$dummyhashdummyhashdummyha",
    compare: compareMock,
  },
}));

import { AuthService } from "../src/core/auth/auth.service.js";

/**
 * Verifica la mitigación del timing oracle del login: en los tres caminos de
 * fallo (user inexistente / membership inexistente / password incorrecta) se
 * ejecuta SIEMPRE bcrypt.compare y se lanza el MISMO error genérico. Probar el
 * invariante "siempre compara" es determinista; medir milisegundos sería flaky.
 */
describe("AuthService.login — anti-timing / anti-enumeración", () => {
  const org = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Demo",
    slug: "demo",
    region: "us-east-1",
  };
  const user = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "pro@demo.test",
    fullName: "Pro Demo",
    hashedPassword: "$2a$10$realhashrealhashrealhash",
  };

  let service: AuthService;
  let resolver: { bySlug: ReturnType<typeof vi.fn>; byId: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    compareMock.mockReset();
    compareMock.mockResolvedValue(false); // password siempre "no coincide" → todos fallan
    resolver = { bySlug: vi.fn().mockResolvedValue(org), byId: vi.fn() };

    service = new AuthService(
      {} as never, // AdminDbService: las lecturas se stubbean abajo
      resolver as never,
      {} as never, // JwtService: no se alcanza (todos los caminos tiran antes de emitir)
      { JWT_ACCESS_SECRET: "x", ACCESS_TTL: "900s", REFRESH_TTL_DAYS: 30 } as never,
    );
  });

  async function expectGenericFailure(): Promise<string> {
    try {
      await service.login("demo", "pro@demo.test", "wrong-password");
      throw new Error("login no lanzó");
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      return (e as UnauthorizedException).message;
    }
  }

  it("user inexistente: corre bcrypt.compare (contra el hash dummy) y falla genérico", async () => {
    vi.spyOn(service as never as { findUserByEmail: () => unknown }, "findUserByEmail").mockResolvedValue(null);
    // findMembershipRole ahora corre SIEMPRE (con ids nulos) para igualar timing.
    vi.spyOn(service, "findMembershipRole").mockResolvedValue(null);

    const msg = await expectGenericFailure();

    expect(compareMock).toHaveBeenCalledTimes(1);
    // Camino sin user → compara contra el hash dummy precomputado.
    expect(compareMock.mock.calls[0]?.[1]).toMatch(/^\$2a\$/);
    expect(msg).toBe("Credenciales inválidas.");
  });

  it("membership inexistente: corre bcrypt.compare (contra el hash real) y falla genérico", async () => {
    vi.spyOn(service as never as { findUserByEmail: () => unknown }, "findUserByEmail").mockResolvedValue(user);
    vi.spyOn(service, "findMembershipRole").mockResolvedValue(null);

    const msg = await expectGenericFailure();

    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(compareMock.mock.calls[0]?.[1]).toBe(user.hashedPassword);
    expect(msg).toBe("Credenciales inválidas.");
  });

  it("password incorrecta: corre bcrypt.compare y falla genérico", async () => {
    vi.spyOn(service as never as { findUserByEmail: () => unknown }, "findUserByEmail").mockResolvedValue(user);
    vi.spyOn(service, "findMembershipRole").mockResolvedValue("professional");

    const msg = await expectGenericFailure();

    expect(compareMock).toHaveBeenCalledTimes(1);
    expect(msg).toBe("Credenciales inválidas.");
  });

  it("los tres caminos son indistinguibles: mismo error y siempre comparan", async () => {
    const messages = new Set<string>();

    vi.spyOn(service as never as { findUserByEmail: () => unknown }, "findUserByEmail").mockResolvedValue(null);
    vi.spyOn(service, "findMembershipRole").mockResolvedValue(null);
    messages.add(await expectGenericFailure());

    vi.restoreAllMocks();
    resolver.bySlug.mockResolvedValue(org);
    vi.spyOn(service as never as { findUserByEmail: () => unknown }, "findUserByEmail").mockResolvedValue(user);
    vi.spyOn(service, "findMembershipRole").mockResolvedValue(null);
    messages.add(await expectGenericFailure());

    vi.restoreAllMocks();
    resolver.bySlug.mockResolvedValue(org);
    vi.spyOn(service as never as { findUserByEmail: () => unknown }, "findUserByEmail").mockResolvedValue(user);
    vi.spyOn(service, "findMembershipRole").mockResolvedValue("professional");
    messages.add(await expectGenericFailure());

    // Un único mensaje para los tres caminos → indistinguibles para el cliente.
    expect(messages.size).toBe(1);
  });
});
