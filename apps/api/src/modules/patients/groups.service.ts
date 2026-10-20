import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { careAssignments, patientGroupMembers, patientGroups, patients, type TenantTx } from "@nutreitor/db";
import type {
  AddGroupMembersDto,
  GroupDetailDto,
  GroupDto,
  GroupMemberDto,
  GroupRefDto,
  SaveGroupDto,
} from "@nutreitor/shared";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { resolvePatientAccess, type PatientAccess } from "./patient-access.js";

type GroupRow = typeof patientGroups.$inferSelect;

/**
 * Grupos de deportistas (ADR 0031). El admin los arma (`group:manage`, en el
 * controller). Leer los ve cualquiera con `patient:read`, pero los MIEMBROS siguen
 * el scoping de pacientes: el profesional sólo ve a sus asignados (un grupo no abre
 * acceso a nadie). Los archivados no cuentan ni aparecen.
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<GroupDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      const rows = await tx.select().from(patientGroups).orderBy(asc(patientGroups.name));
      const counts = new Map<string, number>();
      if (rows.length > 0) {
        const q = tx
          .select({ groupId: patientGroupMembers.groupId, n: count() })
          .from(patientGroupMembers)
          .innerJoin(patients, eq(patients.id, patientGroupMembers.patientId));
        const scoped = access.isAdmin ? q : q.innerJoin(careAssignments, assignedTo(access));
        for (const c of await scoped.where(isNull(patients.archivedAt)).groupBy(patientGroupMembers.groupId)) {
          counts.set(c.groupId, Number(c.n));
        }
      }
      return rows.map((g) => toDto(g, counts.get(g.id) ?? 0));
    });
  }

  get(id: string): Promise<GroupDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const group = await loadGroup(tx, id);
      const members = await visibleMembers(tx, id, await resolvePatientAccess(tx));
      return { ...toDto(group, members.length), members };
    });
  }

  create(dto: SaveGroupDto): Promise<GroupDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const ctx = this.tenantDb.context;
      const [row] = await uniqueName(() =>
        tx
          .insert(patientGroups)
          .values({ tenantId: ctx.tenantId, region: ctx.region, name: dto.name, description: dto.description || null })
          .returning(),
      );
      await this.audit.recordForSession(tx, { action: "group.created", targetType: "group", targetId: row!.id });
      return { ...toDto(row!, 0), members: [] };
    });
  }

  update(id: string, dto: SaveGroupDto): Promise<GroupDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await uniqueName(() =>
        tx
          .update(patientGroups)
          .set({ name: dto.name, description: dto.description || null })
          .where(eq(patientGroups.id, id))
          .returning(),
      );
      if (!row) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "group.updated", targetType: "group", targetId: id });
      const members = await visibleMembers(tx, id, await resolvePatientAccess(tx));
      return { ...toDto(row, members.length), members };
    });
  }

  /** Borra el grupo y sus pertenencias. Los pacientes y sus datos quedan intactos. */
  remove(id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const gone = await tx.delete(patientGroups).where(eq(patientGroups.id, id)).returning({ id: patientGroups.id });
      if (gone.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, { action: "group.deleted", targetType: "group", targetId: id });
    });
  }

  addMembers(id: string, dto: AddGroupMembersDto): Promise<GroupDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const group = await loadGroup(tx, id);
      const ids = [...new Set(dto.patientIds)];
      // Bajo RLS: un id de otro tenant no existe. Archivados no se suman.
      const found = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(inArray(patients.id, ids), isNull(patients.archivedAt)));
      if (found.length !== ids.length) throw new BadRequestException("Algún paciente no existe o está archivado.");
      const ctx = this.tenantDb.context;
      const added = await tx
        .insert(patientGroupMembers)
        .values(ids.map((patientId) => ({ tenantId: ctx.tenantId, region: ctx.region, groupId: id, patientId })))
        .onConflictDoNothing()
        .returning({ patientId: patientGroupMembers.patientId });
      if (added.length > 0) {
        await this.audit.recordForSession(tx, {
          action: "group.members_added",
          targetType: "group",
          targetId: id,
          metadata: { patientIds: added.map((a) => a.patientId) },
        });
      }
      const members = await visibleMembers(tx, id, await resolvePatientAccess(tx));
      return { ...toDto(group, members.length), members };
    });
  }

  removeMember(id: string, patientId: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      await loadGroup(tx, id);
      const gone = await tx
        .delete(patientGroupMembers)
        .where(and(eq(patientGroupMembers.groupId, id), eq(patientGroupMembers.patientId, patientId)))
        .returning({ patientId: patientGroupMembers.patientId });
      if (gone.length === 0) throw new NotFoundException();
      await this.audit.recordForSession(tx, {
        action: "group.member_removed",
        targetType: "group",
        targetId: id,
        metadata: { patientId },
      });
    });
  }
}

/** Mapa patientId → grupos (por nombre), para el listado y la ficha. */
export async function groupsByPatient(tx: TenantTx, patientIds: string[]): Promise<Map<string, GroupRefDto[]>> {
  const map = new Map<string, GroupRefDto[]>();
  if (patientIds.length === 0) return map;
  const rows = await tx
    .select({ patientId: patientGroupMembers.patientId, id: patientGroups.id, name: patientGroups.name })
    .from(patientGroupMembers)
    .innerJoin(patientGroups, eq(patientGroups.id, patientGroupMembers.groupId))
    .where(inArray(patientGroupMembers.patientId, patientIds))
    .orderBy(asc(patientGroups.name));
  for (const r of rows) {
    const list = map.get(r.patientId) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.patientId, list);
  }
  return map;
}

/** El grupo existe en el tenant (RLS) o 404. */
export async function loadGroup(tx: TenantTx, id: string): Promise<GroupRow> {
  const [g] = await tx.select().from(patientGroups).where(eq(patientGroups.id, id)).limit(1);
  if (!g) throw new NotFoundException();
  return g;
}

/** Miembros activos que la sesión puede ver (profesional: sólo asignados), por nombre. */
export async function visibleMembers(tx: TenantTx, groupId: string, access: PatientAccess): Promise<GroupMemberDto[]> {
  if (!access.isAdmin && !access.membershipId) return [];
  const q = tx
    .selectDistinct({ patientId: patients.id, fullName: patients.fullName, sex: patients.sex, birthDate: patients.birthDate })
    .from(patientGroupMembers)
    .innerJoin(patients, eq(patients.id, patientGroupMembers.patientId));
  const scoped = access.isAdmin ? q : q.innerJoin(careAssignments, assignedTo(access));
  return scoped
    .where(and(eq(patientGroupMembers.groupId, groupId), isNull(patients.archivedAt)))
    .orderBy(asc(patients.fullName));
}

function assignedTo(access: PatientAccess) {
  return and(
    eq(careAssignments.patientId, patients.id),
    eq(careAssignments.membershipId, access.membershipId ?? "00000000-0000-0000-0000-000000000000"),
    eq(careAssignments.status, "active"),
  );
}

async function uniqueName<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      throw new ConflictException("Ya hay un grupo con ese nombre.");
    }
    throw e;
  }
}

function toDto(g: GroupRow, memberCount: number): GroupDto {
  return { id: g.id, name: g.name, description: g.description, memberCount, createdAt: g.createdAt.toISOString() };
}
