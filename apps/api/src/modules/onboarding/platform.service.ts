import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  memberships,
  organizations,
  professionalProfiles,
  users,
} from "@nutreitor/db";
import type {
  LicenseDecisionDto,
  LicenseStatus,
  OrgDecisionDto,
  OrgStatus,
  PlatformLicenseEntry,
  PlatformMe,
  PlatformOrgEntry,
} from "@nutreitor/shared";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import { AuditService, type AuditAction } from "../../core/audit/audit.service.js";
import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";
import { MAIL_SENDER, type MailSender } from "../../core/mail/mail-sender.js";
import { licenseDecisionMail, orgDecisionMail } from "./onboarding-mails.js";

/** Transiciones válidas: de qué estado sale cada decisión y a cuál llega. */
const ORG_TRANSITIONS: Record<
  OrgDecisionDto["decision"],
  { from: OrgStatus[]; to: OrgStatus; action: AuditAction }
> = {
  approve: { from: ["pending_review", "rejected"], to: "active", action: "org.approved" },
  reject: { from: ["pending_review"], to: "rejected", action: "org.rejected" },
  suspend: { from: ["active", "pending_review"], to: "suspended", action: "org.suspended" },
  reactivate: { from: ["suspended"], to: "active", action: "org.reactivated" },
};

/**
 * Consola de plataforma (ADR 0025). Es plano de control: lee y decide sobre orgs de
 * TODOS los tenants con la conexión owner. Por eso su alcance es mínimo y explícito:
 * metadatos de la org, nombre/email de sus admins y la matrícula de sus
 * profesionales. Nunca datos de pacientes. Cada decisión queda en el audit de la
 * org afectada, con el operador como actor.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger("Platform");

  constructor(
    private readonly admin: AdminDbService,
    private readonly audit: AuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  async listOrgs(status?: OrgStatus): Promise<PlatformOrgEntry[]> {
    const orgs = await this.admin.db
      .select()
      .from(organizations)
      .where(status ? eq(organizations.status, status) : undefined)
      .orderBy(desc(organizations.createdAt));
    if (orgs.length === 0) return [];
    const ids = orgs.map((o) => o.id);

    const [admins, licenses] = await Promise.all([
      this.admin.db
        .select({ orgId: memberships.organizationId, fullName: users.fullName, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            inArray(memberships.organizationId, ids),
            eq(memberships.role, "admin"),
            isNull(memberships.revokedAt),
          ),
        ),
      this.licenseRows(inArray(professionalProfiles.organizationId, ids)),
    ]);

    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      region: o.region,
      kind: o.kind,
      status: o.status,
      reviewNote: o.reviewNote,
      createdAt: o.createdAt.toISOString(),
      reviewedAt: o.reviewedAt?.toISOString() ?? null,
      admins: admins.filter((a) => a.orgId === o.id).map(({ fullName, email }) => ({ fullName, email })),
      licenses: licenses.filter((l) => l.orgId === o.id),
    }));
  }

  /** Matrículas por revisar (declaradas), de cualquier org no rechazada. */
  async pendingLicenses(): Promise<PlatformLicenseEntry[]> {
    return this.licenseRows(
      and(
        eq(professionalProfiles.licenseStatus, "declared"),
        ne(organizations.status, "rejected"),
      ),
    );
  }

  async decideOrg(orgId: string, dto: OrgDecisionDto, actor: PlatformMe): Promise<PlatformOrgEntry> {
    const t = ORG_TRANSITIONS[dto.decision];
    const note = dto.note?.trim() || null;

    const org = await this.admin.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(organizations)
        .set({
          status: t.to,
          reviewNote: t.to === "active" ? null : note,
          reviewedAt: new Date(),
        })
        // CAS sobre el estado: dos operadores a la vez no pisan la decisión.
        .where(and(eq(organizations.id, orgId), inArray(organizations.status, t.from)))
        .returning();
      if (!updated) {
        const [exists] = await tx
          .select({ status: organizations.status })
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1);
        if (!exists) throw new NotFoundException("Organización no encontrada.");
        throw new ConflictException(`No se puede ${verb(dto.decision)} una organización en estado ${exists.status}.`);
      }

      // Aprobar ES revisar las matrículas que el operador tuvo a la vista.
      let reviewed = 0;
      if (dto.decision === "approve") {
        const rows = await tx
          .update(professionalProfiles)
          .set({ licenseStatus: "reviewed", licenseNote: null })
          .where(
            and(
              eq(professionalProfiles.organizationId, orgId),
              eq(professionalProfiles.licenseStatus, "declared"),
            ),
          )
          .returning({ id: professionalProfiles.id });
        reviewed = rows.length;
      }

      await this.audit.record(tx, {
        organizationId: updated.id,
        region: updated.region,
        actorUserId: actor.id,
        action: t.action,
        targetType: "organization",
        targetId: updated.id,
        metadata: { by: "platform", note, licensesReviewed: reviewed },
      });
      return updated;
    });

    await this.mailOrgAdmins(org.id, (a) =>
      orgDecisionMail({
        to: a.email,
        fullName: a.fullName,
        orgName: org.name,
        decision: dto.decision,
        note,
        link: `${this.env.WEB_ORIGIN_TEMPLATE.replace("{slug}", org.slug)}/login`,
      }),
    );

    const [entry] = await this.listOrgsById(org.id);
    return entry!;
  }

  async decideLicense(
    profileId: string,
    dto: LicenseDecisionDto,
    actor: PlatformMe,
  ): Promise<PlatformLicenseEntry> {
    const note = dto.note?.trim() || null;
    const profile = await this.admin.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(professionalProfiles)
        .set({ licenseStatus: dto.decision, licenseNote: dto.decision === "rejected" ? note : null })
        .where(
          and(eq(professionalProfiles.id, profileId), eq(professionalProfiles.licenseStatus, "declared")),
        )
        .returning();
      if (!updated) {
        throw new ConflictException("Esa matrícula no está pendiente de revisión.");
      }
      await this.audit.record(tx, {
        organizationId: updated.organizationId,
        region: updated.region,
        actorUserId: actor.id,
        action: dto.decision === "reviewed" ? "license.reviewed" : "license.rejected",
        targetType: "professional_profile",
        targetId: updated.id,
        metadata: { by: "platform", note },
      });
      return updated;
    });

    const [entry] = await this.licenseRows(eq(professionalProfiles.id, profile.id));
    if (entry) {
      await this.safeSend(() =>
        this.mail.send(
          licenseDecisionMail({
            to: entry.email,
            fullName: entry.fullName,
            orgName: entry.orgName,
            decision: dto.decision,
            note,
            link: `${this.env.WEB_ORIGIN_TEMPLATE.replace("{slug}", entry.orgSlug)}/login`,
          }),
        ),
      );
    }
    return entry!;
  }

  // ── internos ────────────────────────────────────────────────────────────────

  private async listOrgsById(id: string): Promise<PlatformOrgEntry[]> {
    const all = await this.listOrgs();
    return all.filter((o) => o.id === id);
  }

  private async licenseRows(where: ReturnType<typeof and>): Promise<PlatformLicenseEntry[]> {
    const rows = await this.admin.db
      .select({
        profileId: professionalProfiles.id,
        orgId: organizations.id,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        profileSlug: professionalProfiles.profileSlug,
        fullName: users.fullName,
        email: users.email,
        licenseNumber: professionalProfiles.licenseNumber,
        licenseJurisdiction: professionalProfiles.licenseJurisdiction,
        licenseStatus: professionalProfiles.licenseStatus,
        licenseNote: professionalProfiles.licenseNote,
      })
      .from(professionalProfiles)
      .innerJoin(memberships, eq(memberships.id, professionalProfiles.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(organizations, eq(organizations.id, professionalProfiles.organizationId))
      .where(and(where, isNull(memberships.revokedAt), ne(memberships.role, "patient")))
      .orderBy(organizations.name, users.fullName);
    return rows.map((r) => ({ ...r, licenseStatus: r.licenseStatus as LicenseStatus }));
  }

  private async mailOrgAdmins(
    orgId: string,
    build: (a: { email: string; fullName: string }) => Parameters<MailSender["send"]>[0],
  ): Promise<void> {
    const admins = await this.admin.db
      .select({ email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, orgId),
          eq(memberships.role, "admin"),
          isNull(memberships.revokedAt),
        ),
      );
    for (const a of admins) await this.safeSend(() => this.mail.send(build(a)));
  }

  /** La decisión ya quedó guardada: un mail que falla se loguea, no la deshace. */
  private async safeSend(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`No se pudo mandar el aviso: ${(err as Error).message}`);
    }
  }
}

function verb(d: OrgDecisionDto["decision"]): string {
  return { approve: "aprobar", reject: "rechazar", suspend: "suspender", reactivate: "reactivar" }[d];
}
