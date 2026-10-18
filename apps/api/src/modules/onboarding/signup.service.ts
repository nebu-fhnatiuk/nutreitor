import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  memberships,
  orgSignups,
  organizations,
  professionalProfiles,
  users,
} from "@nutreitor/db";
import {
  orgSlugSchema,
  type ConfirmOrgSignupDto,
  type OrgSignupCompleted,
  type OrgSignupDto,
  type OrgSignupPreview,
  type SlugAvailability,
} from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { generateToken, hashToken } from "../../core/crypto/tokens.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";
import { MAIL_SENDER, type MailSender } from "../../core/mail/mail-sender.js";
import { ensureProfessionalProfile } from "../professionals/profile-provisioning.js";
import { orgSignupMail, platformNewOrgMail } from "./onboarding-mails.js";

/**
 * Alta autoservicio de organizaciones (ADR 0025), en el dominio raíz y sin sesión.
 *
 *  1. `start`: valida, guarda la solicitud (token hasheado) y manda el link. Nada
 *     se crea todavía: el email no está probado.
 *  2. `confirm`: el link prueba el email. En UNA transacción (owner): reclama la
 *     solicitud (un solo uso), crea o reusa el usuario, crea la org en
 *     `pending_review`, la membresía admin y el perfil con la matrícula declarada.
 *
 * Todo es plano de control (conexión owner): todavía no hay tenant que fijar.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger("Signup");

  constructor(
    private readonly admin: AdminDbService,
    private readonly audit: AuditService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** ¿La dirección está libre? Público: los slugs se ven en la URL de todos modos. */
  async slugAvailability(raw: string): Promise<SlugAvailability> {
    const parsed = orgSlugSchema.safeParse(raw);
    if (!parsed.success) {
      return { slug: raw, available: false, reason: parsed.error.issues[0]?.message };
    }
    const slug = parsed.data;
    const taken = await this.slugTaken(slug);
    return taken
      ? { slug, available: false, reason: "Esa dirección ya está tomada." }
      : { slug, available: true };
  }

  async start(dto: OrgSignupDto): Promise<void> {
    if (await this.slugTaken(dto.slug)) {
      throw new ConflictException("Esa dirección ya está tomada.");
    }
    const raw = generateToken();
    await this.admin.db.insert(orgSignups).values({
      email: dto.email,
      fullName: dto.fullName,
      orgName: dto.orgName,
      slug: dto.slug,
      region: dto.region,
      kind: dto.kind,
      licenseNumber: dto.licenseNumber ?? null,
      licenseJurisdiction: dto.licenseJurisdiction ?? null,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + this.env.SIGNUP_TTL_HOURS * 60 * 60 * 1000),
    });
    // Mismo mail haya o no cuenta con ese email: la respuesta no revela nada.
    await this.mail.send(
      orgSignupMail({
        to: dto.email,
        fullName: dto.fullName,
        orgName: dto.orgName,
        link: `${this.env.WEB_ROOT_ORIGIN}/registro/confirmar?token=${raw}`,
        hours: this.env.SIGNUP_TTL_HOURS,
      }),
    );
  }

  async lookup(token: string | undefined): Promise<OrgSignupPreview> {
    if (!token) throw new BadRequestException("Falta el token.");
    const [s] = await this.admin.db
      .select()
      .from(orgSignups)
      .where(this.openSignup(token))
      .limit(1);
    if (!s) throw invalidLink();
    const [existing] = await this.admin.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, s.email))
      .limit(1);
    return {
      email: s.email,
      fullName: s.fullName,
      orgName: s.orgName,
      slug: s.slug,
      kind: s.kind,
      needsAccount: !existing,
    };
  }

  async confirm(dto: ConfirmOrgSignupDto): Promise<OrgSignupCompleted> {
    const result = await this.mapSlugConflict(() =>
      this.admin.db.transaction(async (tx) => {
        // Reclamo atómico (un solo uso): sólo una confirmación concurrente gana.
        const [s] = await tx
          .update(orgSignups)
          .set({ completedAt: new Date() })
          .where(this.openSignup(dto.token))
          .returning();
        if (!s) throw invalidLink();

        const [taken] = await tx
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.slug, s.slug))
          .limit(1);
        if (taken) {
          throw new ConflictException(
            "Mientras confirmabas, otra organización tomó esa dirección. Registrate de nuevo con otra.",
          );
        }

        // Identidad: el link probó el email. Si ya hay cuenta se reusa (como en las
        // invitaciones); si no, hace falta la contraseña.
        let [user] = await tx
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(eq(users.email, s.email))
          .limit(1);
        if (!user) {
          if (!dto.password) throw new BadRequestException("Elegí una contraseña.");
          [user] = await tx
            .insert(users)
            .values({
              email: s.email,
              fullName: s.fullName,
              hashedPassword: bcrypt.hashSync(dto.password, 10),
            })
            .returning({ id: users.id, fullName: users.fullName });
        }

        const [org] = await tx
          .insert(organizations)
          .values({
            name: s.orgName,
            slug: s.slug,
            region: s.region,
            kind: s.kind,
            status: "pending_review",
          })
          .returning();

        const [m] = await tx
          .insert(memberships)
          .values({ userId: user!.id, organizationId: org!.id, role: "admin", region: org!.region })
          .returning({ id: memberships.id });

        const profile = await ensureProfessionalProfile(tx, {
          membershipId: m!.id,
          organizationId: org!.id,
          region: org!.region,
          fullName: user!.fullName,
        });
        if (s.licenseNumber) {
          // El trigger la deja en `declared`: la plataforma la revisa al aprobar.
          await tx
            .update(professionalProfiles)
            .set({
              licenseNumber: s.licenseNumber,
              licenseJurisdiction: s.licenseJurisdiction,
            })
            .where(eq(professionalProfiles.id, profile.id));
        }

        await tx
          .update(orgSignups)
          .set({ organizationId: org!.id })
          .where(eq(orgSignups.id, s.id));

        await this.audit.record(tx, {
          organizationId: org!.id,
          region: org!.region,
          actorUserId: user!.id,
          actorRole: "admin",
          action: "org.signed_up",
          targetType: "organization",
          targetId: org!.id,
          metadata: { kind: s.kind, licenseDeclared: !!s.licenseNumber },
        });

        return { org: org!, email: s.email };
      }),
    );

    await this.notifyPlatform(result.org.name, result.org.slug, result.org.kind);

    const origin = this.env.WEB_ORIGIN_TEMPLATE.replace("{slug}", result.org.slug);
    return {
      slug: result.org.slug,
      loginUrl: `${origin}/login?email=${encodeURIComponent(result.email)}&nueva=1`,
    };
  }

  // ── internos ────────────────────────────────────────────────────────────────

  /** Solicitud vigente para el token: no usada y no vencida. */
  private openSignup(token: string) {
    return and(
      eq(orgSignups.tokenHash, hashToken(token)),
      isNull(orgSignups.completedAt),
      gt(orgSignups.expiresAt, new Date()),
    );
  }

  private async slugTaken(slug: string): Promise<boolean> {
    const [row] = await this.admin.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    return !!row;
  }

  /** Aviso a los operadores: hay una org para revisar. Un fallo acá no rompe el alta. */
  private async notifyPlatform(orgName: string, slug: string, kind: string): Promise<void> {
    try {
      const operators = await this.admin.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.isPlatformAdmin, true));
      for (const op of operators) {
        await this.mail.send(
          platformNewOrgMail({
            to: op.email,
            orgName,
            slug,
            kind,
            link: `${this.env.WEB_ROOT_ORIGIN}/plataforma`,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar a la plataforma: ${(err as Error).message}`);
    }
  }

  /** Dos altas con el mismo slug en carrera: el UNIQUE decide, se responde 409. */
  private async mapSlugConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23505" || err?.cause?.code === "23505") {
        throw new ConflictException("Esa dirección ya está tomada.");
      }
      throw e;
    }
  }
}

const invalidLink = () =>
  new BadRequestException("El link es inválido o venció. Registrate de nuevo.");
