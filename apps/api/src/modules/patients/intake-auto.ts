import { Logger } from "@nestjs/common";
import { appointments, intakeRequests, invitations, patients, type TenantTx } from "@nutreitor/db";
import { clinicalAnamnesisKeys, type AuthOrg, type MembershipRole, type Region } from "@nutreitor/shared";
import { and, eq, gt, inArray, lt } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { generateToken, hashToken } from "../../core/crypto/tokens.js";

const logger = new Logger("IntakeAuto");

/** Vencimiento provisorio: el worker lo renueva desde el envío (ADR 0043). */
const INVITE_PLACEHOLDER_DAYS = 7;

type Actor = { userId: string; role: MembershipRole };

export type AutoIntakeResult =
  | { requested: true; requestId: string; delivery: "portal" | "invitation" }
  | { requested: false; reason: AutoIntakeSkip };

export type AutoIntakeSkip =
  | "patient_unavailable"
  | "already_consulted"
  | "already_has_anamnesis"
  | "ficha_has_anamnesis"
  | "no_contact"
  | "org_not_active"
  | "error";

/**
 * Anamnesis automática antes de la primera consulta (KAN-90, ADR 0045): al asignarle
 * un profesional al deportista o al reservar un turno, se le pide la anamnesis en
 * nombre de ese profesional, salvo que ya haya tenido consulta con él, ya tenga una
 * anamnesis (pedida, enviada o revisada) o la ficha ya tenga la anamnesis cargada.
 *
 * Sin cuenta en el portal, se deja una invitación en cola (la manda el worker, como
 * las del import) y el pedido viaja dentro de ese mail. Sin cuenta ni email, no hay
 * cómo llegarle: no se pide.
 *
 * Corre en un savepoint: si algo falla, se registra y la asignación o la reserva
 * siguen como si nada. Tenant, región y actor van explícitos porque la reserva
 * pública corre sin sesión.
 */
export async function autoRequestAnamnesis(
  tx: TenantTx,
  audit: AuditService,
  args: {
    org: Pick<AuthOrg, "id" | "region" | "status">;
    patientId: string;
    membershipId: string;
    trigger: "assignment" | "booking";
    actor: Actor | null;
    now?: Date;
  },
): Promise<AutoIntakeResult> {
  try {
    return await tx.transaction((sp) => run(sp, audit, args));
  } catch (err) {
    logger.warn(`No se pudo pedir la anamnesis automática (${args.trigger}): ${(err as Error).message}`);
    return { requested: false, reason: "error" };
  }
}

async function run(
  tx: TenantTx,
  audit: AuditService,
  { org, patientId, membershipId, trigger, actor, now = new Date() }: Parameters<typeof autoRequestAnamnesis>[2],
): Promise<AutoIntakeResult> {
  const [p] = await tx.select().from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!p || p.archivedAt) return { requested: false, reason: "patient_unavailable" };

  // ¿Ya tuvo consulta con este profesional? Un turno pasado que no se canceló.
  const [past] = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientId, patientId),
        eq(appointments.membershipId, membershipId),
        lt(appointments.startsAt, now),
        inArray(appointments.status, ["booked", "completed"]),
      ),
    )
    .limit(1);
  if (past) return { requested: false, reason: "already_consulted" };

  const [existing] = await tx
    .select({ id: intakeRequests.id })
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.patientId, patientId),
        eq(intakeRequests.kind, "anamnesis"),
        inArray(intakeRequests.status, ["requested", "submitted", "reviewed"]),
      ),
    )
    .limit(1);
  if (existing) return { requested: false, reason: "already_has_anamnesis" };

  const row = p as unknown as Record<string, unknown>;
  if (clinicalAnamnesisKeys.some((k) => typeof row[k] === "string" && (row[k] as string).trim() !== "")) {
    return { requested: false, reason: "ficha_has_anamnesis" };
  }

  let delivery: "portal" | "invitation" = "portal";
  if (!p.userId) {
    if (!p.email) return { requested: false, reason: "no_contact" };
    // Las invitaciones de pacientes se habilitan con la organización aprobada (ADR 0025).
    if (org.status !== "active") return { requested: false, reason: "org_not_active" };
    delivery = "invitation";
    await ensureQueuedInvitation(tx, audit, { org, patientId, email: p.email.toLowerCase(), actor, now });
  }

  const [created] = await tx
    .insert(intakeRequests)
    .values({
      tenantId: org.id,
      region: org.region,
      patientId,
      kind: "anamnesis",
      status: "requested",
      requestedByMembershipId: membershipId,
      trigger,
      delivery,
    })
    .onConflictDoNothing()
    .returning({ id: intakeRequests.id });
  if (!created) return { requested: false, reason: "already_has_anamnesis" };

  await audit.record(tx, {
    organizationId: org.id,
    region: org.region,
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.role ?? null,
    action: "intake.requested",
    targetType: "patient",
    targetId: patientId,
    metadata: { requestId: created.id, kind: "anamnesis", trigger, delivery, membershipId },
  });
  return { requested: true, requestId: created.id, delivery };
}

/**
 * Deja una invitación al portal en cola para el worker. Si el paciente ya tiene una
 * pendiente y vigente, no se crea otra: el pedido le llega cuando entre al portal.
 * Una pendiente del mismo email para otra ficha se reemplaza, como en el alta manual
 * y en el import (una invitación pendiente por email y organización).
 */
async function ensureQueuedInvitation(
  tx: TenantTx,
  audit: AuditService,
  a: { org: { id: string; region: Region }; patientId: string; email: string; actor: Actor | null; now: Date },
): Promise<void> {
  const [pending] = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, a.org.id),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, a.now),
        eq(invitations.patientId, a.patientId),
      ),
    )
    .limit(1);
  if (pending) return;

  await tx
    .update(invitations)
    .set({ status: "revoked" })
    .where(and(eq(invitations.organizationId, a.org.id), eq(invitations.email, a.email), eq(invitations.status, "pending")));

  const [inv] = await tx
    .insert(invitations)
    .values({
      organizationId: a.org.id,
      region: a.org.region,
      email: a.email,
      role: "patient",
      // El token real lo genera el worker al mandarla (en la base sólo vive su hash).
      tokenHash: hashToken(generateToken()),
      status: "pending",
      expiresAt: new Date(a.now.getTime() + INVITE_PLACEHOLDER_DAYS * 86_400_000),
      invitedByUserId: a.actor?.userId ?? null,
      patientId: a.patientId,
      queuedAt: a.now,
    })
    .returning({ id: invitations.id });
  await audit.record(tx, {
    organizationId: a.org.id,
    region: a.org.region,
    actorUserId: a.actor?.userId ?? null,
    actorRole: a.actor?.role ?? null,
    action: "member.invited",
    targetType: "invitation",
    targetId: inv!.id,
    metadata: { role: "patient", source: "intake_auto" },
  });
}
