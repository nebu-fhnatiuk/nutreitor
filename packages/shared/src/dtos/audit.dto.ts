import type { MembershipRole } from "./auth.dto.js";

/** Entrada del audit log (lectura para el panel admin). */
export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorRole: MembershipRole | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
