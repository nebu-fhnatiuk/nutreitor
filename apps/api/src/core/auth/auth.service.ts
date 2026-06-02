import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { memberships, organizations, refreshTokens, users } from "@nutreitor/db";
import type {
  AuthOrg,
  LoginResponse,
  MembershipRole,
  MeResponse,
} from "@nutreitor/shared";
import { roleHome } from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import { AdminDbService } from "../database/admin-db.service.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

export interface AccessPayload {
  sub: string;
  org: string;
  role: MembershipRole;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  result: LoginResponse;
}

/** Error genérico de credenciales (anti-enumeración: no revela qué falló). */
const INVALID = new UnauthorizedException("Credenciales inválidas.");

/**
 * Lógica de autenticación self-hosted. Todas las consultas pre-auth (resolver org,
 * buscar user/membership/refresh) usan la conexión OWNER (bypassa RLS): es el
 * plano de control de identidad, no una operación de tenant. El JWT emitido lleva
 * `org` y `role` de forma autoritativa para el resto de los requests.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly admin: AdminDbService,
    private readonly tenantResolver: TenantResolverService,
    private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** Login dentro del tenant resuelto del subdominio. */
  async login(
    slug: string,
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const org = await this.tenantResolver.bySlug(slug);
    if (!org) throw INVALID;

    const [user] = await this.admin.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user) throw INVALID;

    const [membership] = await this.admin.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.organizationId, org.id),
        ),
      )
      .limit(1);
    if (!membership) throw INVALID;

    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) throw INVALID;

    return this.issue(
      { id: user.id, email: user.email, fullName: user.fullName },
      org,
      membership.role,
      userAgent,
    );
  }

  /** Rota el refresh token: valida, revoca el viejo y emite un par nuevo. */
  async refresh(rawRefresh: string, userAgent?: string): Promise<IssuedSession> {
    const tokenHash = this.hashToken(rawRefresh);
    const [row] = await this.admin.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) throw INVALID;

    const org = await this.orgById(row.organizationId);
    const [membership] = await this.admin.db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, row.userId),
          eq(memberships.organizationId, row.organizationId),
        ),
      )
      .limit(1);
    if (!org || !membership) throw INVALID;

    const [user] = await this.admin.db
      .select()
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!user) throw INVALID;

    // Revoca el token usado (rotación).
    await this.admin.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    return this.issue(
      { id: user.id, email: user.email, fullName: user.fullName },
      org,
      membership.role,
      userAgent,
    );
  }

  /** Logout: revoca el refresh token (idempotente). */
  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    await this.admin.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, this.hashToken(rawRefresh)));
  }

  /** Verifica que el membership user↔org siga existiendo (lo usa el guard). */
  async findMembershipRole(
    userId: string,
    orgId: string,
  ): Promise<MembershipRole | null> {
    const [m] = await this.admin.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)),
      )
      .limit(1);
    return m?.role ?? null;
  }

  /** Construye la respuesta /me a partir de la sesión ya validada por el guard. */
  async buildMe(
    userId: string,
    org: AuthOrg,
    role: MembershipRole,
  ): Promise<MeResponse> {
    const [user] = await this.admin.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw INVALID;
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      org,
      role,
    };
  }

  // ── internos ────────────────────────────────────────────────────────────────

  private async issue(
    user: { id: string; email: string; fullName: string },
    org: AuthOrg,
    role: MembershipRole,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const payload: AccessPayload = { sub: user.id, org: org.id, role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      // ACCESS_TTL es un string tipo "900s"; @nestjs/jwt tipa expiresIn con el
      // StringValue de `ms`, así que casteamos al tipo esperado.
      expiresIn: this.env.ACCESS_TTL as JwtSignOptions["expiresIn"],
    });

    const refreshToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + this.env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.admin.db.insert(refreshTokens).values({
      userId: user.id,
      organizationId: org.id,
      region: org.region,
      tokenHash: this.hashToken(refreshToken),
      expiresAt,
      userAgent,
    });

    return {
      accessToken,
      refreshToken,
      result: { user, org, role, redirect: roleHome[role] },
    };
  }

  private async orgById(id: string): Promise<AuthOrg | null> {
    const [org] = await this.admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return org
      ? { id: org.id, name: org.name, slug: org.slug, region: org.region }
      : null;
  }

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }
}
