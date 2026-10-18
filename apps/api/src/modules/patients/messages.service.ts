import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  careAssignments,
  memberships,
  messageReads,
  patientMessages,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  InboxEntryDto,
  MembershipRole,
  MessageDto,
  MessagesQueryDto,
  ThreadDto,
  UnreadDto,
} from "@nutreitor/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { assertCanAccessPatient, resolvePatientAccess } from "./patient-access.js";

/** Tope de mensajes por consulta (la primera carga trae los últimos). */
const PAGE = 200;

/**
 * Chat profesional ↔ paciente (Fase 4.3). Una conversación por paciente con su
 * equipo: el admin y los profesionales con asignación activa (mismo scoping que la
 * ficha). El paciente participa sobre SU ficha (resuelta por la sesión) y sólo puede
 * escribir si tiene un profesional asignado: si no, nadie lo leería.
 */
@Injectable()
export class MessagesService {
  constructor(private readonly tenantDb: TenantDbService) {}

  // ── equipo ─────────────────────────────────────────────────────────────────

  threadForPatient(patientId: string, q: MessagesQueryDto): Promise<ThreadDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await teamMember(tx, patientId);
      return { ...(await thread(tx, patientId, me, q)), canSend: true };
    });
  }

  sendAsTeam(patientId: string, body: string): Promise<MessageDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await teamMember(tx, patientId);
      await assertPatientActive(tx, patientId);
      return insert(tx, patientId, me, body);
    });
  }

  markReadAsTeam(patientId: string): Promise<void> {
    return this.tenantDb.run(async (tx) => markRead(tx, patientId, await teamMember(tx, patientId)));
  }

  /** Pacientes con mensajes a los que la sesión tiene acceso, el más reciente primero. */
  inbox(): Promise<InboxEntryDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      if (!access.membershipId) throw new ForbiddenException("No tenés un membership activo.");
      const me = access.membershipId;
      const res = await tx.execute(sql`
        select p.id as patient_id, p.full_name as patient_name,
               lm.body, lm.created_at, lm.from_patient,
               (select count(*)::int from patient_messages m
                 where m.patient_id = p.id and m.author_membership_id <> ${me}
                   and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)) as unread
        from patients p
        join lateral (
          select m.body, m.created_at, (mem.role = 'patient') as from_patient
          from patient_messages m join memberships mem on mem.id = m.author_membership_id
          where m.patient_id = p.id order by m.created_at desc limit 1
        ) lm on true
        left join message_reads r on r.patient_id = p.id and r.membership_id = ${me}
        where ${access.isAdmin} or exists (
          select 1 from care_assignments ca
          where ca.patient_id = p.id and ca.membership_id = ${me} and ca.status = 'active')
        order by lm.created_at desc
        limit 100`);
      return (res.rows as InboxRow[]).map((r) => ({
        patientId: r.patient_id,
        patientName: r.patient_name,
        lastMessage: { body: r.body, createdAt: new Date(r.created_at).toISOString(), fromPatient: r.from_patient },
        unread: Number(r.unread),
      }));
    });
  }

  async unread(): Promise<UnreadDto> {
    const inbox = await this.inbox();
    return { total: inbox.reduce((n, e) => n + e.unread, 0) };
  }

  // ── paciente (portal) ──────────────────────────────────────────────────────

  mine(q: MessagesQueryDto): Promise<ThreadDto> {
    return this.tenantDb.run(async (tx) => {
      const { patientId, membershipId } = await patientSelf(tx);
      return { ...(await thread(tx, patientId, membershipId, q)), canSend: await hasCareTeam(tx, patientId) };
    });
  }

  sendMine(body: string): Promise<MessageDto> {
    return this.tenantDb.run(async (tx) => {
      const { patientId, membershipId } = await patientSelf(tx);
      if (!(await hasCareTeam(tx, patientId))) {
        throw new ConflictException("Podés escribir cuando tengas un profesional asignado.");
      }
      return insert(tx, patientId, membershipId, body);
    });
  }

  markMineRead(): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const { patientId, membershipId } = await patientSelf(tx);
      await markRead(tx, patientId, membershipId);
    });
  }
}

type InboxRow = {
  patient_id: string;
  patient_name: string;
  body: string;
  created_at: string | Date;
  from_patient: boolean;
  unread: number | string;
};

/** Membership del equipo con acceso al paciente (admin, o profesional asignado). */
async function teamMember(tx: TenantTx, patientId: string): Promise<string> {
  const access = await resolvePatientAccess(tx);
  await assertCanAccessPatient(tx, patientId, access);
  // Existe en ESTE tenant (bajo RLS). Al admin no lo cubre el chequeo de arriba, y las
  // FK se verifican sin RLS: sin esto, un id de otro tenant dejaría filas huérfanas.
  const [p] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!p) throw new NotFoundException();
  if (!access.membershipId) throw new ForbiddenException("No tenés un membership activo.");
  return access.membershipId;
}

/** La PROPIA ficha (activa) y el membership del paciente de la sesión. */
async function patientSelf(tx: TenantTx): Promise<{ patientId: string; membershipId: string }> {
  const { user } = getAuth();
  const [p] = await tx
    .select({ id: patients.id, archivedAt: patients.archivedAt })
    .from(patients)
    .where(eq(patients.userId, user.id))
    .limit(1);
  if (!p || p.archivedAt) throw new NotFoundException("No encontramos tu ficha de paciente.");
  const { membershipId } = await resolvePatientAccess(tx);
  if (!membershipId) throw new ForbiddenException("No tenés un membership activo.");
  return { patientId: p.id, membershipId };
}

async function hasCareTeam(tx: TenantTx, patientId: string): Promise<boolean> {
  const [a] = await tx
    .select({ id: careAssignments.id })
    .from(careAssignments)
    .where(and(eq(careAssignments.patientId, patientId), eq(careAssignments.status, "active")))
    .limit(1);
  return Boolean(a);
}

async function assertPatientActive(tx: TenantTx, patientId: string) {
  const [p] = await tx.select({ archivedAt: patients.archivedAt }).from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!p) throw new NotFoundException();
  if (p.archivedAt) throw new ConflictException("La ficha del paciente está dada de baja.");
}

async function thread(
  tx: TenantTx,
  patientId: string,
  me: string,
  q: MessagesQueryDto,
): Promise<Omit<ThreadDto, "canSend">> {
  const rows = await tx
    .select({ m: patientMessages, name: users.fullName, role: memberships.role })
    .from(patientMessages)
    .innerJoin(memberships, eq(memberships.id, patientMessages.authorMembershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(patientMessages.patientId, patientId),
        q.after ? gte(patientMessages.createdAt, new Date(q.after)) : undefined,
      ),
    )
    .orderBy(desc(patientMessages.createdAt))
    .limit(PAGE);
  const [read] = await tx
    .select({ at: messageReads.lastReadAt })
    .from(messageReads)
    .where(and(eq(messageReads.patientId, patientId), eq(messageReads.membershipId, me)))
    .limit(1);
  const [unread] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(patientMessages)
    .where(
      and(
        eq(patientMessages.patientId, patientId),
        sql`${patientMessages.authorMembershipId} <> ${me}`,
        read ? sql`${patientMessages.createdAt} > ${read.at}` : undefined,
      ),
    );
  return {
    messages: rows.reverse().map((r) => toDto(r.m, r.name, r.role, me)),
    unread: Number(unread?.n ?? 0),
  };
}

async function insert(tx: TenantTx, patientId: string, me: string, body: string): Promise<MessageDto> {
  const ctx = getTenantContext();
  const [row] = await tx
    .insert(patientMessages)
    .values({ tenantId: ctx.tenantId, region: ctx.region, patientId, authorMembershipId: me, body })
    .returning();
  // Escribir implica haber leído lo anterior.
  await markRead(tx, patientId, me);
  const { user } = getAuth();
  const [u] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, user.id)).limit(1);
  return toDto(row!, u?.name ?? "", user.role, me);
}

async function markRead(tx: TenantTx, patientId: string, me: string): Promise<void> {
  const ctx = getTenantContext();
  await tx
    .insert(messageReads)
    .values({ tenantId: ctx.tenantId, region: ctx.region, patientId, membershipId: me, lastReadAt: sql`now()` })
    .onConflictDoUpdate({
      target: [messageReads.patientId, messageReads.membershipId],
      set: { lastReadAt: sql`greatest(${messageReads.lastReadAt}, now())` },
    });
}

function toDto(
  m: typeof patientMessages.$inferSelect,
  name: string,
  role: MembershipRole,
  me: string,
): MessageDto {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    author: { name, role },
    mine: m.authorMembershipId === me,
  };
}
