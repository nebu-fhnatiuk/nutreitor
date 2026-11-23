import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  careAssignments,
  memberships,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type { AssignCareDto, CareAssignmentDto } from "@nutreitor/shared";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { autoRequestAnamnesis } from "./intake-auto.js";
import {
  assertCanAccessPatient,
  assertLocationInTenant,
  resolvePatientAccess,
} from "./patient-access.js";

/**
 * Asignaciones de cuidado (paciente↔profesional), M:N y VERSIONADAS. La lógica de
 * versionado vive acá, en un solo lugar: abrir = insertar active; cerrar = endedAt
 * + status 'ended' (nunca DELETE). El unique parcial en DB impide dos activas para
 * el mismo par. Sólo el admin opera estas rutas (capability patient:assign).
 */
@Injectable()
export class CareAssignmentsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Asigna un profesional a un paciente (tx propia). */
  async assign(patientId: string, dto: AssignCareDto): Promise<CareAssignmentDto> {
    return this.tenantDb.run((tx) => this.assignInTx(tx, patientId, dto));
  }

  /**
   * Asigna dentro de una tx existente (lo usa el atajo crear-y-asignar). MISMA
   * lógica que la reasignación: no se duplica en ningún lado.
   */
  async assignInTx(
    tx: TenantTx,
    patientId: string,
    dto: AssignCareDto,
    opts: { autoIntake?: boolean } = {},
  ): Promise<CareAssignmentDto> {
    // El paciente debe existir en el tenant (RLS ya acota). 404 si no.
    const [patient] = await tx
      .select({ id: patients.id, archivedAt: patients.archivedAt })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    if (!patient) throw new NotFoundException("Paciente no encontrado.");
    // No se asigna sobre un paciente archivado (reabrir requiere restaurarlo).
    if (patient.archivedAt) {
      throw new ConflictException("El paciente está archivado.");
    }

    // El profesional asignado debe ser un membership ACTIVO y no-paciente.
    const [target] = await tx
      .select({ id: memberships.id, role: memberships.role, revokedAt: memberships.revokedAt })
      .from(memberships)
      .where(eq(memberships.id, dto.membershipId))
      .limit(1);
    if (!target || target.revokedAt) {
      throw new BadRequestException("El profesional no es un miembro activo.");
    }
    if (target.role === "patient") {
      throw new BadRequestException("No se puede asignar a un paciente como profesional.");
    }
    // El cuerpo técnico no atiende: ve su plantel desde /equipo, sin ficha (KAN-109).
    if (target.role === "coach") {
      throw new BadRequestException("El cuerpo técnico no se asigna a deportistas: se le asignan planteles.");
    }

    await assertLocationInTenant(tx, dto.locationId);

    const access = await resolvePatientAccess(tx);
    // Trazabilidad: no se registra una asignación sin saber quién la hizo.
    if (!access.membershipId) {
      throw new ForbiddenException("No tenés un membership activo para asignar.");
    }
    const ctx = getTenantContext();

    let inserted;
    try {
      [inserted] = await tx
        .insert(careAssignments)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId,
          membershipId: dto.membershipId,
          locationId: dto.locationId ?? null,
          status: "active",
          assignedByMembershipId: access.membershipId,
        })
        .returning();
    } catch (e) {
      // Unique parcial (patient, membership) WHERE active → ya está asignado.
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23505" || err?.cause?.code === "23505") {
        throw new ConflictException("Ese profesional ya está asignado al paciente.");
      }
      throw e;
    }

    await this.audit.recordForSession(tx, {
      action: "patient.assigned",
      targetType: "patient",
      targetId: patientId,
      metadata: { assignmentId: inserted!.id, membershipId: dto.membershipId },
    });

    // Antes de la primera consulta, la anamnesis le llega sola (KAN-90).
    if (opts.autoIntake !== false) {
      const { user, org } = getAuth();
      await autoRequestAnamnesis(tx, this.audit, {
        org,
        patientId,
        membershipId: dto.membershipId,
        trigger: "assignment",
        actor: { userId: user.id, role: user.role },
      });
    }

    return this.toDto(tx, inserted!.id);
  }

  /** Cierra una asignación vigente (versionado: status ended + endedAt). */
  async endAssignment(patientId: string, assignmentId: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const [a] = await tx
        .select({ id: careAssignments.id, status: careAssignments.status })
        .from(careAssignments)
        .where(
          and(
            eq(careAssignments.id, assignmentId),
            eq(careAssignments.patientId, patientId),
          ),
        )
        .limit(1);
      if (!a) throw new NotFoundException("Asignación no encontrada.");
      if (a.status === "ended") {
        throw new BadRequestException("La asignación ya está cerrada.");
      }
      await tx
        .update(careAssignments)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(careAssignments.id, assignmentId));
      await this.audit.recordForSession(tx, {
        action: "patient.assignment_ended",
        targetType: "patient",
        targetId: patientId,
        metadata: { assignmentId },
      });
    });
  }

  /** Historial completo de asignaciones de un paciente (activas primero). */
  async listAssignments(patientId: string): Promise<CareAssignmentDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      return this.listInTx(tx, patientId);
    });
  }

  /** Igual que listAssignments pero dentro de una tx existente (para la ficha). */
  listInTx(tx: TenantTx, patientId: string): Promise<CareAssignmentDto[]> {
    return this.queryAssignments(tx, eq(careAssignments.patientId, patientId));
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async toDto(tx: TenantTx, assignmentId: string): Promise<CareAssignmentDto> {
    const [row] = await this.queryAssignments(
      tx,
      eq(careAssignments.id, assignmentId),
    );
    return row!;
  }

  private async queryAssignments(
    tx: TenantTx,
    where: SQL,
  ): Promise<CareAssignmentDto[]> {
    const rows = await tx
      .select({
        id: careAssignments.id,
        membershipId: careAssignments.membershipId,
        professionalName: users.fullName,
        status: careAssignments.status,
        assignedAt: careAssignments.assignedAt,
        endedAt: careAssignments.endedAt,
      })
      .from(careAssignments)
      .innerJoin(memberships, eq(memberships.id, careAssignments.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)
      // 'active' < 'ended' alfabético → asc deja las activas primero.
      .orderBy(asc(careAssignments.status), desc(careAssignments.assignedAt));
    return rows.map((r) => ({
      id: r.id,
      membershipId: r.membershipId,
      professionalName: r.professionalName,
      status: r.status,
      assignedAt: r.assignedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    }));
  }
}
