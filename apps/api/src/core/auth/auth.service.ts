import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
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
import { roleHome, capabilitiesForRole } from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";

import { APP_ENV, type ApiEnv } from "../config/app-config.module.js";
import { generateToken, hashToken } from "../crypto/tokens.js";
import { AdminDbService } from "../database/admin-db.service.js";
import { TenantDbService } from "../database/tenant-db.service.js";
import { loadActiveModuleKeys } from "../../modules/organizations/active-modules.js";
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

/** UUID nulo para lookups que deben correr SIEMPRE (igualar timing) sin matchear. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Ventana de gracia para la rotación de refresh: si se replayea un token revocado
 * hace menos de esto y su sucesor sigue activo, se asume retry benigno (respuesta
 * perdida / doble submit) y NO se revoca la familia. Fuera de la ventana, o si la
 * cadena ya avanzó, se trata como reuso real.
 */
const REUSE_GRACE_MS = 30_000;

/**
 * Org rechazada o suspendida: no se entra al workspace. Se chequea DESPUÉS de
 * validar credenciales (no le dice nada a quien no sabe la contraseña). Una org en
 * revisión sí entra: se configura mientras la plataforma la aprueba (ADR 0025).
 */
export function assertOrgUsable(org: AuthOrg): void {
  if (org.status === "rejected" || org.status === "suspended") {
    throw new ForbiddenException(
      org.status === "rejected"
        ? "La solicitud de esta organización fue rechazada."
        : "Esta organización está suspendida. Escribinos para reactivarla.",
    );
  }
}

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
    private readonly tenantDb: TenantDbService,
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

    // org y user: lecturas independientes → en paralelo.
    const [org, user] = await Promise.all([
      this.tenantResolver.bySlug(slug),
      this.findUserByEmail(normalizedEmail),
    ]);

    // membership y bcrypt corren SIEMPRE y en paralelo: el lookup de membership se
    // hace aun sin org/user (con ids nulos → null) para no filtrar por timing si
    // el usuario existe, y el bcrypt usa el hash dummy si no hay user. Así todos
    // los caminos de fallo tardan lo mismo.
    const [role, ok] = await Promise.all([
      this.findMembershipRole(user?.id ?? NIL_UUID, org?.id ?? NIL_UUID),
      bcrypt.compare(password, user?.hashedPassword ?? DUMMY_HASH),
    ]);

    if (!org || !user || !role || !ok) throw invalid();
    assertOrgUsable(org);

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
   *  - Compare-and-revoke ATÓMICO (en `issue`): ante requests concurrentes con el
   *    mismo token, sólo uno gana la fila; el otro recibe 0 filas → rechazo.
   *  - Detección de reuso con cadena `replacedBy` + ventana de gracia: el replay de
   *    un token revocado revoca TODA la familia, SALVO que sea un retry benigno
   *    (dentro de la gracia y con el sucesor todavía activo).
   *  - Atomicidad revoke+emisión: van en una transacción; si algo falla, se deshace.
   *  - Errores transitorios de DB → 503 (reintentable), no 500.
   */
  async refresh(rawRefresh: string, userAgent?: string): Promise<IssuedSession> {
    const tokenHash = hashToken(rawRefresh);

    const [row] = await this.admin.db
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        organizationId: refreshTokens.organizationId,
        expiresAt: refreshTokens.expiresAt,
        revokedAt: refreshTokens.revokedAt,
        replacedBy: refreshTokens.replacedBy,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    // Token revocado: distinguir retry benigno de reuso real.
    if (row?.revokedAt) {
      const benign =
        Date.now() - row.revokedAt.getTime() <= REUSE_GRACE_MS &&
        row.replacedBy !== null &&
        (await this.isActiveToken(row.replacedBy));
      // Reuso real (fuera de gracia o cadena avanzada) → matar la familia.
      if (!benign) await this.revokeAllForUser(row.userId);
      throw invalid();
    }
    if (!row || row.expiresAt.getTime() < Date.now()) throw invalid();

    // Contexto (org + user) en paralelo. Un fallo transitorio acá es reintentable.
    let org: AuthOrg | null;
    let user: AuthUserRow | null;
    try {
      [org, user] = await Promise.all([
        this.tenantResolver.byId(row.organizationId),
        this.getUserById(row.userId),
      ]);
    } catch {
      throw new ServiceUnavailableException("Servicio no disponible, reintentá.");
    }
    if (!org || !user) throw invalid();
    assertOrgUsable(org);

    // Revocación del viejo (atómica, encadenada) + emisión del nuevo, en una tx.
    // El rol se re-verifica DENTRO de la tx (cierra el TOCTOU: un membership
    // revocado entre la lectura y el commit aborta la emisión).
    return this.admin.db.transaction(async (tx) => {
      const [member] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, row.userId),
            eq(memberships.organizationId, row.organizationId),
            isNull(memberships.revokedAt),
          ),
        )
        .limit(1);
      if (!member) throw invalid();
      return this.issue(tx, user, org, member.role, userAgent, row.id);
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
          eq(refreshTokens.tokenHash, hashToken(rawRefresh)),
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
        and(
          eq(memberships.userId, userId),
          eq(memberships.organizationId, orgId),
          isNull(memberships.revokedAt),
        ),
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
    // Módulos activos de la org (entitlements): la UI gatea features con esto; el
    // corte real lo hace el ModuleGuard en el servidor. `runAs` con el tenant
    // EXPLÍCITO: buildMe corre también en login, cuando todavía no hay ALS.
    const modules = await this.tenantDb.runAs(org.id, (tx) => loadActiveModuleKeys(tx));
    return { user, org, role, capabilities: capabilitiesForRole(role), modules };
  }

  /**
   * Emite una sesión nueva (sin rotación) para `user` en `org` con `role`. Lo usa
   * el flujo de aceptación de invitación para dejar al invitado logueado.
   */
  issueFor(
    executor: Executor,
    user: AuthUserRow,
    org: AuthOrg,
    role: MembershipRole,
    userAgent?: string,
  ): Promise<IssuedSession> {
    return this.issue(executor, user, org, role, userAgent);
  }

  // ── internos ────────────────────────────────────────────────────────────────

  /**
   * Emite el par de tokens. Si `predecessorId` está presente (rotación), revoca el
   * token anterior de forma ATÓMICA y lo encadena (`replacedBy`) al nuevo: si otro
   * request ya lo revocó (carrera), el UPDATE afecta 0 filas → se aborta (y, dentro
   * de una tx, se deshace la emisión).
   */
  private async issue(
    executor: Executor,
    user: AuthUserRow,
    org: AuthOrg,
    role: MembershipRole,
    userAgent?: string,
    predecessorId?: string,
  ): Promise<IssuedSession> {
    const refreshToken = generateToken();
    const expiresAt = new Date(
      Date.now() + this.env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const [inserted] = await executor
      .insert(refreshTokens)
      .values({
        userId: user.id,
        organizationId: org.id,
        region: org.region,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent,
      })
      .returning({ id: refreshTokens.id });

    if (predecessorId) {
      const revoked = await executor
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedBy: inserted!.id })
        .where(
          and(
            eq(refreshTokens.id, predecessorId),
            isNull(refreshTokens.revokedAt),
          ),
        )
        .returning({ id: refreshTokens.id });
      if (revoked.length === 0) throw invalid(); // perdimos la carrera de rotación
    }

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, org: org.id, role } satisfies AccessPayload,
      {
        secret: this.env.JWT_ACCESS_SECRET,
        // ACCESS_TTL es un string tipo "900s"; @nestjs/jwt tipa expiresIn con el
        // StringValue de `ms`, así que casteamos al tipo esperado.
        expiresIn: this.env.ACCESS_TTL as JwtSignOptions["expiresIn"],
      },
    );

    // Módulos activos de la org (tenant explícito: este flujo corre sin ALS).
    const modules = await this.tenantDb.runAs(org.id, (tx) => loadActiveModuleKeys(tx));

    return {
      accessToken,
      refreshToken,
      result: {
        user,
        org,
        role,
        capabilities: capabilitiesForRole(role),
        modules,
        redirect: roleHome[role],
      },
    };
  }

  /** ¿El token (por id) sigue activo? (no revocado y no expirado). */
  private async isActiveToken(id: string): Promise<boolean> {
    const [t] = await this.admin.db
      .select({
        revokedAt: refreshTokens.revokedAt,
        expiresAt: refreshTokens.expiresAt,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1);
    return !!t && t.revokedAt === null && t.expiresAt.getTime() > Date.now();
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
}
