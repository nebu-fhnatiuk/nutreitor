import { Injectable } from "@nestjs/common";
import { adherenceMealLogs, mealPlans } from "@nutreitor/db";
import {
  adherenceScore,
  boardStatus,
  compareBoard,
  daysBetween,
  type GroupBoardDto,
  type GroupBoardRowDto,
} from "@nutreitor/shared";
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { AnthropometryService } from "./anthropometry.service.js";
import { loadGroup, visibleMembers } from "./groups.service.js";
import { HydrationService } from "./hydration.service.js";
import { resolvePatientAccess } from "./patient-access.js";

/**
 * Pizarra del plantel (KAN-70): junta la última antropometría, la última prueba de
 * sudoración y la adherencia de dos semanas de cada deportista visible, y le pone
 * el semáforo (`boardStatus`, puro en shared). Nada se guarda: se calcula al leer.
 */
@Injectable()
export class GroupBoardService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly anthro: AnthropometryService,
    private readonly hydration: HydrationService,
  ) {}

  async board(groupId: string, today = new Date().toISOString().slice(0, 10)): Promise<GroupBoardDto> {
    // Cada resumen ya valida el grupo y aplica el scoping de miembros.
    const anthro = await this.anthro.groupSummary(groupId);
    const sweat = await this.hydration.groupSummary(groupId);
    const { perPatient: adherence, plans, adherence30, logging30 } = await this.adherence(groupId, today);
    const sweatBy = new Map(sweat.map((r) => [r.patientId, r.last]));

    const rows: GroupBoardRowDto[] = anthro.rows.map((r) => {
      const last = r.last;
      const sw = sweatBy.get(r.patientId) ?? null;
      const adh = adherence.get(r.patientId) ?? { last7: null, prev7: null };
      const sum6 = last?.results.sum6.ok ? last.results.sum6.value : null;
      const input = {
        lastMeasuredOn: last ? last.measuredAt.slice(0, 10) : null,
        sum6Delta: r.sum6Delta,
        lossPct: sw ? sw.results.dehydrationPct : null,
        adherence7: adh.last7,
        adherencePrev7: adh.prev7,
      };
      return {
        patientId: r.patientId,
        fullName: r.fullName,
        lastMeasuredOn: input.lastMeasuredOn,
        bodyMass: last?.bodyMass ?? null,
        sum6,
        sum6Delta: r.sum6Delta,
        sweatRateLh: sw ? sw.results.sweatRateLh : null,
        lossPct: input.lossPct,
        adherence7: adh.last7,
        adherencePrev7: adh.prev7,
        activePlan: plans.get(r.patientId) ?? null,
        status: boardStatus(input, today),
      };
    });
    rows.sort(compareBoard);
    // Cobertura (KAN-34): sobre los mismos deportistas visibles de la pizarra.
    const measured = rows.flatMap((r) => (r.lastMeasuredOn ? [r.lastMeasuredOn] : []));
    const coverage = {
      members: rows.length,
      withPlan: rows.filter((r) => r.activePlan).length,
      measured30: measured.filter((d) => daysBetween(d, today) < 30).length,
      lastMeasuredOn: measured.length ? measured.reduce((a, b) => (a > b ? a : b)) : null,
      adherence30,
      logging30,
    };
    return { today, rows, coverage };
  }

  /**
   * Adherencia de los últimos 7 días y de los 7 anteriores por deportista visible,
   * la de 30 días del grupo y el plan vigente de cada uno.
   */
  private adherence(groupId: string, today: string) {
    return this.tenantDb.run(async (tx) => {
      await loadGroup(tx, groupId);
      const ids = (await visibleMembers(tx, groupId, await resolvePatientAccess(tx))).map((m) => m.patientId);
      const out = new Map<string, { last7: number | null; prev7: number | null }>();
      const plans = new Map<string, { title: string; version: number }>();
      if (!ids.length) return { perPatient: out, plans, adherence30: null, logging30: 0 };
      const active = await tx
        .select({ patientId: mealPlans.patientId, title: mealPlans.title, version: mealPlans.version })
        .from(mealPlans)
        .where(and(inArray(mealPlans.patientId, ids), eq(mealPlans.status, "active")));
      for (const p of active) plans.set(p.patientId, { title: p.title, version: p.version });
      const from = shift(today, -29);
      const logs = await tx
        .select({ patientId: adherenceMealLogs.patientId, date: adherenceMealLogs.date, status: adherenceMealLogs.status })
        .from(adherenceMealLogs)
        .where(
          and(
            inArray(adherenceMealLogs.patientId, ids),
            gte(adherenceMealLogs.date, from),
            lte(adherenceMealLogs.date, today),
          ),
        );
      for (const id of ids) {
        const mine = logs.filter((l) => l.patientId === id);
        const recent = mine.filter((l) => daysBetween(l.date, today) < 7);
        const before = mine.filter((l) => daysBetween(l.date, today) >= 7 && daysBetween(l.date, today) < 14);
        out.set(id, { last7: adherenceScore(recent).pct, prev7: adherenceScore(before).pct });
      }
      return {
        perPatient: out,
        plans,
        adherence30: adherenceScore(logs).pct,
        logging30: new Set(logs.map((l) => l.patientId)).size,
      };
    });
  }
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
