import { JwtService } from "@nestjs/jwt";
import {
  createDb,
  memberships,
  orgSignups,
  organizations,
  professionalProfiles,
  users,
  withTenant,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { DEMO_PASSWORD, PLATFORM_ADMIN, runSeed, SEED } from "@nutreitor/db/seed";
import type { OrgSignupDto, PlatformMe } from "@nutreitor/shared";
import { orgSignupSchema } from "@nutreitor/shared";
import { and, eq, like } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { assertOrgUsable } from "../src/core/auth/auth.service.js";
import { TenantResolverService } from "../src/core/auth/tenant-resolver.service.js";
import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AdminDbService } from "../src/core/database/admin-db.service.js";
import type { MailSender, PlainEmail } from "../src/core/mail/mail-sender.js";
import { PlatformAuthService } from "../src/modules/onboarding/platform-auth.js";
import { PlatformService } from "../src/modules/onboarding/platform.service.js";
import { SignupService } from "../src/modules/onboarding/signup.service.js";

/**
 * Alta autoservicio de organizaciones + consola de plataforma (ADR 0025), contra
 * Postgres real. Cubre: el link de verificación (un solo uso, reuso de cuenta), la
 * org nace en revisión y no es pública, las transiciones de la consola, la
 * matrícula (trigger que invalida la revisión) y que el rol app no puede escribir
 * los estados que decide la plataforma.
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const RUN = Math.random().toString(36).slice(2, 8);
const slug = (s: string) => `onb-${s}-${RUN}`;

const env = {
  WEB_ROOT_ORIGIN: "http://localhost:3000",
  WEB_ORIGIN_TEMPLATE: "http://{slug}.localhost:3000",
  SIGNUP_TTL_HOURS: 48,
  JWT_ACCESS_SECRET: "test-access-secret",
  PLATFORM_SESSION_TTL: "7200s",
  COOKIE_SECURE: false,
} as unknown as ApiEnv;

/** Captura los mails en vez de mandarlos. */
class CapturingMail implements MailSender {
  sent: PlainEmail[] = [];
  async sendInvitation(): Promise<void> {}
  async send(email: PlainEmail): Promise<void> {
    this.sent.push(email);
  }
  /** Token del último link de confirmación mandado a `to`. */
  tokenFor(to: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === to && m.subject.startsWith("Confirmá"));
    const m = /token=([a-f0-9]+)/.exec(mail?.text ?? "");
    if (!m) throw new Error(`No hay link para ${to}`);
    return m[1]!;
  }
}

let ownerDb: Database;
let ownerPool: pg.Pool;
let appDb: Database;
let appPool: pg.Pool;
let mail: CapturingMail;
let signup: SignupService;
let platform: PlatformService;
let platformAuth: PlatformAuthService;
let resolver: TenantResolverService;
let operator: PlatformMe;

function dto(over: Partial<OrgSignupDto> = {}): OrgSignupDto {
  return orgSignupSchema.parse({
    kind: "individual",
    orgName: "Consultorio Prueba",
    slug: slug("ind"),
    fullName: "Lucía Prueba",
    email: `lucia-${RUN}@onb.test`,
    licenseNumber: "MP 5678",
    licenseJurisdiction: "Córdoba",
    acceptTerms: true,
    ...over,
  });
}

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  const admin = new AdminDbService(ownerDb);
  mail = new CapturingMail();
  signup = new SignupService(admin, new AuditService(), mail, env);
  platform = new PlatformService(admin, new AuditService(), mail, env);
  platformAuth = new PlatformAuthService(admin, new JwtService({}), env);
  resolver = new TenantResolverService(admin);
  operator = { id: PLATFORM_ADMIN.id, email: PLATFORM_ADMIN.email, fullName: PLATFORM_ADMIN.fullName };
});

afterAll(async () => {
  // Las orgs de prueba quedan en la base de test (el audit es append-only y las
  // referencia); el sufijo por corrida evita choques entre corridas.
  await appPool?.end();
  await ownerPool?.end();
});

describe("alta autoservicio", () => {
  it("valida slug: formato, reservados y tomados", async () => {
    expect((await signup.slugAvailability("Con Acento")).available).toBe(false);
    expect((await signup.slugAvailability("plataforma")).available).toBe(false);
    expect((await signup.slugAvailability(SEED.orgA.slug)).available).toBe(false);
    expect((await signup.slugAvailability(slug("libre"))).available).toBe(true);
  });

  it("independiente sin matrícula no pasa la validación", () => {
    const r = orgSignupSchema.safeParse({ ...dto(), licenseNumber: undefined });
    expect(r.success).toBe(false);
  });

  it("start no crea nada; confirm crea org en revisión, admin y matrícula declarada", async () => {
    const d = dto();
    await signup.start(d);
    expect(await resolver.bySlug(d.slug)).toBeNull();

    const token = mail.tokenFor(d.email);
    const preview = await signup.lookup(token);
    expect(preview).toMatchObject({ orgName: d.orgName, slug: d.slug, needsAccount: true });

    await expect(signup.confirm({ token })).rejects.toThrow(/contraseña/);
    const done = await signup.confirm({ token, password: "una-clave-segura" });
    expect(done.loginUrl).toContain(`http://${d.slug}.localhost:3000/login?email=`);

    const org = await resolver.bySlug(d.slug);
    expect(org).toMatchObject({ status: "pending_review", kind: "individual" });
    // No es pública mientras está en revisión.
    expect(await resolver.publicBySlug(d.slug)).toBeNull();
    // Pero sí puede entrar a configurarse.
    expect(() => assertOrgUsable(org!)).not.toThrow();

    const [m] = await ownerDb
      .select({ role: memberships.role, licenseStatus: professionalProfiles.licenseStatus, licenseNumber: professionalProfiles.licenseNumber })
      .from(memberships)
      .innerJoin(professionalProfiles, eq(professionalProfiles.membershipId, memberships.id))
      .where(eq(memberships.organizationId, org!.id));
    expect(m).toMatchObject({ role: "admin", licenseStatus: "declared", licenseNumber: "MP 5678" });

    // La plataforma recibió el aviso.
    expect(mail.sent.some((x) => x.to === PLATFORM_ADMIN.email && x.text.includes(d.slug))).toBe(true);
  });

  it("el link es de un solo uso", async () => {
    const d = dto({ slug: slug("uso"), email: `uso-${RUN}@onb.test` });
    await signup.start(d);
    const token = mail.tokenFor(d.email);
    await signup.confirm({ token, password: "una-clave-segura" });
    await expect(signup.confirm({ token, password: "una-clave-segura" })).rejects.toThrow(/inválido o venció/);
    await expect(signup.lookup(token)).rejects.toThrow(/inválido o venció/);
  });

  it("un email con cuenta la reusa (sin contraseña) y queda admin de la org nueva", async () => {
    const d = dto({ kind: "team", slug: slug("team"), email: "pro@demo.test", licenseNumber: undefined, licenseJurisdiction: undefined });
    await signup.start(d);
    const token = mail.tokenFor(d.email);
    expect((await signup.lookup(token)).needsAccount).toBe(false);
    await signup.confirm({ token });

    const org = await resolver.bySlug(d.slug);
    const [u] = await ownerDb.select({ id: users.id }).from(users).where(eq(users.email, "pro@demo.test"));
    const [m] = await ownerDb
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.organizationId, org!.id), eq(memberships.userId, u!.id)));
    expect(m?.role).toBe("admin");
  });

  it("dos altas con el mismo slug: la segunda confirmación choca (409)", async () => {
    const s = slug("carrera");
    const a = dto({ slug: s, email: `a-${RUN}@onb.test` });
    const b = dto({ slug: s, email: `b-${RUN}@onb.test` });
    await signup.start(a);
    await signup.start(b);
    await signup.confirm({ token: mail.tokenFor(a.email), password: "una-clave-segura" });
    await expect(
      signup.confirm({ token: mail.tokenFor(b.email), password: "una-clave-segura" }),
    ).rejects.toThrow(/otra organización tomó esa dirección/);
    // Y empezar de nuevo con ese slug ya da 409 de entrada.
    await expect(signup.start(dto({ slug: s, email: `c-${RUN}@onb.test` }))).rejects.toThrow(/tomada/);
  });
});

describe("consola de plataforma", () => {
  it("login: sólo operadores; el token no sirve con otro audience", async () => {
    await expect(platformAuth.login("admin@demo.test", DEMO_PASSWORD)).rejects.toThrow(/Credenciales/);
    const { token, me } = await platformAuth.login(PLATFORM_ADMIN.email, DEMO_PASSWORD);
    expect(me.email).toBe(PLATFORM_ADMIN.email);
    expect(await platformAuth.verify(token)).toMatchObject({ id: PLATFORM_ADMIN.id });

    // Un JWT de tenant (sin aud de plataforma) firmado con el mismo secreto no entra.
    const tenantJwt = await new JwtService({}).signAsync(
      { sub: PLATFORM_ADMIN.id, org: SEED.orgDemo.id, role: "admin" },
      { secret: env.JWT_ACCESS_SECRET },
    );
    expect(await platformAuth.verify(tenantJwt)).toBeNull();
  });

  it("aprobar activa la org y revisa las matrículas declaradas; transiciones inválidas → 409", async () => {
    const org = await resolver.bySlug(slug("ind"));
    const pending = await platform.listOrgs("pending_review");
    const entry = pending.find((o) => o.id === org!.id);
    expect(entry?.admins[0]?.email).toBe(`lucia-${RUN}@onb.test`);
    expect(entry?.licenses[0]).toMatchObject({ licenseNumber: "MP 5678", licenseStatus: "declared" });

    const approved = await platform.decideOrg(org!.id, { decision: "approve" }, operator);
    expect(approved.status).toBe("active");
    expect(approved.licenses[0]?.licenseStatus).toBe("reviewed");
    expect(await resolver.publicBySlug(slug("ind"))).not.toBeNull();
    expect(mail.sent.some((m) => m.to === `lucia-${RUN}@onb.test` && m.subject.includes("ya está activa"))).toBe(true);

    await expect(platform.decideOrg(org!.id, { decision: "reject", note: "x" }, operator)).rejects.toThrow(/No se puede rechazar/);
  });

  it("suspender corta el acceso; reactivar lo devuelve", async () => {
    const id = (await resolver.bySlug(slug("ind")))!.id;
    await platform.decideOrg(id, { decision: "suspend", note: "Falta de pago" }, operator);
    const suspended = await resolver.bySlug(slug("ind"));
    expect(() => assertOrgUsable(suspended!)).toThrow(/suspendida/);
    expect(await resolver.publicBySlug(slug("ind"))).toBeNull();

    await platform.decideOrg(id, { decision: "reactivate" }, operator);
    expect((await resolver.bySlug(slug("ind")))!.status).toBe("active");
  });

  it("rechazar deja el motivo y bloquea el ingreso", async () => {
    const id = (await resolver.bySlug(slug("uso")))!.id;
    const rejected = await platform.decideOrg(id, { decision: "reject", note: "Matrícula no encontrada" }, operator);
    expect(rejected).toMatchObject({ status: "rejected", reviewNote: "Matrícula no encontrada" });
    const org = await resolver.bySlug(slug("uso"));
    expect(() => assertOrgUsable(org!)).toThrow(/rechazada/);
  });
});

describe("matrícula", () => {
  async function profileOf(orgSlug: string) {
    const org = await resolver.bySlug(orgSlug);
    const [p] = await ownerDb
      .select()
      .from(professionalProfiles)
      .where(eq(professionalProfiles.organizationId, org!.id));
    return { org: org!, profile: p! };
  }

  it("cambiar el número invalida la revisión (trigger) y vuelve a la cola", async () => {
    const { org, profile } = await profileOf(slug("ind"));
    expect(profile.licenseStatus).toBe("reviewed");

    const [after] = await withTenant(appDb, org.id, (tx) =>
      tx
        .update(professionalProfiles)
        .set({ licenseNumber: "MP 9999" })
        .where(eq(professionalProfiles.id, profile.id))
        .returning(),
    );
    expect(after!.licenseStatus).toBe("declared");
    expect((await platform.pendingLicenses()).some((l) => l.profileId === profile.id)).toBe(true);

    await expect(
      platform.decideLicense(profile.id, { decision: "rejected", note: "No figura en el registro" }, operator),
    ).resolves.toMatchObject({ licenseStatus: "rejected", licenseNote: "No figura en el registro" });
    await expect(platform.decideLicense(profile.id, { decision: "reviewed" }, operator)).rejects.toThrow(/no está pendiente/);
  });

  it("el rol app no puede escribir el estado de la matrícula ni el de la org", async () => {
    const { org, profile } = await profileOf(slug("ind"));
    await expect(
      withTenant(appDb, org.id, (tx) =>
        tx.update(professionalProfiles).set({ licenseStatus: "reviewed" }).where(eq(professionalProfiles.id, profile.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(appDb, org.id, (tx) =>
        tx.update(organizations).set({ status: "active" }).where(eq(organizations.id, org.id)),
      ),
    ).rejects.toThrow();
    // El branding sí (GRANT por columna).
    await withTenant(appDb, org.id, (tx) =>
      tx.update(organizations).set({ displayName: "Consultorio Lucía" }).where(eq(organizations.id, org.id)),
    );
  });

  it("las solicitudes de alta no son visibles para el rol app", async () => {
    await expect(withTenant(appDb, SEED.orgDemo.id, (tx) => tx.select().from(orgSignups).limit(1))).rejects.toThrow();
    // (limpieza de solicitudes de esta corrida: plano de control, owner)
    await ownerDb.delete(orgSignups).where(like(orgSignups.slug, `onb-%-${RUN}`));
  });
});
