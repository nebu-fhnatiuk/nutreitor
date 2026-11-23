import { Injectable, NotFoundException } from "@nestjs/common";
import { adherenceCheckins, appointments, groupCoaches, patientGroupMembers, patientGroups, patients } from "@nutreitor/db";
import { compareBoard, daysBetween, teamBoardRow, type TeamBoardDto, type TeamCheckinDto, type TeamGroupDto } from "@nutreitor/shared";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { AnthropometryService } from "../patients/anthropometry.service.js";
import { GroupBoardService } from "../patients/group-board.service.js";
import { coachHasGroup, loadGroup } from "../patients/groups.service.js";
import { HydrationService } from "../patients/hydration.service.js";
import { resolvePatientAccess } from "../patients/patient-access.js";

/** Días hacia atrás en los que un check-in todavía dice algo de cómo está hoy. */
const CHECKIN_DAYS = 14;

/**
 * Tablero del cuerpo técnico (KAN-109, ADR 0054). Reutiliza los resúmenes de la
 * pizarra del plantel (que ya aplican el scoping del coach) y los recorta con
 * `teamBoardRow`: sin ficha ni plan, y la composición corporal sólo con
 * consentimiento. Nada se guarda: se calcula al leer. La lectura queda en el
 * registro de accesos (`@LogsAccess` en el controller), igual que la pizarra.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly anthro: AnthropometryService,
    private readonly hydration: HydrationService,
    private readonly groupBoard: GroupBoardService,
  ) {}

  /** Planteles que ve la sesión: el coach, los suyos; el admin, todos. */
  groups(): Promise<TeamGroupDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      if (!access.isAdmin && (access.role !== "coach" || !access.membershipId)) return [];
      const all = await tx.select({ id: patientGroups.id, name: patientGroups.name }).from(patientGroups).orderBy(asc(patientGroups.name));
      let mine = all;
      if (!access.isAdmin) {
        const own = await tx.select({ groupId: groupCoaches.groupId }).from(groupCoaches).where(eq(groupCoaches.membershipId, access.membershipId!));
        const ids = new Set(own.map((r) => r.groupId));
        mine = all.filter((g) => ids.has(g.id));
      }
      if (mine.length === 0) return [];
      const counts = await tx
        .select({ groupId: patientGroupMembers.groupId, n: count() })
        .from(patientGroupMembers)
        .innerJoin(patients, eq(patients.id, patientGroupMembers.patientId))
        .where(and(inArray(patientGroupMembers.groupId, mine.map((g) => g.id)), isNull(patients.archivedAt)))
        .groupBy(patientGroupMembers.groupId);
      const by = new Map(counts.map((c) => [c.groupId, Number(c.n)]));
      return mine.map((g) => ({ id: g.id, name: g.name, members: by.get(g.id) ?? 0 }));
    });
  }

  async board(groupId: string, today = new Date().toISOString().slice(0, 10)): Promise<TeamBoardDto> {
    // Primero el acceso: un plantel ajeno no existe para el coach (404, no 403).
    const group = await this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      if (!access.isAdmin && !(await coachHasGroup(tx, groupId, access))) throw new NotFoundException();
      return loadGroup(tx, groupId);
    });

    const anthro = await this.anthro.groupSummary(groupId);
    const sweat = await this.hydration.groupSummary(groupId);
    const adh = await this.groupBoard.adherenceSummary(groupId, today);
    const ids = anthro.rows.map((r) => r.patientId);
    const extra = await this.extras(ids, today);
    const sweatBy = new Map(sweat.map((r) => [r.patientId, r.last]));

    const rows = anthro.rows.map((r) => {
      const last = r.last;
      const sum6 = last?.results.sum6.ok ? last.results.sum6.value : null;
      const kerr = last?.results.kerr;
      const a = adh.perPatient.get(r.patientId) ?? { last7: null, prev7: null };
      return teamBoardRow(
        {
          patientId: r.patientId,
          fullName: r.fullName,
          consent: extra.consent.has(r.patientId),
          lastMeasuredOn: last ? last.measuredAt.slice(0, 10) : null,
          sum6,
          sum6Delta: r.sum6Delta,
          muscleKg: kerr?.ok ? kerr.value.muscleKg : null,
          muscleKgDelta: r.muscleKgDelta,
          bodyMass: last?.bodyMass ?? null,
          bodyMassDelta: r.bodyMassDelta,
          lossPct: sweatBy.get(r.patientId)?.results.dehydrationPct ?? null,
          adherence7: a.last7,
          adherencePrev7: a.prev7,
          checkin: extra.checkins.get(r.patientId) ?? null,
          hasPlan: adh.plans.has(r.patientId),
          nextAppointmentAt: extra.appointments.get(r.patientId) ?? null,
        },
        today,
      );
    });
    rows.sort(compareBoard);
    const measured = anthro.rows.flatMap((r) => (r.last ? [r.last.measuredAt.slice(0, 10)] : []));
    return {
      today,
      group: { id: group.id, name: group.name },
      rows,
      coverage: {
        members: rows.length,
        logging30: adh.logging30,
        withPlan: rows.filter((r) => r.hasPlan).length,
        measured30: measured.filter((d) => daysBetween(d, today) < 30).length,
      },
    };
  }

  /** Consentimiento, último check-in y próximo turno de los deportistas visibles. */
  private extras(ids: string[], today: string) {
    return this.tenantDb.run(async (tx) => {
      const consent = new Set<string>();
      const checkins = new Map<string, TeamCheckinDto>();
      const next = new Map<string, string>();
      if (ids.length === 0) return { consent, checkins, appointments: next };
      for (const p of await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(inArray(patients.id, ids), eq(patients.shareBodyWithStaff, true)))) {
        consent.add(p.id);
      }
      const from = new Date(`${today}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - CHECKIN_DAYS);
      for (const c of await tx
        .select({ patientId: adherenceCheckins.patientId, date: adherenceCheckins.date, energy: adherenceCheckins.energy, mood: adherenceCheckins.mood })
        .from(adherenceCheckins)
        .where(and(inArray(adherenceCheckins.patientId, ids), gte(adherenceCheckins.date, from.toISOString().slice(0, 10))))
        .orderBy(desc(adherenceCheckins.date))) {
        if (!checkins.has(c.patientId)) checkins.set(c.patientId, { date: c.date, energy: c.energy, mood: c.mood });
      }
      for (const a of await tx
        .select({ patientId: appointments.patientId, startsAt: appointments.startsAt })
        .from(appointments)
        .where(and(inArray(appointments.patientId, ids), eq(appointments.status, "booked"), gt(appointments.startsAt, new Date())))
        .orderBy(asc(appointments.startsAt))) {
        if (!next.has(a.patientId)) next.set(a.patientId, a.startsAt.toISOString());
      }
      return { consent, checkins, appointments: next };
    });
  }
}
