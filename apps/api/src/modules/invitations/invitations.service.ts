import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  invitations,
  memberships,
  organizations,
  patients,
  users,
} from "@nutreitor/db";
import type {
  AuthOrg,
  CreateInvitationDto,
  AcceptInvitationDto,
  InvitationDto,
  InvitationPreview,
} from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, desc, eq, isNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { AuthService, type IssuedSession } from "../../core/auth/auth.service.js";
import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { generateToken, hashToken } from "../../core/crypto/tokens.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { MAIL_SENDER, type MailSender } from "../../core/mail/mail-sender.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { ensureProfessionalProfile } from "../professionals/profile-provisioning.js";

type InvitationRow = typeof invitations.$inferSelect;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly admin: AdminDbService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** Crea (o supersede) una invitación y manda el link. Corre bajo sesión admin. */
  async create(dto: CreateInvitationDto): Promise<InvitationDto> {
    const ctx = getTenantContext();
    const { user: actor, org } = getAuth();
    const email = dto.email.toLowerCase();

    const row = await this.runMappingConflict(async () =>
      this.tenantDb.run(async (tx) => {
      // ¿el email ya es miembro ACTIVO de esta org?
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser) {
        const [m] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.userId, existingUser.id),
              eq(memberships.organizationId, ctx.orgId),
              isNull(memberships.revokedAt),
            ),
          )
          .limit(1);
        if (m) throw new ConflictException("Ese email ya es miembro de la organización.");
      }

      // Si se vincula una entidad paciente: debe existir en el tenant (RLS) y estar
      // SIN cuenta. Evita la invitación basura y la cuenta-sin-ficha (dead-end:
      // accept sólo linkea si userId IS NULL).
      if (dto.patientId) {
        const [patient] = await tx
          .select({ userId: patients.userId })
          .from(patients)
          .where(eq(patients.id, dto.patientId))
          .limit(1);
        if (!patient) {
          throw new BadRequestException("Paciente inexistente en la organización.");
        }
        if (patient.userId) {
          throw new ConflictException("Ese paciente ya tiene una cuenta vinculada.");
        }
      }

      // Supersede invitaciones pendientes previas para (email, org).
      await tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitations.organizationId, ctx.orgId),
            eq(invitations.email, email),
            eq(invitations.status, "pending"),
          ),
        );

      const raw = generateToken();
      const [inv] = await tx
        .insert(invitations)
        .values({
          organizationId: ctx.orgId,
          region: ctx.region,
          email,
          role: dto.role,
          tokenHash: hashToken(raw),
          status: "pending",
          expiresAt: this.ttl(),
          invitedByUserId: actor.id,
          patientId: dto.patientId ?? null,
        })
        .returning();

      await this.audit.recordForSession(tx, {
        action: "member.invited",
        targetType: "invitation",
        targetId: inv!.id,
        metadata: { role: dto.role },
      });

      return { inv: inv!, acceptUrl: this.acceptUrl(org.slug, raw) };
      }),
    );

    await this.mail.sendInvitation({
      to: email,
      acceptUrl: row.acceptUrl,
      orgName: org.name,
      role: dto.role,
    });
    return toDto(row.inv);
  }

  /** Listado de invitaciones pendientes (sesión admin). */
  async listPending(): Promise<InvitationDto[]> {
    const rows = await this.tenantDb.run((tx) =>
      tx
        .select()
        .from(invitations)
        .where(eq(invitations.status, "pending"))
        .orderBy(desc(invitations.createdAt)),
    );
    return rows.map(toDto);
  }

  /** Reenvía: rota el token (supersede el link anterior) + audit. */
  async resend(id: string): Promise<void> {
    const { org } = getAuth();
    const row = await this.tenantDb.run(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invitations)
        .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
        .limit(1);
      if (!inv) throw new NotFoundException("Invitación no encontrada.");
      const raw = generateToken();
      await tx
        .update(invitations)
        .set({ tokenHash: hashToken(raw), expiresAt: this.ttl() })
        .where(eq(invitations.id, id));
      await this.audit.recordForSession(tx, {
        action: "invite.resent",
        targetType: "invitation",
        targetId: id,
      });
      return { inv, acceptUrl: this.acceptUrl(org.slug, raw) };
    });
    await this.mail.sendInvitation({
      to: row.inv.email,
      acceptUrl: row.acceptUrl,
      orgName: org.name,
      role: row.inv.role,
    });
  }

  /** Revoca una invitación pendiente. */
  async revoke(id: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const revoked = await tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
        .returning({ id: invitations.id });
      if (revoked.length === 0) throw new NotFoundException("Invitación no encontrada.");
      await this.audit.recordForSession(tx, {
        action: "invite.revoked",
        targetType: "invitation",
        targetId: id,
      });
    });
  }

  /** Preview público de una invitación por token (para la página de aceptación). */
  async lookup(token: string): Promise<InvitationPreview> {
    const inv = await this.validToken(token);
    const [org] = await this.admin.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, inv.organizationId))
      .limit(1);
    if (!org) throw new NotFoundException();
    const [user] = await this.admin.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, inv.email))
      .limit(1);
    return {
      email: inv.email,
      role: inv.role,
      orgName: org.displayName ?? org.name,
      needsAccount: !user,
    };
  }

  /**
   * Acepta la invitación (público). Pre-auth: usa la conexión OWNER en una tx
   * (cruza users global + membership + patient). Crea identidad si el email no
   * existe; agrega/reactiva membership; vincula la entidad paciente si aplica;
   * audita y emite sesión (auto-login).
   */
  async accept(
    dto: AcceptInvitationDto,
    userAgent?: string,
  ): Promise<IssuedSession> {
    return this.admin.db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hashToken(dto.token)))
        .limit(1);
      if (!inv || inv.status !== "pending" || inv.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException("Invitación inválida o expirada.");
      }

      // Reclamo ATÓMICO (single-use): compare-and-swap a 'accepted'. Si otro
      // accept concurrente ya la tomó, afecta 0 filas → rechazo. Evita doble sesión.
      const claimed = await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(
          and(eq(invitations.id, inv.id), eq(invitations.status, "pending")),
        )
        .returning({ id: invitations.id });
      if (claimed.length === 0) {
        throw new BadRequestException("Invitación inválida o expirada.");
      }

      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, inv.organizationId))
        .limit(1);
      if (!org) throw new BadRequestException("Organización no encontrada.");

      // Identidad: usar la existente o crearla.
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, inv.email))
        .limit(1);
      if (!user) {
        if (!dto.password || !dto.fullName) {
          throw new BadRequestException("Faltan contraseña y nombre para crear la cuenta.");
        }
        [user] = await tx
          .insert(users)
          .values({
            email: inv.email,
            hashedPassword: bcrypt.hashSync(dto.password, 10),
            fullName: dto.fullName,
          })
          .returning();
      }

      // Membership: crear o reactivar.
      const [existing] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, user!.id),
            eq(memberships.organizationId, inv.organizationId),
          ),
        )
        .limit(1);
      let membershipId: string;
      if (existing) {
        if (existing.revokedAt) {
          await tx
            .update(memberships)
            .set({ revokedAt: null, role: inv.role })
            .where(eq(memberships.id, existing.id));
          membershipId = existing.id;
        } else {
          // Ya es miembro activo: no auto-login con un link viejo.
          throw new ConflictException(
            "Ya sos miembro de esta organización. Iniciá sesión.",
          );
        }
      } else {
        const [m] = await tx
          .insert(memberships)
          .values({
            userId: user!.id,
            organizationId: inv.organizationId,
            role: inv.role,
            region: inv.region,
          })
          .returning({ id: memberships.id });
        membershipId = m!.id;
      }

      // Vidriera pública: admin/professional arrancan con un perfil (privado por
      // default). El paciente no tiene perfil público.
      if (inv.role !== "patient") {
        await ensureProfessionalProfile(tx, {
          membershipId,
          organizationId: inv.organizationId,
          region: inv.region,
          fullName: user!.fullName,
        });
      }

      // Vincular la entidad paciente con la cuenta (guard: misma org y sin vincular).
      if (inv.patientId) {
        await tx
          .update(patients)
          .set({ userId: user!.id })
          .where(
            and(
              eq(patients.id, inv.patientId),
              eq(patients.tenantId, inv.organizationId),
              isNull(patients.userId),
            ),
          );
      }

      await this.audit.record(tx, {
        organizationId: inv.organizationId,
        region: inv.region,
        actorUserId: user!.id,
        actorRole: inv.role,
        action: "invite.accepted",
        targetType: "invitation",
        targetId: inv.id,
      });

      const authOrg: AuthOrg = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        region: org.region,
      };
      return this.auth.issueFor(
        tx,
        { id: user!.id, email: user!.email, fullName: user!.fullName },
        authOrg,
        inv.role,
        userAgent,
      );
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Mapea la violación del índice único parcial (pending duplicada) a un 409. */
  private async runMappingConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23505" || err?.cause?.code === "23505") {
        throw new ConflictException(
          "Ya hay una invitación pendiente para ese email.",
        );
      }
      throw e;
    }
  }

  private ttl(): Date {
    return new Date(Date.now() + this.env.INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  private acceptUrl(slug: string, rawToken: string): string {
    const origin = this.env.WEB_ORIGIN_TEMPLATE.replace("{slug}", slug);
    return `${origin}/accept?token=${rawToken}`;
  }

  private async validToken(token: string): Promise<InvitationRow> {
    const [inv] = await this.admin.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(token)))
      .limit(1);
    if (!inv || inv.status !== "pending" || inv.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException("Invitación inválida o expirada.");
    }
    return inv;
  }
}

function toDto(inv: InvitationRow): InvitationDto {
  const expired = inv.status === "pending" && inv.expiresAt.getTime() < Date.now();
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: expired ? "expired" : inv.status,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  };
}
