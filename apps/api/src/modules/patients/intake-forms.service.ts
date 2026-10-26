import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { foodFrequencySurveys, intakeRequests, memberships, patients, users, type IntakeRequestRow, type TenantTx } from "@nutreitor/db";
import {
  anamnesisFichaKeys,
  clinicalAnamnesisKeys,
  hasCapability,
  sportProfileKeys,
  submitAnamnesisSchema,
  submitFoodFrequencySchema,
  type AnamnesisKey,
  type FieldSources,
  type IntakeRequestDto,
  type PortalIntakeDto,
  type RequestIntakeDto,
  type ReviewIntakeDto,
  type SportProfile,
} from "@nutreitor/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

const requester = alias(memberships, "requester");
const requesterUser = alias(users, "requester_user");
const reviewer = alias(memberships, "reviewer");
const reviewerUser = alias(users, "reviewer_user");

const isFicha = (k: AnamnesisKey): k is (typeof anamnesisFichaKeys)[number] => (anamnesisFichaKeys as readonly string[]).includes(k);
const isSport = (k: AnamnesisKey): k is (typeof sportProfileKeys)[number] => (sportProfileKeys as readonly string[]).includes(k);

/**
 * Formularios previos a la consulta (KAN-60, ADR 0045). El profesional pide, el
 * deportista completa desde el portal y el profesional revisa campo por campo qué
 * pasa a la ficha. Las respuestas quedan en el pedido aunque no se apliquen.
 */
@Injectable()
export class IntakeFormsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  // ── Profesional ────────────────────────────────────────────────────────────

  list(patientId: string): Promise<IntakeRequestDto[]> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      return this.query(tx, eq(intakeRequests.patientId, patientId));
    });
  }

  request(patientId: string, dto: RequestIntakeDto): Promise<IntakeRequestDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const [p] = await tx
        .select({ userId: patients.userId, archivedAt: patients.archivedAt })
        .from(patients)
        .where(eq(patients.id, patientId))
        .limit(1);
      if (!p) throw new NotFoundException();
      if (p.archivedAt) throw new ConflictException("El deportista está archivado.");
      if (!p.userId) {
        throw new ConflictException("Todavía no tiene cuenta en el portal: invitalo primero para que pueda completar el formulario.");
      }
      const ctx = this.tenantDb.context;
      let row: IntakeRequestRow | undefined;
      try {
        [row] = await tx
          .insert(intakeRequests)
          .values({
            tenantId: ctx.tenantId,
            region: ctx.region,
            patientId,
            kind: dto.kind,
            requestedByMembershipId: access.membershipId!,
            message: dto.message || null,
          })
          .returning();
      } catch (e) {
        const err = e as { code?: string; cause?: { code?: string } };
        if (err?.code === "23505" || err?.cause?.code === "23505") {
          throw new ConflictException("Ya hay un pedido abierto de ese formulario.");
        }
        throw e;
      }
      await this.audit.recordForSession(tx, {
        action: "intake.requested",
        targetType: "patient",
        targetId: patientId,
        metadata: { requestId: row!.id, kind: dto.kind },
      });
      return (await this.query(tx, eq(intakeRequests.id, row!.id)))[0]!;
    });
  }

  cancel(patientId: string, id: string): Promise<IntakeRequestDto> {
    return this.tenantDb.run(async (tx) => {
      await assertCanAccessPatient(tx, patientId, await resolvePatientAccess(tx));
      const r = await this.load(tx, patientId, id);
      if (r.status !== "requested" && r.status !== "submitted") throw new ConflictException("Ese pedido ya está cerrado.");
      await tx.update(intakeRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(intakeRequests.id, id));
      await this.audit.recordForSession(tx, { action: "intake.cancelled", targetType: "patient", targetId: patientId, metadata: { requestId: id } });
      return (await this.query(tx, eq(intakeRequests.id, id)))[0]!;
    });
  }

  /**
   * Revisión: en la anamnesis pasan a la ficha sólo los campos elegidos (y quedan
   * marcados como autorreportados); en la frecuencia de consumo, `accept` la guarda
   * como encuesta autorreportada. En ambos casos el pedido queda revisado.
   */
  review(patientId: string, id: string, dto: ReviewIntakeDto): Promise<IntakeRequestDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const r = await this.load(tx, patientId, id);
      if (r.status !== "submitted") throw new ConflictException("Ese formulario todavía no fue enviado o ya se revisó.");
      const { user } = getAuth();
      const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, user.id)).limit(1);
      const now = new Date();
      let applied: IntakeRequestDto["applied"] = null;

      if (r.kind === "anamnesis") {
        const answers = (r.answers ?? {}) as Record<string, unknown>;
        const fields = [...new Set(dto.fields)].filter((k) => answers[k] !== undefined && answers[k] !== null && answers[k] !== "");
        if (!hasCapability(user.role, "patient:read_clinical") && fields.some((k) => clinicalAnamnesisKeys.includes(k))) {
          throw new BadRequestException("No podés pasar datos clínicos a la ficha.");
        }
        if (fields.length) {
          const [p] = await tx
            .select({ sportProfile: patients.sportProfile, fieldSources: patients.fieldSources })
            .from(patients)
            .where(eq(patients.id, patientId))
            .limit(1);
          const patch: Record<string, unknown> = {};
          const sport: SportProfile = { ...((p?.sportProfile as SportProfile | null) ?? {}) };
          const sources: FieldSources = { ...((p?.fieldSources as FieldSources | null) ?? {}) };
          for (const k of fields) {
            if (isFicha(k)) patch[k] = answers[k];
            else if (isSport(k)) (sport as Record<string, unknown>)[k] = answers[k];
            sources[k] = { source: "self_reported", requestId: id, reviewedBy: me?.name ?? "", at: now.toISOString() };
          }
          await tx
            .update(patients)
            .set({ ...patch, ...(fields.some(isSport) ? { sportProfile: sport } : {}), fieldSources: sources, updatedAt: now })
            .where(eq(patients.id, patientId));
          await this.audit.recordForSession(tx, {
            action: "patient.updated",
            targetType: "patient",
            targetId: patientId,
            metadata: { fields, source: "intake", requestId: id },
          });
        }
        applied = { fields };
      } else if (dto.accept) {
        const parsed = submitFoodFrequencySchema.parse({ answers: r.answers });
        const [survey] = await tx
          .insert(foodFrequencySurveys)
          .values({
            tenantId: r.tenantId,
            region: r.region,
            patientId,
            recordedByMembershipId: access.membershipId!,
            answeredOn: (r.submittedAt ?? now).toISOString().slice(0, 10),
            answers: parsed.answers,
            note: "Autorreportada desde el portal.",
            source: "self_reported",
          })
          .returning({ id: foodFrequencySurveys.id });
        await this.audit.recordForSession(tx, {
          action: "food_frequency.recorded",
          targetType: "patient",
          targetId: patientId,
          metadata: { surveyId: survey!.id, source: "self_reported", requestId: id },
        });
        applied = { surveyId: survey!.id };
      }

      await tx
        .update(intakeRequests)
        .set({ status: "reviewed", reviewedByMembershipId: access.membershipId, reviewedAt: now, applied, updatedAt: now })
        .where(eq(intakeRequests.id, id));
      await this.audit.recordForSession(tx, { action: "intake.reviewed", targetType: "patient", targetId: patientId, metadata: { requestId: id, applied } });
      return (await this.query(tx, eq(intakeRequests.id, id)))[0]!;
    });
  }

  // ── Deportista (portal) ────────────────────────────────────────────────────

  /** Pedidos abiertos del deportista (para completar) y los enviados (esperan revisión). */
  mine(): Promise<PortalIntakeDto[]> {
    return this.tenantDb.run(async (tx) => {
      const patientId = await myPatientId(tx);
      const rows = await this.query(tx, and(eq(intakeRequests.patientId, patientId), inArray(intakeRequests.status, ["requested", "submitted"]))!);
      return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, message: r.message, requestedByName: r.requestedByName, createdAt: r.createdAt }));
    });
  }

  submit(id: string, body: unknown): Promise<PortalIntakeDto> {
    return this.tenantDb.run(async (tx) => {
      const patientId = await myPatientId(tx);
      const r = await this.load(tx, patientId, id);
      if (r.status !== "requested") throw new ConflictException("Este formulario ya fue enviado.");
      const parsed = r.kind === "anamnesis" ? submitAnamnesisSchema.safeParse(body) : submitFoodFrequencySchema.safeParse(body);
      if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Revisá las respuestas.");
      // Sin vacíos: lo que no respondió no se guarda (no pisa nada al revisar).
      const answers = Object.fromEntries(Object.entries(parsed.data.answers).filter(([, v]) => v !== null && v !== undefined && v !== ""));
      const now = new Date();
      await tx
        .update(intakeRequests)
        .set({ answers, status: "submitted", submittedAt: now, updatedAt: now })
        .where(eq(intakeRequests.id, id));
      await this.audit.recordForSession(tx, { action: "intake.submitted", targetType: "patient", targetId: patientId, metadata: { requestId: id, kind: r.kind } });
      const [dto] = await this.query(tx, eq(intakeRequests.id, id));
      return { id, kind: dto!.kind, status: dto!.status, message: dto!.message, requestedByName: dto!.requestedByName, createdAt: dto!.createdAt };
    });
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async load(tx: TenantTx, patientId: string, id: string): Promise<IntakeRequestRow> {
    const [r] = await tx
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.patientId, patientId)))
      .limit(1);
    if (!r) throw new NotFoundException("No existe ese formulario.");
    return r;
  }

  private async query(tx: TenantTx, where: ReturnType<typeof eq>): Promise<IntakeRequestDto[]> {
    const { user } = getAuth();
    const canClinical = hasCapability(user.role, "patient:read_clinical") || user.role === "patient";
    const rows = await tx
      .select({ r: intakeRequests, requestedByName: requesterUser.fullName, reviewedByName: reviewerUser.fullName })
      .from(intakeRequests)
      .innerJoin(requester, eq(requester.id, intakeRequests.requestedByMembershipId))
      .innerJoin(requesterUser, eq(requesterUser.id, requester.userId))
      .leftJoin(reviewer, eq(reviewer.id, intakeRequests.reviewedByMembershipId))
      .leftJoin(reviewerUser, eq(reviewerUser.id, reviewer.userId))
      .where(where)
      .orderBy(desc(intakeRequests.createdAt));
    return rows.map(({ r, requestedByName, reviewedByName }) => ({
      id: r.id,
      patientId: r.patientId,
      kind: r.kind,
      status: r.status,
      message: r.message,
      answers: r.answers
        ? Object.fromEntries(
            Object.entries(r.answers as Record<string, unknown>).filter(
              ([k]) => r.kind !== "anamnesis" || canClinical || !clinicalAnamnesisKeys.includes(k as AnamnesisKey),
            ),
          )
        : null,
      requestedByName,
      createdAt: r.createdAt.toISOString(),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      reviewedByName: reviewedByName ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      applied: (r.applied as IntakeRequestDto["applied"]) ?? null,
    }));
  }
}

async function myPatientId(tx: TenantTx): Promise<string> {
  const { user } = getAuth();
  const [p] = await tx.select({ id: patients.id, archivedAt: patients.archivedAt }).from(patients).where(eq(patients.userId, user.id)).limit(1);
  if (!p || p.archivedAt) throw new NotFoundException("No encontramos tu ficha.");
  return p.id;
}
