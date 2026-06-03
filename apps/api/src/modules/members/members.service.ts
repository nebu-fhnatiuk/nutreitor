import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  memberships,
  professionalProfiles,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  MemberDto,
  MembershipRole,
  RosterAdminEntry,
  UpdateRosterDto,
} from "@nutreitor/shared";
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { hasPublicRosterContent } from "../public/public-serializer.js";

@Injectable()
export class MembersService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Lista los miembros del tenant (RLS acota a la org), con búsqueda opcional. */
  async list(search?: string): Promise<MemberDto[]> {
    const term = search?.trim();
    const filter = term
      ? or(ilike(users.email, `%${term}%`), ilike(users.fullName, `%${term}%`))
      : undefined;

    const rows = await this.tenantDb.run((tx) =>
      tx
        .select({
          membershipId: memberships.id,
          userId: users.id,
          email: users.email,
          fullName: users.fullName,
          role: memberships.role,
          revokedAt: memberships.revokedAt,
          createdAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(filter)
        .orderBy(desc(memberships.createdAt)),
    );

    return rows.map((r) => ({
      membershipId: r.membershipId,
      userId: r.userId,
      email: r.email,
      fullName: r.fullName,
      role: r.role,
      status: r.revokedAt ? "revoked" : "active",
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Cambia el rol de un membership (con guard de último admin + audit). */
  async changeRole(membershipId: string, newRole: MembershipRole): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const m = await this.getActive(tx, membershipId);
      if (m.role === newRole) return;
      if (m.role === "admin" && newRole !== "admin") {
        await this.ensureNotLastAdmin(tx, m.id);
      }
      await tx
        .update(memberships)
        .set({ role: newRole })
        .where(eq(memberships.id, membershipId));
      await this.audit.recordForSession(tx, {
        action: "member.role_changed",
        targetType: "membership",
        targetId: membershipId,
        metadata: { fromRole: m.role, toRole: newRole },
      });
    });
  }

  /** Da de baja (soft) un membership (con guard de último admin + audit). */
  async revoke(membershipId: string): Promise<void> {
    await this.tenantDb.run(async (tx) => {
      const m = await this.getActive(tx, membershipId);
      if (m.role === "admin") await this.ensureNotLastAdmin(tx, m.id);
      await tx
        .update(memberships)
        .set({ revokedAt: new Date() })
        .where(eq(memberships.id, membershipId));
      await this.audit.recordForSession(tx, {
        action: "member.revoked",
        targetType: "membership",
        targetId: membershipId,
        metadata: { role: m.role },
      });
    });
  }

  /**
   * Roster para curaduría del admin: TODOS los perfiles del tenant (incluye no
   * listados y sin contenido, a diferencia del roster público). `hasPublicContent`
   * usa la misma regla del serializer (Ajuste 1) para explicar ausencias.
   */
  async listRoster(): Promise<RosterAdminEntry[]> {
    const rows = await this.tenantDb.run((tx) =>
      tx
        .select({
          membershipId: professionalProfiles.membershipId,
          fullName: users.fullName,
          profileSlug: professionalProfiles.profileSlug,
          isPubliclyListed: professionalProfiles.isPubliclyListed,
          displayOrder: professionalProfiles.displayOrder,
          specialty: professionalProfiles.specialty,
          headline: professionalProfiles.headline,
          bio: professionalProfiles.bio,
          visibility: professionalProfiles.visibility,
        })
        .from(professionalProfiles)
        .innerJoin(
          memberships,
          eq(memberships.id, professionalProfiles.membershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(isNull(memberships.revokedAt))
        .orderBy(asc(professionalProfiles.displayOrder), asc(users.fullName)),
    );

    return rows.map((r) => ({
      membershipId: r.membershipId,
      fullName: r.fullName,
      profileSlug: r.profileSlug,
      isPubliclyListed: r.isPubliclyListed,
      displayOrder: r.displayOrder,
      specialty: r.specialty,
      hasPublicContent: hasPublicRosterContent({
        profileSlug: r.profileSlug,
        isPubliclyListed: r.isPubliclyListed,
        specialty: r.specialty,
        headline: r.headline,
        bio: r.bio,
        photoUrl: null,
        credentials: null,
        specialties: [],
        services: [],
        visibility: r.visibility ?? {},
      }),
    }));
  }

  /**
   * Curaduría del roster por membership (isPubliclyListed, displayOrder, specialty)
   * + audit. La visibilidad por campo y el contenido los edita el profesional; acá
   * el admin sólo decide presencia/orden/agrupación.
   */
  async updateRoster(
    membershipId: string,
    dto: UpdateRosterDto,
  ): Promise<void> {
    const patch: Partial<typeof professionalProfiles.$inferInsert> = {};
    if (dto.isPubliclyListed !== undefined)
      patch.isPubliclyListed = dto.isPubliclyListed;
    if (dto.displayOrder !== undefined) patch.displayOrder = dto.displayOrder;
    if (dto.specialty !== undefined) patch.specialty = dto.specialty;
    const changed = Object.keys(patch);
    if (changed.length === 0) return;

    await this.tenantDb.run(async (tx) => {
      const updated = await tx
        .update(professionalProfiles)
        .set(patch)
        .where(eq(professionalProfiles.membershipId, membershipId))
        .returning({ id: professionalProfiles.id });
      if (updated.length === 0) {
        throw new NotFoundException("Perfil no encontrado para ese miembro.");
      }
      await this.audit.recordForSession(tx, {
        action: "roster.updated",
        targetType: "membership",
        targetId: membershipId,
        metadata: { fields: changed },
      });
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async getActive(
    tx: TenantTx,
    membershipId: string,
  ): Promise<{ id: string; role: MembershipRole }> {
    const [m] = await tx
      .select({ id: memberships.id, role: memberships.role, revokedAt: memberships.revokedAt })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .limit(1);
    if (!m) throw new NotFoundException("Miembro no encontrado.");
    if (m.revokedAt) throw new BadRequestException("El miembro ya está dado de baja.");
    return { id: m.id, role: m.role };
  }

  /**
   * Tira si `excludingId` es el último admin activo de la org. `FOR UPDATE` bloquea
   * las filas de admins activos: dos revoke/changeRole concurrentes se serializan,
   * así no pueden dejar la org sin admin (el segundo re-lee al primero ya revocado).
   */
  private async ensureNotLastAdmin(tx: TenantTx, excludingId: string): Promise<void> {
    const admins = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.role, "admin"), isNull(memberships.revokedAt)))
      .for("update");
    const others = admins.filter((a) => a.id !== excludingId);
    if (others.length === 0) {
      throw new ForbiddenException(
        "No podés dejar la organización sin un admin activo.",
      );
    }
  }
}
