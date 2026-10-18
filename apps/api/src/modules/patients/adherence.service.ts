import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  adherenceCheckins,
  adherenceMealLogs,
  mealPlans,
  notificationPreferences,
  patients,
  type TenantTx,
} from "@nutreitor/db";
import {
  isLoggableDate,
  mealsForDate,
  normalizeMealPlanBody,
  type AdherenceDto,
  type AdherenceRangeDto,
  type CheckinDto,
  type CheckinRecordDto,
  type LogMealDto,
  type MealLogDto,
  type MealPlanBody,
  type NotificationPreferencesDto,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@nutreitor/shared";
import { and, asc, between, eq, sql } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

/**
 * Adherencia (Fase 4.3). El PACIENTE registra sobre su propia ficha (resuelta por la
 * sesión, nunca un id del cliente) y sólo comidas de su plan activo en una ventana
 * corta de días; el PROFESIONAL lee la de sus pacientes asignados.
 */
@Injectable()
export class AdherenceService {
  constructor(private readonly tenantDb: TenantDbService) {}

  forPatient(patientId: string, range: AdherenceRangeDto): Promise<AdherenceDto> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      return read(tx, patientId, range);
    });
  }

  mine(range: AdherenceRangeDto): Promise<AdherenceDto> {
    return this.tenantDb.run(async (tx) => read(tx, (await myPatient(tx)).id, range));
  }

  logMeal(dto: LogMealDto): Promise<MealLogDto> {
    return this.tenantDb.run(async (tx) => {
      const patient = await myPatient(tx);
      assertLoggable(dto.date);
      const [plan] = await tx
        .select({ id: mealPlans.id, body: mealPlans.body })
        .from(mealPlans)
        .where(and(eq(mealPlans.patientId, patient.id), eq(mealPlans.status, "active")))
        .limit(1);
      if (!plan) throw new ConflictException("No tenés un plan activo.");
      const body = normalizeMealPlanBody(plan.body) as MealPlanBody;
      const names = mealsForDate(body, localDate(dto.date)).map((m) => m.name);
      if (!names.includes(dto.mealName)) {
        throw new BadRequestException("Esa comida no está en tu plan para ese día.");
      }
      const ctx = getTenantContext();
      const values = { status: dto.status, note: dto.note || null, planId: plan.id };
      const [row] = await tx
        .insert(adherenceMealLogs)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          patientId: patient.id,
          date: dto.date,
          mealName: dto.mealName,
          ...values,
        })
        .onConflictDoUpdate({
          target: [adherenceMealLogs.patientId, adherenceMealLogs.date, adherenceMealLogs.mealName],
          set: { ...values, updatedAt: sql`now()` },
        })
        .returning();
      return toLog(row!);
    });
  }

  /** Recordatorio diario de registro (lo envía el worker; ADR 0023). */
  preferences(): Promise<NotificationPreferencesDto> {
    return this.tenantDb.run(async (tx) => {
      await myPatient(tx);
      const { user } = getAuth();
      const [p] = await tx
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, user.id))
        .limit(1);
      return p
        ? { adherenceReminder: p.adherenceReminder, adherenceReminderHour: p.adherenceReminderHour, timezone: p.timezone }
        : DEFAULT_NOTIFICATION_PREFERENCES;
    });
  }

  savePreferences(dto: NotificationPreferencesDto): Promise<NotificationPreferencesDto> {
    return this.tenantDb.run(async (tx) => {
      await myPatient(tx);
      const { user } = getAuth();
      const ctx = getTenantContext();
      await tx
        .insert(notificationPreferences)
        .values({ tenantId: ctx.tenantId, region: ctx.region, userId: user.id, ...dto })
        .onConflictDoUpdate({
          target: [notificationPreferences.tenantId, notificationPreferences.userId],
          set: { ...dto, updatedAt: sql`now()` },
        });
      return dto;
    });
  }

  checkin(dto: CheckinDto): Promise<CheckinRecordDto> {
    return this.tenantDb.run(async (tx) => {
      const patient = await myPatient(tx);
      assertLoggable(dto.date);
      const ctx = getTenantContext();
      const values = {
        hunger: dto.hunger ?? null,
        energy: dto.energy ?? null,
        mood: dto.mood ?? null,
        note: dto.note || null,
      };
      const [row] = await tx
        .insert(adherenceCheckins)
        .values({ tenantId: ctx.tenantId, region: ctx.region, patientId: patient.id, date: dto.date, ...values })
        .onConflictDoUpdate({
          target: [adherenceCheckins.patientId, adherenceCheckins.date],
          set: { ...values, updatedAt: sql`now()` },
        })
        .returning();
      return toCheckin(row!);
    });
  }
}

async function read(tx: TenantTx, patientId: string, range: AdherenceRangeDto): Promise<AdherenceDto> {
  const [logs, checkins] = await Promise.all([
    tx
      .select()
      .from(adherenceMealLogs)
      .where(and(eq(adherenceMealLogs.patientId, patientId), between(adherenceMealLogs.date, range.from, range.to)))
      .orderBy(asc(adherenceMealLogs.date), asc(adherenceMealLogs.createdAt)),
    tx
      .select()
      .from(adherenceCheckins)
      .where(and(eq(adherenceCheckins.patientId, patientId), between(adherenceCheckins.date, range.from, range.to)))
      .orderBy(asc(adherenceCheckins.date)),
  ]);
  return { logs: logs.map(toLog), checkins: checkins.map(toCheckin) };
}

/** La PROPIA ficha del paciente de la sesión (activa). */
async function myPatient(tx: TenantTx): Promise<{ id: string }> {
  const { user } = getAuth();
  const [p] = await tx
    .select({ id: patients.id, archivedAt: patients.archivedAt })
    .from(patients)
    .where(eq(patients.userId, user.id))
    .limit(1);
  if (!p || p.archivedAt) throw new NotFoundException("No encontramos tu ficha de paciente.");
  return p;
}

function assertLoggable(date: string) {
  if (!isLoggableDate(date, new Date().toISOString().slice(0, 10))) {
    throw new BadRequestException("Sólo podés registrar hoy y los últimos días.");
  }
}

/** "YYYY-MM-DD" → Date local al mediodía (para el día de la semana del plan). */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12);
}

function toLog(r: typeof adherenceMealLogs.$inferSelect): MealLogDto {
  return { date: r.date, mealName: r.mealName, status: r.status, note: r.note };
}

function toCheckin(r: typeof adherenceCheckins.$inferSelect): CheckinRecordDto {
  return { date: r.date, hunger: r.hunger, energy: r.energy, mood: r.mood, note: r.note };
}
