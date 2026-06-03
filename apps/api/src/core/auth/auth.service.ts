import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import {
  memberships,
  refreshTokens,
  users,
  type Database,
  type TenantTx,
} from "@nutreitor/db";
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

interface AuthUserRow {
  id: string;
  email: string;
  fullName: string;
}

/** Ejecutor de escritura: la conexión owner o una transacción sobre ella. */
type Executor = Database | TenantTx;

/** Error genérico de credenciales (anti-enumeración: no revela qué falló). */
const invalid = (): UnauthorizedException =>
  new UnauthorizedException("Credenciales inválidas.");

/**
 * Hash dummy para igualar el costo de bcrypt en los caminos "no existe" del login
 * (sin esto, un email inexistente respondería mucho más rápido → enumeración).
 * Se computa una vez al cargar el módulo.
 */
const DUMMY_HASH = bcrypt.hashSync("nutreitor::timing::equalizer", 10);

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
    const normalizedEmail = email.toLowerCase();

    // org y user son lecturas independientes → en paralelo.
    const [org, user] = await Promise.all([
      this.tenantResolver.bySlug(slug),
      this.findUserByEmail(normalizedEmail),
    ]);

    const role =
      org && user
        ? await this.findMembershipRole(user.id, org.id)
        : null;

    // SIEMPRE un bcrypt.compare (contra el hash real o el dummy) para que el
    // tiempo de respuesta no delate si el user/membership existe.
    const ok = await bcrypt.compare(
      password,
      user?.hashedPassword ?? DUMMY_HASH,
    );

    if (!org || !user || !role || !ok) throw invalid();

    return this.issue(
      this.admin.db,
      { id: user.id, email: user.email, fullName: user.fullName },
      org,
      role,
      userAgent,
    );
  }

  /**
   * Rota el refresh token. Garantías:
   *  - Compare-and-revoke ATÓMICO: ante dos requests concurrentes con el mismo
   *    token, sólo uno gana la fila (el otro recibe 0 filas → rechazo). No hay
   *    doble emisión.
   *  - Detección de reuso: si el token presentado ya estaba revocado (replay de un
   *    token rotado/robado), se revoca TODA la familia de sesiones del usuario.
   *  - Atomicidad revoke+emisión: van en una transacción; si la emisión falla, el
   *    revoke se deshace y el usuario no queda deslogueado.
   */
  async refresh(rawRefresh: string, userAgent?: string): Promise<IssuedSession> {
    const tokenHash = this.hashToken(rawRefresh);

    const [row] = await this.admin.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    // Replay de un token ya revocado → reuso: invalidar todas las sesiones del user.
    if (row?.revokedAt) {
      await this.revokeAllForUser(row.userId);
      throw invalid();
    }
    if (!row || row.expiresAt.getTime() < Date.now()) throw invalid();

    // Contexto en paralelo (lecturas independientes de la fila ya obtenida).
    const [org, role, user] = await Promise.all([
      this.tenantResolver.byId(row.organizationId),
      this.findMembershipRole(row.userId, row.organizationId),
      this.getUserById(row.userId),
    ]);
    if (!org || !role || !user) throw invalid();

    // Revocación del viejo + emisión del nuevo, atómicas.
    return this.admin.db.transaction(async (tx) => {
      const revoked = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)),
        )
        .returning({ id: refreshTokens.id });
      // Otro request concurrente ya rotó este token → perdimos la carrera.
      if (revoked.length === 0) throw invalid();
      return this.issue(tx, user, org, role, userAgent);
    });
  }

  /** Logout: revoca el refresh token (idempotente). */
  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) return;
    await this.admin.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, this.hashToken(rawRefresh)),
          isNull(refreshTokens.revokedAt),
        ),
      );
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
    const user = await this.getUserById(userId);
    if (!user) throw invalid();
    return { user, org, role };
  }

  // ── internos ────────────────────────────────────────────────────────────────

  private async issue(
    executor: Executor,
    user: AuthUserRow,
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
    await executor.insert(refreshTokens).values({
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

  /** Usuario por email (incluye el hash; sólo para login). */
  private async findUserByEmail(
    email: string,
  ): Promise<(AuthUserRow & { hashedPassword: string }) | null> {
    const [u] = await this.admin.db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        hashedPassword: users.hashedPassword,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return u ?? null;
  }

  /** Usuario por id (proyección acotada, sin el hash). */
  private async getUserById(id: string): Promise<AuthUserRow | null> {
    const [u] = await this.admin.db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return u ?? null;
  }

  /** Revoca todos los refresh tokens activos de un usuario (reuso detectado). */
  private async revokeAllForUser(userId: string): Promise<void> {
    await this.admin.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      );
  }

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }
}
