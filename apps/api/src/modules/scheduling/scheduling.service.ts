import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  appointments,
  availabilityRules,
  careAssignments,
  memberships,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  AppointmentDto,
  AvailabilityDto,
  BookAppointmentDto,
  RescheduleAppointmentDto,
  SetAvailabilityDto,
  SlotDto,
} from "@nutreitor/shared";
import { and, asc, eq, gt, gte, lt, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import {
  assertCanAccessPatient,
  resolvePatientAccess,
} from "../patients/patient-access.js";
import { generateSlots, type AvailabilityRuleInput } from "./slots.js";

type AppointmentRow = typeof appointments.$inferSelect;

/** Ventana por defecto de slots a futuro si el cliente no pide rango (días). */
const DEFAULT_HORIZON_DAYS = 21;

/**
 * Agendamiento (motor propio). Disponibilidad semanal del profesional + citas
 * tenant-scoped bajo RLS. Slots derivados en el huso del profesional (DST por
 * Luxon, ver slots.ts). No-overlap forzado por la DB (EXCLUDE gist) y traducido a
 * 409. Scoping: el profesional opera SOBRE LO SUYO; el paciente, con su profesional
 * asignado activo. Mutaciones auditadas.
 */
@Injectable()
export class SchedulingService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  // ── Disponibilidad (profesional dueño) ──────────────────────────────────────

  async getMyAvailability(): Promise<AvailabilityDto> {
    return this.tenantDb.run(async (tx) => {
      const membershipId = await this.requireOwnMembership(tx);
      return this.loadAvailability(tx, membershipId);
    });
  }

  /** Reemplaza la disponibilidad del profesional (borra + inserta en una tx). */
  async setMyAvailability(dto: SetAvailabilityDto): Promise<AvailabilityDto> {
    return this.tenantDb.run(async (tx) => {
      const membershipId = await this.requireOwnMembership(tx);
      const ctx = getTenantContext();
      await tx.delete(availabilityRules).where(eq(availabilityRules.membershipId, membershipId));
      if (dto.windows.length > 0) {
        await tx.insert(availabilityRules).values(
          dto.windows.map((w) => ({
            tenantId: ctx.tenantId,
            region: ctx.region,
            membershipId,
            timezone: dto.timezone,
            weekday: w.weekday,
            startMinute: w.startMinute,
            endMinute: w.endMinute,
            slotMinutes: w.slotMinutes,
          })),
        );
      }
      await this.audit.recordForSession(tx, {
        action: "availability.updated",
        targetType: "membership",
        targetId: membershipId,
        metadata: { windows: dto.windows.length, timezone: dto.timezone },
      });
      return this.loadAvailability(tx, membershipId);
    });
  }

  // ── Slots ───────────────────────────────────────────────────────────────────

  /** Slots libres del profesional de la sesión (su propia agenda). */
  async mySlots(fromISO?: string, toISO?: string): Promise<SlotDto[]> {
    return this.tenantDb.run(async (tx) => {
      const membershipId = await this.requireOwnMembership(tx);
      const { from, to } = this.range(fromISO, toISO);
      return this.computeSlots(tx, membershipId, from, to, new Date());
    });
  }

  /** Slots del profesional ASIGNADO del paciente (para reservar desde el portal). */
  async slotsForMyPatient(fromISO?: string, toISO?: string): Promise<SlotDto[]> {
    return this.tenantDb.run(async (tx) => {
      const { membershipId } = await this.resolveMyCare(tx);
      const { from, to } = this.range(fromISO, toISO);
      return this.computeSlots(tx, membershipId, from, to, new Date());
    });
  }

  // ── Citas ─────────────────────────────────────────────────────────────────────

  /** Agenda del profesional (sus citas); el admin ve todas las del tenant. */
  async listForProfessional(fromISO?: string, toISO?: string): Promise<AppointmentDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      const where: SQL[] = [];
      if (!access.isAdmin) {
        if (!access.membershipId) throw new ForbiddenException("Sin membership.");
        where.push(eq(appointments.membershipId, access.membershipId));
      }
      if (fromISO) where.push(gte(appointments.startsAt, new Date(fromISO)));
      if (toISO) where.push(lt(appointments.startsAt, new Date(toISO)));
      return this.query(tx, where.length ? and(...where) : undefined);
    });
  }

  /** El profesional reserva una cita para un paciente que tiene asignado. */
  async bookForPatient(dto: BookAppointmentDto): Promise<AppointmentDto> {
    if (!dto.patientId) throw new BadRequestException("Falta el paciente.");
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      if (!access.membershipId) throw new ForbiddenException("Sin membership.");
      await assertCanAccessPatient(tx, dto.patientId!, access);
      const slot = await this.resolveSlot(tx, access.membershipId, dto.startsAt);
      const id = await this.insertAppointment(tx, {
        patientId: dto.patientId!,
        membershipId: access.membershipId,
        slot,
        bookedVia: "professional",
        createdByMembershipId: access.membershipId,
        notes: dto.notes,
      });
      return this.toDto(tx, id);
    });
  }

  /** El paciente reserva (desde el portal) con su profesional asignado. */
  async bookAsPatient(dto: BookAppointmentDto): Promise<AppointmentDto> {
    return this.tenantDb.run(async (tx) => {
      const { patientId, membershipId } = await this.resolveMyCare(tx);
      const slot = await this.resolveSlot(tx, membershipId, dto.startsAt);
      const id = await this.insertAppointment(tx, {
        patientId,
        membershipId,
        slot,
        bookedVia: "patient",
        createdByMembershipId: null,
        notes: dto.notes,
      });
      return this.toDto(tx, id);
    });
  }

  /** Citas del paciente de la sesión (su propia agenda). */
  async myAppointments(): Promise<AppointmentDto[]> {
    return this.tenantDb.run(async (tx) => {
      const { patientId } = await this.resolveMyCare(tx);
      return this.query(tx, eq(appointments.patientId, patientId));
    });
  }

  /** Cancela una cita. Profesional/admin sobre las suyas; paciente sobre las propias. */
  async cancel(id: string, as: "professional" | "patient"): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const appt = await this.requireAccessibleAppointment(tx, id, as);
      if (appt.status !== "booked") {
        throw new ConflictException("La cita no está reservada.");
      }
      await tx.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, id));
      await this.audit.recordForSession(tx, {
        action: "appointment.cancelled",
        targetType: "appointment",
        targetId: id,
      });
    });
  }

  /** Reprograma (profesional/admin): cancela el slot actual y reserva el nuevo. */
  async reschedule(id: string, dto: RescheduleAppointmentDto): Promise<AppointmentDto> {
    return this.tenantDb.run(async (tx) => {
      const appt = await this.requireAccessibleAppointment(tx, id, "professional");
      if (appt.status !== "booked") {
        throw new ConflictException("Sólo se reprograma una cita reservada.");
      }
      // Liberar el slot actual ANTES de validar el nuevo (si no, el EXCLUDE choca
      // consigo mismo cuando el nuevo solapa al viejo del mismo profesional).
      await tx.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, id));
      const slot = await this.resolveSlot(tx, appt.membershipId, dto.startsAt);
      const newId = await this.insertAppointment(tx, {
        patientId: appt.patientId,
        membershipId: appt.membershipId,
        slot,
        bookedVia: appt.bookedVia,
        createdByMembershipId: appt.createdByMembershipId,
        notes: appt.notes ?? undefined,
      });
      await this.audit.recordForSession(tx, {
        action: "appointment.rescheduled",
        targetType: "appointment",
        targetId: newId,
        metadata: { from: id },
      });
      return this.toDto(tx, newId);
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private range(fromISO?: string, toISO?: string): { from: Date; to: Date } {
    const from = fromISO ? new Date(fromISO) : new Date();
    const to = toISO
      ? new Date(toISO)
      : new Date(from.getTime() + DEFAULT_HORIZON_DAYS * 24 * 3600 * 1000);
    return { from, to };
  }

  /** Membership activo de la sesión (el profesional que opera su propia agenda). */
  private async requireOwnMembership(tx: TenantTx): Promise<string> {
    const access = await resolvePatientAccess(tx);
    if (!access.membershipId) throw new ForbiddenException("No tenés un membership activo.");
    return access.membershipId;
  }

  /** Resuelve "mi paciente" (por userId) + su profesional con asignación ACTIVA. */
  private async resolveMyCare(tx: TenantTx): Promise<{ patientId: string; membershipId: string }> {
    const { user } = getAuth();
    const [patient] = await tx
      .select({ id: patients.id, archivedAt: patients.archivedAt })
      .from(patients)
      .where(eq(patients.userId, user.id))
      .limit(1);
    if (!patient || patient.archivedAt) {
      throw new NotFoundException("No encontramos tu ficha de paciente.");
    }
    const [care] = await tx
      .select({ membershipId: careAssignments.membershipId })
      .from(careAssignments)
      .where(
        and(
          eq(careAssignments.patientId, patient.id),
          eq(careAssignments.status, "active"),
        ),
      )
      .limit(1);
    if (!care) {
      throw new BadRequestException("Todavía no tenés un profesional asignado.");
    }
    return { patientId: patient.id, membershipId: care.membershipId };
  }

  private async loadAvailability(tx: TenantTx, membershipId: string): Promise<AvailabilityDto> {
    const rows = await tx
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.membershipId, membershipId))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute));
    return {
      timezone: rows[0]?.timezone ?? null,
      windows: rows.map((r) => ({
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        slotMinutes: r.slotMinutes,
      })),
    };
  }

  private async computeSlots(
    tx: TenantTx,
    membershipId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<SlotDto[]> {
    const rules = await tx
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.membershipId, membershipId));
    if (rules.length === 0) return [];
    const busy = await tx
      .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.membershipId, membershipId),
          eq(appointments.status, "booked"),
          lt(appointments.startsAt, to),
          gt(appointments.endsAt, from),
        ),
      );
    const ruleInputs: AvailabilityRuleInput[] = rules.map((r) => ({
      timezone: r.timezone,
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      slotMinutes: r.slotMinutes,
    }));
    return generateSlots({ rules: ruleInputs, busy, from, to, now });
  }

  /** Valida que `startsAt` sea un slot REAL, libre y futuro del profesional. */
  private async resolveSlot(tx: TenantTx, membershipId: string, startsAtISO: string): Promise<SlotDto> {
    const target = new Date(startsAtISO);
    const from = target;
    const to = new Date(target.getTime() + 24 * 3600 * 1000);
    const slots = await this.computeSlots(tx, membershipId, from, to, new Date());
    const slot = slots.find((s) => new Date(s.startsAt).getTime() === target.getTime());
    if (!slot) throw new BadRequestException("Ese horario no está disponible.");
    return slot;
  }

  private async insertAppointment(
    tx: TenantTx,
    args: {
      patientId: string;
      membershipId: string;
      slot: SlotDto;
      bookedVia: AppointmentRow["bookedVia"];
      createdByMembershipId: string | null;
      notes?: string;
    },
  ): Promise<string> {
    const ctx = getTenantContext();
    let id: string;
    try {
      const [row] = await tx
        .insert(appointments)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId: args.patientId,
          membershipId: args.membershipId,
          startsAt: new Date(args.slot.startsAt),
          endsAt: new Date(args.slot.endsAt),
          status: "booked",
          bookedVia: args.bookedVia,
          createdByMembershipId: args.createdByMembershipId,
          notes: args.notes ?? null,
        })
        .returning({ id: appointments.id });
      id = row!.id;
    } catch (e) {
      // 23P01 = exclusion_violation (EXCLUDE de no-overlap): el slot se tomó entre
      // el cálculo y el insert (carrera). 409 limpio en vez de 500.
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23P01" || err?.cause?.code === "23P01") {
        throw new ConflictException("Ese horario ya fue reservado. Probá con otro.");
      }
      throw e;
    }
    await this.audit.recordForSession(tx, {
      action: "appointment.booked",
      targetType: "appointment",
      targetId: id,
      metadata: { patientId: args.patientId, startsAt: args.slot.startsAt },
    });
    return id;
  }

  /** Carga una cita y verifica que la sesión pueda tocarla (pro/admin dueños del
   * membership; paciente dueño de la ficha). 404 si no corresponde. */
  private async requireAccessibleAppointment(
    tx: TenantTx,
    id: string,
    as: "professional" | "patient",
  ): Promise<AppointmentRow> {
    const [appt] = await tx.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    if (!appt) throw new NotFoundException();
    if (as === "patient") {
      const { patientId } = await this.resolveMyCare(tx);
      if (appt.patientId !== patientId) throw new NotFoundException();
    } else {
      const access = await resolvePatientAccess(tx);
      if (!access.isAdmin && appt.membershipId !== access.membershipId) {
        throw new NotFoundException();
      }
    }
    return appt;
  }

  private async toDto(tx: TenantTx, id: string): Promise<AppointmentDto> {
    const [row] = await this.query(tx, eq(appointments.id, id));
    return row!;
  }

  private async query(tx: TenantTx, where: SQL | undefined): Promise<AppointmentDto[]> {
    const rows = await tx
      .select({
        appt: appointments,
        patientName: patients.fullName,
        professionalName: users.fullName,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(memberships, eq(memberships.id, appointments.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)
      .orderBy(asc(appointments.startsAt));
    return rows.map((r) => toAppointmentDto(r.appt, r.patientName, r.professionalName));
  }
}

function toAppointmentDto(
  row: AppointmentRow,
  patientName: string,
  professionalName: string,
): AppointmentDto {
  return {
    id: row.id,
    patientId: row.patientId,
    patientName,
    professionalName,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000),
    status: row.status,
    bookedVia: row.bookedVia,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}
