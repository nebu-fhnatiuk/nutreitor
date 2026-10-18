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
  professionalProfiles,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  AppointmentDto,
  AuthOrg,
  AvailabilityDto,
  BookAppointmentDto,
  PublicBookAppointmentDto,
  PublicBookingResult,
  RescheduleAppointmentDto,
  SetAvailabilityDto,
  SlotDto,
} from "@nutreitor/shared";
import { and, asc, eq, gt, gte, isNull, lt, type SQL } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import {
  assertCanAccessPatient,
  resolvePatientAccess,
} from "../patients/patient-access.js";
import { generateSlots, isValidTimezone, type AvailabilityRuleInput } from "./slots.js";

type AppointmentRow = typeof appointments.$inferSelect;

/** Ventana por defecto de slots a futuro si el cliente no pide rango (días). */
const DEFAULT_HORIZON_DAYS = 21;
/**
 * Tope DURO del cálculo de slots: nunca más allá de now + N días. El rango viene
 * del cliente (incluida la ruta pública, sin sesión) y generateSlots itera día por
 * día: sin tope, `from=1970&to=9999` bloquea el event loop. También acota hasta
 * dónde se puede reservar.
 */
const MAX_HORIZON_DAYS = 180;
const DAY_MS = 24 * 3600 * 1000;

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
    if (!isValidTimezone(dto.timezone)) {
      throw new BadRequestException("Zona horaria inválida (usá un huso IANA, ej. America/Argentina/Buenos_Aires).");
    }
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
      if (fromISO) where.push(gte(appointments.startsAt, parseDate(fromISO, "from")));
      if (toISO) where.push(lt(appointments.startsAt, parseDate(toISO, "to")));
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
      const ctx = getTenantContext();
      const slot = await this.resolveSlot(tx, access.membershipId, dto.startsAt);
      const id = await this.insertAppointment(tx, {
        tenantId: ctx.tenantId,
        region: ctx.region,
        patientId: dto.patientId!,
        membershipId: access.membershipId,
        slot,
        bookedVia: "professional",
        createdByMembershipId: access.membershipId,
        notes: dto.notes,
      });
      await this.audit.recordForSession(tx, {
        action: "appointment.booked",
        targetType: "appointment",
        targetId: id,
        metadata: { patientId: dto.patientId, startsAt: slot.startsAt },
      });
      return this.toDto(tx, id);
    });
  }

  /** El paciente reserva (desde el portal) con su profesional asignado. */
  async bookAsPatient(dto: BookAppointmentDto): Promise<AppointmentDto> {
    return this.tenantDb.run(async (tx) => {
      const { patientId, membershipId } = await this.resolveMyCare(tx);
      const ctx = getTenantContext();
      const slot = await this.resolveSlot(tx, membershipId, dto.startsAt);
      const id = await this.insertAppointment(tx, {
        tenantId: ctx.tenantId,
        region: ctx.region,
        patientId,
        membershipId,
        slot,
        bookedVia: "patient",
        createdByMembershipId: null,
        notes: dto.notes,
      });
      await this.audit.recordForSession(tx, {
        action: "appointment.booked",
        targetType: "appointment",
        targetId: id,
        metadata: { patientId, startsAt: slot.startsAt, via: "patient" },
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
      return this.rescheduleCore(tx, appt, dto, "professional");
    });
  }

  /**
   * Reprograma del lado PACIENTE (portal): a otro horario disponible de SU profesional
   * asignado (el de esa cita), en un solo paso. Sólo sobre citas propias (acceso por la
   * rama "patient" → 404 si no es suya). El paciente NO elige profesional: se reprograma
   * con el mismo membership de la cita.
   */
  async rescheduleAsPatient(id: string, dto: RescheduleAppointmentDto): Promise<AppointmentDto> {
    return this.tenantDb.run(async (tx) => {
      const appt = await this.requireAccessibleAppointment(tx, id, "patient");
      return this.rescheduleCore(tx, appt, dto, "patient");
    });
  }

  /**
   * Núcleo de reprogramación compartido por profesional y paciente. La validación de
   * ACCESO la hace el caller (rama pro vs paciente); acá: estado booked + liberar el
   * slot actual + resolver el nuevo contra el MISMO profesional de la cita + insertar +
   * audit. `via` deja trazado quién reprogramó (el origen `bookedVia` se conserva).
   */
  private async rescheduleCore(
    tx: TenantTx,
    appt: AppointmentRow,
    dto: RescheduleAppointmentDto,
    via: "professional" | "patient",
  ): Promise<AppointmentDto> {
    if (appt.status !== "booked") {
      throw new ConflictException("Sólo se reprograma una cita reservada.");
    }
    // Liberar el slot actual ANTES de validar el nuevo (si no, el EXCLUDE choca
    // consigo mismo cuando el nuevo solapa al viejo del mismo profesional).
    await tx.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, appt.id));
    // El nuevo slot SIEMPRE es del profesional de la cita (appt.membershipId): el
    // paciente reprograma con quien ya tenía, no elige otro.
    const slot = await this.resolveSlot(tx, appt.membershipId, dto.startsAt);
    const newId = await this.insertAppointment(tx, {
      tenantId: appt.tenantId,
      region: appt.region,
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
      metadata: { from: appt.id, via },
    });
    return this.toDto(tx, newId);
  }

  // ── Público (reserva desde la vidriera, lead → cita) ───────────────────────

  /** Slots libres de un profesional, sin sesión. La org se resolvió por slug
   * (owner, bootstrap); acá se lee bajo runAs(org) → RLS scopea al tenant. */
  async publicSlots(
    org: AuthOrg,
    profileSlug: string,
    fromISO?: string,
    toISO?: string,
  ): Promise<SlotDto[]> {
    const { from, to } = this.range(fromISO, toISO);
    return this.tenantDb.runAs(org.id, async (tx) => {
      const membershipId = await this.resolvePublicMembership(tx, profileSlug);
      return this.computeSlots(tx, membershipId, from, to, new Date());
    });
  }

  /** Reserva pública: crea/relaciona el paciente (lead) por email y agenda. */
  async publicBook(
    org: AuthOrg,
    profileSlug: string,
    dto: PublicBookAppointmentDto,
  ): Promise<PublicBookingResult> {
    return this.tenantDb.runAs(org.id, async (tx) => {
      const membershipId = await this.resolvePublicMembership(tx, profileSlug);
      const slot = await this.resolveSlot(tx, membershipId, dto.startsAt);
      const patientId = await this.createLeadPatient(tx, org, dto);
      const id = await this.insertAppointment(tx, {
        tenantId: org.id,
        region: org.region,
        patientId,
        membershipId,
        slot,
        bookedVia: "public",
        createdByMembershipId: null,
        notes: dto.notes,
      });
      // Sin sesión: audit con actor nulo (igual que el accept de invitaciones).
      await this.audit.record(tx, {
        organizationId: org.id,
        region: org.region,
        actorUserId: null,
        actorRole: null,
        action: "appointment.booked",
        targetType: "appointment",
        targetId: id,
        metadata: { via: "public", email: dto.email, startsAt: slot.startsAt },
      });
      const [prof] = await tx
        .select({ name: users.fullName })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.id, membershipId))
        .limit(1);
      return {
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        professionalName: prof?.name ?? "",
      };
    });
  }

  /** Membership del profesional público (perfil listado, matrícula revisada y membership vigente). */
  private async resolvePublicMembership(tx: TenantTx, profileSlug: string): Promise<string> {
    const [row] = await tx
      .select({ membershipId: professionalProfiles.membershipId })
      .from(professionalProfiles)
      .innerJoin(memberships, eq(memberships.id, professionalProfiles.membershipId))
      .where(
        and(
          eq(professionalProfiles.profileSlug, profileSlug),
          eq(professionalProfiles.isPubliclyListed, true),
          eq(professionalProfiles.licenseStatus, "reviewed"),
          isNull(memberships.revokedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException();
    return row.membershipId;
  }

  /**
   * Crea SIEMPRE un paciente lead nuevo para la reserva pública. A propósito NO
   * reusa por email: una ruta sin sesión no debe poder atar una cita a la ficha de
   * un paciente existente (sería un oracle de existencia + contaminación de su
   * historia con sólo conocer/adivinar el email). Un lead que ya es paciente queda
   * como duplicado y el profesional lo reconcilia desde la gestión.
   */
  private async createLeadPatient(
    tx: TenantTx,
    org: AuthOrg,
    dto: PublicBookAppointmentDto,
  ): Promise<string> {
    const [created] = await tx
      .insert(patients)
      .values({
        tenantId: org.id,
        region: org.region,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone ?? null,
      })
      .returning({ id: patients.id });
    return created!.id;
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private range(fromISO?: string, toISO?: string): { from: Date; to: Date } {
    const from = fromISO ? parseDate(fromISO, "from") : new Date();
    const to = toISO
      ? parseDate(toISO, "to")
      : new Date(from.getTime() + DEFAULT_HORIZON_DAYS * DAY_MS);
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
    // Un paciente puede tener VARIAS asignaciones activas (M:N). Sin orden, cada
    // request podía elegir un profesional distinto (slots de A, reserva contra B).
    // Determinístico: la asignación activa más antigua.
    const [care] = await tx
      .select({ membershipId: careAssignments.membershipId })
      .from(careAssignments)
      .where(
        and(
          eq(careAssignments.patientId, patient.id),
          eq(careAssignments.status, "active"),
        ),
      )
      .orderBy(asc(careAssignments.assignedAt), asc(careAssignments.id))
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
    fromReq: Date,
    toReq: Date,
    now: Date,
  ): Promise<SlotDto[]> {
    // Acotar SIEMPRE a [now, now + MAX_HORIZON_DAYS]: lo pasado no se ofrece igual,
    // y el tope corta el costo de iterar rangos arbitrarios (ver MAX_HORIZON_DAYS).
    const cap = new Date(now.getTime() + MAX_HORIZON_DAYS * DAY_MS);
    const from = fromReq < now ? now : fromReq;
    const to = toReq > cap ? cap : toReq;
    if (from >= to) return [];
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

  /** Inserta la cita (tenant/region EXPLÍCITOS: sirve bajo run() y bajo runAs(),
   * donde no hay contexto de sesión). NO audita: cada caller audita según el caso
   * (booked/rescheduled, sesión o público). El EXCLUDE de no-overlap → 409. */
  private async insertAppointment(
    tx: TenantTx,
    args: {
      tenantId: string;
      region: AppointmentRow["region"];
      patientId: string;
      membershipId: string;
      slot: SlotDto;
      bookedVia: AppointmentRow["bookedVia"];
      createdByMembershipId: string | null;
      notes?: string;
    },
  ): Promise<string> {
    try {
      const [row] = await tx
        .insert(appointments)
        .values({
          tenantId: args.tenantId,
          region: args.region,
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
      return row!.id;
    } catch (e) {
      // 23P01 = exclusion_violation (EXCLUDE de no-overlap): el slot se tomó entre
      // el cálculo y el insert (carrera). 409 limpio en vez de 500.
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23P01" || err?.cause?.code === "23P01") {
        throw new ConflictException("Ese horario ya fue reservado. Probá con otro.");
      }
      throw e;
    }
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

/** Fecha de query-string → Date; 400 si no parsea (antes: Invalid Date → 500). */
function parseDate(iso: string, field: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Fecha inválida en "${field}".`);
  }
  return d;
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
