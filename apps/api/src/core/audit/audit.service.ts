import { Injectable } from "@nestjs/common";
import { auditLog, type Database, type TenantTx } from "@nutreitor/db";
import type { MembershipRole, Region } from "@nutreitor/shared";

import { getAuth, getTenantContext } from "../tenant/tenant-context.store.js";

/** Acciones auditables (append-only). */
export type AuditAction =
  | "member.invited"
  | "invite.accepted"
  | "invite.revoked"
  | "invite.resent"
  | "member.role_changed"
  | "member.revoked"
  | "patient.created"
  | "org.branding_updated"
  | "org.public_profile_updated"
  | "roster.updated"
  | "professional.profile_updated";

export interface AuditEvent {
  organizationId: string;
  region: Region;
  actorUserId?: string | null;
  actorRole?: MembershipRole | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

type Executor = Database | TenantTx;

/**
 * Registra eventos de auditoría. SIEMPRE recibe el `executor` de la mutación
 * (TenantTx bajo sesión, o el owner db en flujos pre-auth) para que el audit se
 * inserte en la MISMA transacción: si la mutación hace rollback, el audit también.
 * La inmutabilidad la fuerza el grant (rol app sólo INSERT+SELECT).
 */
@Injectable()
export class AuditService {
  /** Registra un evento con todos los campos explícitos (p. ej. flujos pre-auth). */
  async record(executor: Executor, event: AuditEvent): Promise<void> {
    await executor.insert(auditLog).values({
      organizationId: event.organizationId,
      region: event.region,
      actorUserId: event.actorUserId ?? null,
      actorRole: event.actorRole ?? null,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadata: event.metadata ?? {},
    });
  }

  /**
   * Registra un evento tomando tenant + actor del contexto de sesión (ALS). Para
   * las mutaciones administrativas corrientes (corren bajo JwtAuthGuard).
   */
  async recordForSession(
    executor: Executor,
    event: {
      action: AuditAction;
      targetType?: string;
      targetId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const ctx = getTenantContext();
    const { user } = getAuth();
    await this.record(executor, {
      organizationId: ctx.orgId,
      region: ctx.region,
      actorUserId: user.id,
      actorRole: user.role,
      ...event,
    });
  }
}
