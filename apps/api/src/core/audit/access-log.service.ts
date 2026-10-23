import { Injectable } from "@nestjs/common";
import { conversations, dataAccessLog, users } from "@nutreitor/db";
import { ACCESS_LOG_WINDOW_MIN, type AccessLogEntry } from "@nutreitor/shared";
import { and, desc, eq, lt } from "drizzle-orm";

import { TenantDbService } from "../database/tenant-db.service.js";
import { getAuth } from "../tenant/tenant-context.store.js";
import type { AccessLogSpec } from "./access-log.decorator.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_MS = ACCESS_LOG_WINDOW_MIN * 60_000;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/** Inicio de la ventana de 15 min que contiene `at` (para deduplicar). */
export function accessWindow(at: Date): Date {
  return new Date(Math.floor(at.getTime() / WINDOW_MS) * WINDOW_MS);
}

/**
 * Registro de lecturas de datos de salud (KAN-23, ADR 0042). Sólo el staff: el
 * deportista viendo lo suyo en el portal no es acceso de un tercero. Append-only
 * (grant) y una fila por ventana de 15 min (índice único + ON CONFLICT DO NOTHING).
 */
@Injectable()
export class AccessLogService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async recordRead(spec: AccessLogSpec, params: Record<string, string | undefined>, now = new Date()): Promise<void> {
    const { user } = getAuth();
    if (user.role === "patient") return;
    const pick = (name?: string) => {
      const v = name ? params[name] : undefined;
      return v && UUID.test(v) ? v : null;
    };
    const targetId = pick(spec.targetParam);
    const ctx = this.tenantDb.context;

    await this.tenantDb.run(async (tx) => {
      let patientId = pick(spec.patientParam);
      if (spec.patientFromConversation && targetId) {
        const [c] = await tx
          .select({ patientId: conversations.patientId })
          .from(conversations)
          .where(eq(conversations.id, targetId))
          .limit(1);
        patientId = c?.patientId ?? null;
      }
      await tx
        .insert(dataAccessLog)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          actorUserId: user.id,
          actorRole: user.role,
          resource: spec.resource,
          patientId,
          targetId,
          windowStart: accessWindow(now),
        })
        .onConflictDoNothing();
    });
  }

  /** Lecturas del tenant, más nuevas primero; opcionalmente de un deportista. */
  async list(opts: { patientId?: string; before?: string; limit?: string }): Promise<AccessLogEntry[]> {
    const take = Math.min(Math.max(Number(opts.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const before = opts.before ? new Date(opts.before) : null;
    const conds = [
      opts.patientId && UUID.test(opts.patientId) ? eq(dataAccessLog.patientId, opts.patientId) : undefined,
      before && !Number.isNaN(before.getTime()) ? lt(dataAccessLog.createdAt, before) : undefined,
    ].filter((c) => c !== undefined);

    const rows = await this.tenantDb.run((tx) =>
      tx
        .select({ row: dataAccessLog, actorName: users.fullName })
        .from(dataAccessLog)
        .leftJoin(users, eq(users.id, dataAccessLog.actorUserId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(dataAccessLog.createdAt), desc(dataAccessLog.id))
        .limit(take),
    );
    return rows.map(({ row, actorName }) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorName: actorName ?? null,
      actorRole: row.actorRole,
      resource: row.resource,
      patientId: row.patientId,
      targetId: row.targetId,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
