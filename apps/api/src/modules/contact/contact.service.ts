import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  contactRequests,
  memberships,
  patients,
  professionalProfiles,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  AcceptContactDto,
  AcceptContactResult,
  AuthOrg,
  ContactListQueryDto,
  ContactRequestDto,
  DeclineContactDto,
  ForwardContactDto,
  PublicContactDto,
  PublicContactResult,
} from "@nutreitor/shared";
import { and, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { MAIL_SENDER, type MailSender } from "../../core/mail/mail-sender.js";
import { getAuth } from "../../core/tenant/tenant-context.store.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { CareAssignmentsService } from "../patients/care-assignments.service.js";
import { resolvePatientAccess } from "../patients/patient-access.js";
import { contactDeclinedMail, contactReceivedMail } from "./contact-mails.js";

type Row = typeof contactRequests.$inferSelect;

/**
 * Solicitudes de contacto desde la vidriera (ADR 0027).
 *
 * Privacidad (mismo criterio que el chat, ADR 0024): una solicitud la ve SÓLO su
 * destinatario. Dirigida a un profesional → ese profesional (o la admin, si es ella
 * la del perfil). Dirigida al consultorio → las admins. La admin de un equipo no ve
 * las que le escribieron a un profesional.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger("Contact");

  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
    private readonly assignments: CareAssignmentsService,
    private readonly invitations: InvitationsService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  // ── público (sin sesión) ───────────────────────────────────────────────────

  /**
   * Crea la solicitud bajo `runAs(org)`. La org ya viene resuelta como ACTIVA
   * (`publicBySlug`). Nunca se ata a una ficha existente: un email no prueba nada.
   */
  async createPublic(org: AuthOrg, dto: PublicContactDto): Promise<PublicContactResult> {
    // Honeypot: un humano no ve ese campo. Se responde igual, sin guardar nada.
    if (dto.website) return { ok: true, to: org.name };

    const { membershipId, recipientName } = await this.tenantDb.runAs(org.id, async (tx) => {
      if (!dto.profileSlug) return { membershipId: null, recipientName: org.name };
      const [p] = await tx
        .select({ membershipId: professionalProfiles.membershipId, fullName: users.fullName })
        .from(professionalProfiles)
        .innerJoin(memberships, eq(memberships.id, professionalProfiles.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(professionalProfiles.profileSlug, dto.profileSlug),
            eq(professionalProfiles.isPubliclyListed, true),
            eq(professionalProfiles.licenseStatus, "reviewed"),
            isNull(memberships.revokedAt),
          ),
        )
        .limit(1);
      if (!p) throw new NotFoundException();
      return { membershipId: p.membershipId, recipientName: p.fullName };
    });

    await this.tenantDb.runAs(org.id, async (tx) => {
      const [row] = await tx
        .insert(contactRequests)
        .values({
          tenantId: org.id,
          region: org.region,
          membershipId,
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone || null,
          message: dto.message,
          consentAt: new Date(),
        })
        .returning({ id: contactRequests.id });
      await this.audit.record(tx, {
        organizationId: org.id,
        region: org.region,
        action: "contact.received",
        targetType: "contact_request",
        targetId: row!.id,
        metadata: { toProfessional: !!membershipId },
      });
    });

    // Acuse al visitante (sin repetir lo que escribió). Un fallo no rompe la solicitud.
    try {
      await this.mail.send(contactReceivedMail({ to: dto.email, fullName: dto.fullName, recipientName, orgName: org.name }));
    } catch (err) {
      this.logger.warn(`No se pudo mandar el acuse: ${(err as Error).message}`);
    }
    return { ok: true, to: recipientName };
  }

  // ── bandeja (con sesión) ───────────────────────────────────────────────────

  list(q: ContactListQueryDto): Promise<ContactRequestDto[]> {
    return this.tenantDb.run(async (tx) => {
      const visible = await this.visibleTo(tx);
      const recipient = alias(memberships, "recipient");
      const recipientUser = alias(users, "recipient_user");
      const decider = alias(memberships, "decider");
      const deciderUser = alias(users, "decider_user");
      const rows = await tx
        .select({
          r: contactRequests,
          recipientName: recipientUser.fullName,
          decidedByName: deciderUser.fullName,
        })
        .from(contactRequests)
        .leftJoin(recipient, eq(recipient.id, contactRequests.membershipId))
        .leftJoin(recipientUser, eq(recipientUser.id, recipient.userId))
        .leftJoin(decider, eq(decider.id, contactRequests.decidedByMembershipId))
        .leftJoin(deciderUser, eq(deciderUser.id, decider.userId))
        .where(and(visible, eq(contactRequests.status, q.status)))
        .orderBy(desc(contactRequests.createdAt))
        .limit(200);
      return rows.map(({ r, recipientName, decidedByName }) => toDto(r, recipientName, decidedByName));
    });
  }

  /** Nuevas sin responder (el contador del menú). */
  count(): Promise<{ new: number }> {
    return this.tenantDb.run(async (tx) => {
      const visible = await this.visibleTo(tx);
      const [r] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(contactRequests)
        .where(and(visible, eq(contactRequests.status, "new")));
      return { new: r?.n ?? 0 };
    });
  }

  /**
   * Aceptar: en una transacción crea la ficha (con los datos de contacto y el motivo
   * como "motivo de consulta"), la asigna y cierra la solicitud. Después, fuera de la
   * tx, invita al portal: si la invitación falla, la ficha queda igual y se informa.
   */
  async accept(id: string, dto: AcceptContactDto): Promise<AcceptContactResult> {
    const { user, org } = getAuth();
    const result = await this.tenantDb.run(async (tx) => {
      const { membershipId: me } = await resolvePatientAccess(tx);
      const req = await this.lockOpen(tx, id);

      // A quién queda asignada la ficha.
      let assignee: string;
      if (user.role === "admin" && req.membershipId === null) {
        // Del consultorio: la admin elige (en una org individual, es ella).
        const chosen = dto.assignToMembershipId ?? (org.kind === "individual" ? me : null);
        if (!chosen) throw new BadRequestException("Elegí a qué profesional se la asignás.");
        await assertTeamMember(tx, chosen);
        assignee = chosen;
      } else {
        // Dirigida a quien acepta (sólo el destinatario la ve): queda para él.
        assignee = me!;
      }

      const [p] = await tx
        .insert(patients)
        .values({
          tenantId: req.tenantId,
          region: req.region,
          fullName: req.fullName,
          email: req.email,
          phone: req.phone,
          reasonForConsult: req.message,
        })
        .returning({ id: patients.id });
      await this.assignments.assignInTx(tx, p!.id, { membershipId: assignee, locationId: null });
      await tx
        .update(contactRequests)
        .set({ status: "accepted", patientId: p!.id, decidedByMembershipId: me, decidedAt: new Date() })
        .where(eq(contactRequests.id, req.id));
      await this.audit.recordForSession(tx, { action: "patient.created", targetType: "patient", targetId: p!.id, metadata: { from: "contact_request" } });
      await this.audit.recordForSession(tx, { action: "contact.accepted", targetType: "contact_request", targetId: req.id });
      return { patientId: p!.id, email: req.email };
    });

    if (!dto.invite) return { patientId: result.patientId, invited: false, inviteError: null };
    try {
      await this.invitations.create({ email: result.email, role: "patient", patientId: result.patientId });
      return { patientId: result.patientId, invited: true, inviteError: null };
    } catch (err) {
      return { patientId: result.patientId, invited: false, inviteError: (err as Error).message };
    }
  }

  /** Rechazar: la nota queda interna; al visitante le llega un mail amable genérico. */
  async decline(id: string, dto: DeclineContactDto): Promise<void> {
    const { org } = getAuth();
    const req = await this.tenantDb.run(async (tx) => {
      const { membershipId: me } = await resolvePatientAccess(tx);
      const r = await this.lockOpen(tx, id);
      await tx
        .update(contactRequests)
        .set({ status: "declined", decisionNote: dto.note || null, decidedByMembershipId: me, decidedAt: new Date() })
        .where(eq(contactRequests.id, r.id));
      await this.audit.recordForSession(tx, { action: "contact.declined", targetType: "contact_request", targetId: r.id });
      return r;
    });
    try {
      await this.mail.send(contactDeclinedMail({ to: req.email, fullName: req.fullName, orgName: org.name }));
    } catch (err) {
      this.logger.warn(`No se pudo avisar el rechazo: ${(err as Error).message}`);
    }
  }

  /** Derivar (admin): una consulta del consultorio pasa a un profesional, que la ve él. */
  forward(id: string, dto: ForwardContactDto): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const { user } = getAuth();
      const r = await this.lockOpen(tx, id);
      if (user.role !== "admin" || r.membershipId !== null) {
        throw new ConflictException("Sólo se derivan las consultas dirigidas al consultorio.");
      }
      await assertTeamMember(tx, dto.membershipId);
      await tx.update(contactRequests).set({ membershipId: dto.membershipId }).where(eq(contactRequests.id, r.id));
      await this.audit.recordForSession(tx, {
        action: "contact.forwarded",
        targetType: "contact_request",
        targetId: r.id,
        metadata: { to: dto.membershipId },
      });
    });
  }

  // ── internos ───────────────────────────────────────────────────────────────

  /** Filtro de visibilidad: destinatario directo, o las admins si es del consultorio. */
  private async visibleTo(tx: TenantTx): Promise<SQL> {
    const { user } = getAuth();
    const { membershipId } = await resolvePatientAccess(tx);
    if (!membershipId) throw new NotFoundException();
    const mine = eq(contactRequests.membershipId, membershipId);
    return user.role === "admin" ? or(mine, isNull(contactRequests.membershipId))! : mine;
  }

  /** La solicitud abierta y visible, bloqueada (dos respuestas a la vez no se pisan). */
  private async lockOpen(tx: TenantTx, id: string): Promise<Row> {
    const visible = await this.visibleTo(tx);
    const [r] = await tx
      .select()
      .from(contactRequests)
      .where(and(eq(contactRequests.id, id), visible))
      .for("update")
      .limit(1);
    if (!r) throw new NotFoundException();
    if (r.status !== "new") throw new ConflictException("Esta solicitud ya fue respondida.");
    return r;
  }
}

/** Debe ser alguien del equipo que atiende (no un paciente) y estar activo. */
async function assertTeamMember(tx: TenantTx, membershipId: string): Promise<void> {
  const [m] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), ne(memberships.role, "patient"), isNull(memberships.revokedAt)))
    .limit(1);
  if (!m) throw new BadRequestException("Ese profesional no está en el equipo.");
}

function toDto(r: Row, recipientName: string | null, decidedByName: string | null): ContactRequestDto {
  return {
    id: r.id,
    membershipId: r.membershipId,
    recipientName,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    message: r.message,
    status: r.status,
    patientId: r.patientId,
    decidedByName,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  };
}
