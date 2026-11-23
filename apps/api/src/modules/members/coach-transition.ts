import { careAssignments, professionalProfiles, type TenantTx } from "@nutreitor/db";
import { and, eq } from "drizzle-orm";

/**
 * Al pasar una membresía a cuerpo técnico (KAN-109, ADR 0054): deja de atender. Se
 * cierran sus asignaciones vigentes (si no, sus deportistas lo seguirían viendo como
 * su profesional y le escribirían mensajes que nadie lee) y su perfil sale de la
 * vidriera. Devuelve cuántas asignaciones cerró, para la auditoría.
 */
export async function stopCaring(tx: TenantTx, membershipId: string): Promise<number> {
  const ended = await tx
    .update(careAssignments)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(careAssignments.membershipId, membershipId), eq(careAssignments.status, "active")))
    .returning({ id: careAssignments.id });
  await tx.update(professionalProfiles).set({ isPubliclyListed: false }).where(eq(professionalProfiles.membershipId, membershipId));
  return ended.length;
}
