import { JwtService } from "@nestjs/jwt";
import { createDb, passwordResets, refreshTokens, users, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PasswordResetService } from "../src/core/auth/password-reset.service.js";
import { TenantResolverService } from "../src/core/auth/tenant-resolver.service.js";
import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AdminDbService } from "../src/core/database/admin-db.service.js";
import type { MailSender, PlainEmail } from "../src/core/mail/mail-sender.js";
import { PlatformAuthService } from "../src/modules/onboarding/platform-auth.js";
import { controlUrl } from "./test-db.js";

/**
 * Recuperar la contraseña (ADR 0029), contra Postgres real. Cubre: misma respuesta
 * exista o no la cuenta, el link vuelve al subdominio pedido, un solo uso, vence,
 * cambia la contraseña de verdad, cierra las sesiones y deja afuera la sesión de
 * plataforma emitida antes del cambio. El rol app no ve los pedidos.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const RUN = Math.random().toString(36).slice(2, 8);
const USER_ID = "00000000-0000-0000-0000-0000000005a1";
const EMAIL = "reset-e2e@nutreitor.test";

const env = {
  WEB_ORIGIN_TEMPLATE: "http://{slug}.localhost:3000",
  WEB_ROOT_ORIGIN: "http://localhost:3000",
  PASSWORD_RESET_TTL_MIN: 60,
  JWT_ACCESS_SECRET: "test-access-secret",
  PLATFORM_SESSION_TTL: "7200s",
  COOKIE_SECURE: false,
} as unknown as ApiEnv;

class CapturingMail implements MailSender {
  sent: PlainEmail[] = [];
  async sendInvitation(): Promise<void> {}
  async send(e: PlainEmail): Promise<void> {
    this.sent.push(e);
  }
  lastLink(): string {
    const m = /(\S+\/restablecer\?token=([a-f0-9]+))/.exec(this.sent.at(-1)?.text ?? "");
    if (!m) throw new Error("sin link");
    return m[1]!;
  }
  lastToken(): string {
    return new URL(this.lastLink()).searchParams.get("token")!;
  }
}

let owner: Database;
let ownerPool: pg.Pool;
let control: ReturnType<typeof createDb>;
let appDb: Database;
let appPool: pg.Pool;
let mail: CapturingMail;
let svc: PasswordResetService;
let platform: PlatformAuthService;

async function hashOf(): Promise<string> {
  const [u] = await owner.select({ h: users.hashedPassword }).from(users).where(eq(users.id, USER_ID));
  return u!.h;
}

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  control = createDb(controlUrl());
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  // Operador de plataforma de prueba (también sirve para la sesión de consola).
  await owner.execute(sql`insert into users (id, email, full_name, hashed_password, is_platform_admin)
    values (${USER_ID}, ${EMAIL}, 'Reset Prueba', ${bcrypt.hashSync("vieja-clave-1", 4)}, true)
    on conflict (id) do update set hashed_password = excluded.hashed_password, password_changed_at = null`);
  await owner.delete(passwordResets).where(eq(passwordResets.userId, USER_ID));
  const admin = new AdminDbService(control.db);
  mail = new CapturingMail();
  svc = new PasswordResetService(admin, new TenantResolverService(admin), mail, env);
  platform = new PlatformAuthService(admin, new JwtService({}), env);
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
  await control?.pool.end();
});

describe("pedido", () => {
  it("email sin cuenta: misma respuesta y ningún mail", async () => {
    const before = mail.sent.length;
    await expect(svc.request(`nadie-${RUN}@nutreitor.test`, SEED.orgDemo.slug)).resolves.toBeUndefined();
    expect(mail.sent.length).toBe(before);
  });

  it("el link vuelve al subdominio pedido; desde el raíz, al raíz; un slug inventado, al raíz", async () => {
    await svc.request(EMAIL, SEED.orgDemo.slug);
    expect(mail.lastLink()).toMatch(/^http:\/\/demo\.localhost:3000\/restablecer\?token=/);
    expect(mail.sent.at(-1)!.text).toContain("vence en 60 minutos");
    await svc.request(EMAIL, undefined);
    expect(mail.lastLink()).toMatch(/^http:\/\/localhost:3000\/restablecer\?token=/);
    await svc.request(EMAIL, "no-existe-esta-org");
    expect(mail.lastLink()).toMatch(/^http:\/\/localhost:3000\//);
  });
});

describe("restablecer", () => {
  it("cambia la contraseña, cierra sesiones, anula los otros links y deja afuera la consola vieja", async () => {
    // Sesión de consola emitida antes del cambio (iat en el pasado).
    const old = await new JwtService({}).signAsync(
      { sub: USER_ID, iat: Math.floor(Date.now() / 1000) - 120 },
      { secret: env.JWT_ACCESS_SECRET, audience: "nutreitor-platform", expiresIn: "2h" },
    );
    expect(await platform.verify(old)).not.toBeNull();
    // Una sesión de tenant abierta.
    await owner.insert(refreshTokens).values({
      userId: USER_ID,
      organizationId: SEED.orgDemo.id,
      region: SEED.orgDemo.region,
      tokenHash: `rt-${RUN}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await svc.request(EMAIL, undefined);
    const first = mail.lastToken();
    await svc.request(EMAIL, undefined);
    const token = mail.lastToken();
    expect(await svc.lookup(token)).toEqual({ email: EMAIL });

    expect(await svc.reset(token, "nueva-clave-segura")).toEqual({ email: EMAIL });
    expect(bcrypt.compareSync("nueva-clave-segura", await hashOf())).toBe(true);
    expect(bcrypt.compareSync("vieja-clave-1", await hashOf())).toBe(false);

    const open = await owner
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, USER_ID), isNull(refreshTokens.revokedAt)));
    expect(open).toHaveLength(0);
    expect(await platform.verify(old)).toBeNull();

    // Un solo uso, y el otro link abierto también murió.
    await expect(svc.reset(token, "otra-clave-segura")).rejects.toThrow(/inválido o venció/);
    await expect(svc.reset(first, "otra-clave-segura")).rejects.toThrow(/inválido o venció/);

    // Con la clave nueva, la consola vuelve a entrar.
    const { token: fresh } = await platform.login(EMAIL, "nueva-clave-segura");
    expect(await platform.verify(fresh)).not.toBeNull();
  });

  it("un link vencido no sirve", async () => {
    await svc.request(EMAIL, undefined);
    const token = mail.lastToken();
    await owner.execute(sql`update password_resets set expires_at = now() - interval '1 minute' where user_id = ${USER_ID} and used_at is null`);
    await expect(svc.lookup(token)).rejects.toThrow(/inválido o venció/);
    await expect(svc.reset(token, "otra-clave-segura")).rejects.toThrow(/inválido o venció/);
  });

  it("el rol app no ve los pedidos de recuperación", async () => {
    await expect(withTenant(appDb, SEED.orgDemo.id, (tx) => tx.select().from(passwordResets).limit(1))).rejects.toThrow();
  });
});
