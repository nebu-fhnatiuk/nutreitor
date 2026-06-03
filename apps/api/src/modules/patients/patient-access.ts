import { NotFoundException } from "@nestjs/common";
import { careAssignments, memberships, type TenantTx } from "@nutreitor/db";
import { and, eq, isNull } from "drizzle-orm";

import { getAuth } from "../../core/tenant/tenant-context.store.js";

/**
 * ÚNICO lugar del scoping fino de acceso a pacientes (además de RLS, que ya acota
 * por tenant). Regla: el admin accede a todos los pacientes del tenant; el
 * profesional SOLO a los que tiene con asignación ACTIVA (mínimo privilegio).
 *
 * RLS = barrera dura por tenant (cross-tenant imposible). Este filtro = regla de
 * negocio asignados-only, en la capa donde vive rol+membership. Defensa en
 * profundidad: una falla acá nunca expone otro tenant.
 */
export interface PatientAccess {
  isAdmin: boolean;
  /** Membership de la sesión en este tenant (null si no se resolvió). */
  membershipId: string | null;
}

/** Resuelve el contexto de acceso de la sesión (rol + membership activo). */
export async function resolvePatientAccess(tx: TenantTx): Promise<PatientAccess> {
  const { user } = getAuth();
  const [m] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), isNull(memberships.revokedAt)))
    .limit(1);
  return { isAdmin: user.role === "admin", membershipId: m?.id ?? null };
}

/**
 * Verifica que la sesión pueda acceder al paciente. Admin: siempre (RLS ya acota
 * al tenant). Profesional: requiere una asignación ACTIVA suya. Si no, 404 (no
 * 403: no revela la existencia del paciente a quien no lo atiende).
 */
export async function assertCanAccessPatient(
  tx: TenantTx,
  patientId: string,
  access: PatientAccess,
): Promise<void> {
  if (access.isAdmin) return;
  if (!access.membershipId) throw new NotFoundException();
  const [a] = await tx
    .select({ id: careAssignments.id })
    .from(careAssignments)
    .where(
      and(
        eq(careAssignments.patientId, patientId),
        eq(careAssignments.membershipId, access.membershipId),
        eq(careAssignments.status, "active"),
      ),
    )
    .limit(1);
  if (!a) throw new NotFoundException();
}
