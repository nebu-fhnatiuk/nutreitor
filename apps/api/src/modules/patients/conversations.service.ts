import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  careAssignments,
  conversationReads,
  conversations,
  memberships,
  messages,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import type {
  ConversationKind,
  ConversationRefDto,
  InboxEntryDto,
  MembershipRole,
  MessageDto,
  MessagesQueryDto,
  ThreadDto,
  UnreadDto,
} from "@nutreitor/shared";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import { resolvePatientAccess } from "./patient-access.js";

/** Tope de mensajes por consulta (la primera carga trae los últimos). */
const PAGE = 200;

type Conversation = typeof conversations.$inferSelect;
interface Me {
  membershipId: string;
  role: MembershipRole;
  /** Ficha propia (sólo rol paciente). */
  patientId: string | null;
}

/**
 * Conversaciones PRIVADAS por par (ADR 0024):
 *  - paciente ↔ profesional: sólo ellos dos; el profesional mientras tenga la
 *    asignación activa (mismo criterio que la ficha). La admin NO participa.
 *  - profesional ↔ administración: el profesional y cualquier admin; los otros
 *    profesionales no la ven.
 * Quien no participa recibe 404 (no se revela que la conversación existe).
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly tenantDb: TenantDbService) {}

  inbox(): Promise<InboxEntryDto[]> {
    return this.tenantDb.run(async (tx) => inbox(tx, await whoAmI(tx)));
  }

  async unread(): Promise<UnreadDto> {
    return { total: (await this.inbox()).reduce((n, e) => n + e.unread, 0) };
  }

  thread(conversationId: string, q: MessagesQueryDto): Promise<ThreadDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await whoAmI(tx);
      const conv = await loadConversation(tx, conversationId, me);
      return { ...(await thread(tx, conv.id, me.membershipId, q)), canSend: await canSend(tx, conv) };
    });
  }

  send(conversationId: string, body: string): Promise<MessageDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await whoAmI(tx);
      const conv = await loadConversation(tx, conversationId, me);
      if (!(await canSend(tx, conv))) {
        throw new ConflictException(
          conv.kind === "patient_professional"
            ? "Esta conversación quedó cerrada: ya no hay una asignación activa entre paciente y profesional."
            : "Esta conversación quedó cerrada.",
        );
      }
      return insert(tx, conv.id, me, body);
    });
  }

  markRead(conversationId: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const me = await whoAmI(tx);
      const conv = await loadConversation(tx, conversationId, me);
      await markRead(tx, conv.id, me.membershipId);
    });
  }

  /**
   * Quien atiende: su conversación con un paciente que tiene asignado (la crea si no
   * existe). Vale para el profesional y para la admin asignada (org individual, ADR
   * 0026): lo que habilita es la asignación, no el rol.
   */
  openWithPatient(patientId: string): Promise<ConversationRefDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await whoAmI(tx);
      if (me.role === "patient" || !(await activeAssignment(tx, patientId, me.membershipId))) {
        throw new NotFoundException();
      }
      return { conversationId: await getOrCreate(tx, "patient_professional", me.membershipId, patientId) };
    });
  }

  /** Profesional: su conversación con la administración. */
  openWithAdmin(): Promise<ConversationRefDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await whoAmI(tx);
      if (me.role !== "professional") throw new NotFoundException();
      return { conversationId: await getOrCreate(tx, "professional_admin", me.membershipId, null) };
    });
  }

  /** Admin: la conversación con un profesional. Paciente: con uno de SUS profesionales. */
  openWithProfessional(membershipId: string): Promise<ConversationRefDto> {
    return this.tenantDb.run(async (tx) => {
      const me = await whoAmI(tx);
      if (me.role === "admin") {
        const [m] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.id, membershipId), eq(memberships.role, "professional"), isNull(memberships.revokedAt)))
          .limit(1);
        if (!m) throw new NotFoundException();
        return { conversationId: await getOrCreate(tx, "professional_admin", membershipId, null) };
      }
      if (me.role === "patient" && me.patientId && (await activeAssignment(tx, me.patientId, membershipId))) {
        return { conversationId: await getOrCreate(tx, "patient_professional", membershipId, me.patientId) };
      }
      throw new NotFoundException();
    });
  }
}

// ── acceso ───────────────────────────────────────────────────────────────────

async function whoAmI(tx: TenantTx): Promise<Me> {
  const { user } = getAuth();
  const { membershipId } = await resolvePatientAccess(tx);
  if (!membershipId) throw new ForbiddenException("No tenés un membership activo.");
  let patientId: string | null = null;
  if (user.role === "patient") {
    const [p] = await tx
      .select({ id: patients.id, archivedAt: patients.archivedAt })
      .from(patients)
      .where(eq(patients.userId, user.id))
      .limit(1);
    if (!p || p.archivedAt) throw new NotFoundException("No encontramos tu ficha de paciente.");
    patientId = p.id;
  }
  return { membershipId, role: user.role, patientId };
}

/** La conversación, sólo si quien consulta participa (si no, 404). */
async function loadConversation(tx: TenantTx, id: string, me: Me): Promise<Conversation> {
  const [conv] = await tx.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv || !(await participates(tx, conv, me))) throw new NotFoundException();
  return conv;
}

async function participates(tx: TenantTx, conv: Conversation, me: Me): Promise<boolean> {
  if (conv.kind === "patient_professional") {
    if (me.role === "patient") return conv.patientId === me.patientId;
    // Sólo la membresía asignada de ESA conversación (profesional, o la admin que
    // atiende en una org individual). Una admin no ve el chat clínico de otros.
    return conv.professionalMembershipId === me.membershipId && (await activeAssignment(tx, conv.patientId!, me.membershipId));
  }
  if (me.role === "admin") return true;
  if (me.role === "professional") return conv.professionalMembershipId === me.membershipId;
  return false;
}

async function canSend(tx: TenantTx, conv: Conversation): Promise<boolean> {
  if (conv.kind === "patient_professional") {
    const [p] = await tx.select({ archivedAt: patients.archivedAt }).from(patients).where(eq(patients.id, conv.patientId!)).limit(1);
    return Boolean(p && !p.archivedAt) && (await activeAssignment(tx, conv.patientId!, conv.professionalMembershipId));
  }
  const [m] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.id, conv.professionalMembershipId), isNull(memberships.revokedAt)))
    .limit(1);
  return Boolean(m);
}

async function activeAssignment(tx: TenantTx, patientId: string, membershipId: string): Promise<boolean> {
  const [a] = await tx
    .select({ id: careAssignments.id })
    .from(careAssignments)
    .where(
      and(
        eq(careAssignments.patientId, patientId),
        eq(careAssignments.membershipId, membershipId),
        eq(careAssignments.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(a);
}

async function getOrCreate(
  tx: TenantTx,
  kind: ConversationKind,
  professionalMembershipId: string,
  patientId: string | null,
): Promise<string> {
  const ctx = getTenantContext();
  const existing = () =>
    tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.kind, kind),
          eq(conversations.professionalMembershipId, professionalMembershipId),
          patientId ? eq(conversations.patientId, patientId) : isNull(conversations.patientId),
        ),
      )
      .limit(1);
  const [found] = await existing();
  if (found) return found.id;
  // Índices únicos parciales: dos aperturas simultáneas no duplican.
  await tx.execute(sql`
    insert into conversations (tenant_id, region, kind, patient_id, professional_membership_id)
    values (${ctx.tenantId}, ${ctx.region}::region, ${kind}::conversation_kind, ${patientId}, ${professionalMembershipId})
    on conflict do nothing`);
  const [created] = await existing();
  return created!.id;
}

// ── bandeja ──────────────────────────────────────────────────────────────────

type EntryRow = {
  conversation_id: string | null;
  kind: ConversationKind;
  title: string;
  patient_id: string | null;
  professional_membership_id: string;
  last_body: string | null;
  last_at: string | Date | null;
  last_mine: boolean | null;
  unread: number | string;
};

/** Conversaciones de quien atiende con sus pacientes asignados (con mensajes). */
function ownPatientConversations(membershipId: string) {
  return sql`select c.id, c.kind, p.full_name, p.id, c.professional_membership_id
    from conversations c join patients p on p.id = c.patient_id
    where c.kind = 'patient_professional' and c.professional_membership_id = ${membershipId}
      and exists (select 1 from care_assignments ca where ca.patient_id = c.patient_id
                  and ca.membership_id = ${membershipId} and ca.status = 'active')
      and exists (select 1 from messages x where x.conversation_id = c.id)`;
}

/** Con quién puede hablar quien consulta, con el último mensaje y sus no leídos. */
async function inbox(tx: TenantTx, me: Me): Promise<InboxEntryDto[]> {
  const entries =
    me.role === "admin"
      ? // Un profesional activo por fila (aunque no haya mensajes: la admin puede escribir).
        sql`select c.id as conversation_id, 'professional_admin'::conversation_kind as kind, u.full_name as title,
                   null::uuid as patient_id, m.id as professional_membership_id
            from memberships m join users u on u.id = m.user_id
            left join conversations c on c.kind = 'professional_admin' and c.professional_membership_id = m.id
            where m.role = 'professional' and m.revoked_at is null
            union all
            -- Si la admin atiende (org individual, ADR 0026): sus propios pacientes.
            ${ownPatientConversations(me.membershipId)}`
      : me.role === "professional"
        ? // La administración (siempre) + pacientes asignados con conversación.
          sql`select c.id as conversation_id, 'professional_admin'::conversation_kind as kind, 'Administración' as title,
                     null::uuid as patient_id, ${me.membershipId}::uuid as professional_membership_id
              from (select 1) one
              left join conversations c on c.kind = 'professional_admin' and c.professional_membership_id = ${me.membershipId}
              union all
              ${ownPatientConversations(me.membershipId)}`
        : // Paciente: sus profesionales asignados + conversaciones anteriores con mensajes.
          sql`select c.id as conversation_id, 'patient_professional'::conversation_kind as kind, u.full_name as title,
                     ${me.patientId}::uuid as patient_id, ca.membership_id as professional_membership_id
              from care_assignments ca
              join memberships m on m.id = ca.membership_id join users u on u.id = m.user_id
              left join conversations c on c.kind = 'patient_professional' and c.patient_id = ca.patient_id
                                       and c.professional_membership_id = ca.membership_id
              where ca.patient_id = ${me.patientId} and ca.status = 'active'
              union
              select c.id, c.kind, u.full_name, c.patient_id, c.professional_membership_id
              from conversations c
              join memberships m on m.id = c.professional_membership_id join users u on u.id = m.user_id
              where c.kind = 'patient_professional' and c.patient_id = ${me.patientId}
                and exists (select 1 from messages x where x.conversation_id = c.id)`;

  const res = await tx.execute(sql`
    with e as (${entries})
    select e.*, lm.body as last_body, lm.created_at as last_at,
           (lm.author_membership_id = ${me.membershipId}) as last_mine,
           (select count(*)::int from messages x
             where e.conversation_id is not null and x.conversation_id = e.conversation_id
               and x.author_membership_id <> ${me.membershipId}
               and x.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)) as unread
    from e
    left join lateral (
      select x.body, x.created_at, x.author_membership_id from messages x
      where x.conversation_id = e.conversation_id order by x.created_at desc limit 1
    ) lm on true
    left join conversation_reads r on r.conversation_id = e.conversation_id and r.membership_id = ${me.membershipId}
    order by (e.kind = 'professional_admin' and ${me.role === "professional"}) desc,
             lm.created_at desc nulls last, e.title
    limit 200`);
  return (res.rows as EntryRow[]).map((r) => ({
    conversationId: r.conversation_id,
    kind: r.kind,
    title: r.title,
    patientId: r.patient_id,
    professionalMembershipId: r.professional_membership_id,
    lastMessage: r.last_at
      ? { body: r.last_body!, createdAt: new Date(r.last_at).toISOString(), mine: Boolean(r.last_mine) }
      : null,
    unread: Number(r.unread),
  }));
}

// ── mensajes ─────────────────────────────────────────────────────────────────

async function thread(
  tx: TenantTx,
  conversationId: string,
  me: string,
  q: MessagesQueryDto,
): Promise<Omit<ThreadDto, "canSend">> {
  const rows = await tx
    .select({ m: messages, name: users.fullName, role: memberships.role })
    .from(messages)
    .innerJoin(memberships, eq(memberships.id, messages.authorMembershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        q.after ? gte(messages.createdAt, new Date(q.after)) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(PAGE);
  const [read] = await tx
    .select({ at: conversationReads.lastReadAt })
    .from(conversationReads)
    .where(and(eq(conversationReads.conversationId, conversationId), eq(conversationReads.membershipId, me)))
    .limit(1);
  const [unread] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`${messages.authorMembershipId} <> ${me}`,
        read ? sql`${messages.createdAt} > ${read.at}` : undefined,
      ),
    );
  return {
    messages: rows.reverse().map((r) => toDto(r.m, r.name, r.role, me)),
    unread: Number(unread?.n ?? 0),
  };
}

async function insert(tx: TenantTx, conversationId: string, me: Me, body: string): Promise<MessageDto> {
  const ctx = getTenantContext();
  const [row] = await tx
    .insert(messages)
    .values({ tenantId: ctx.tenantId, region: ctx.region, conversationId, authorMembershipId: me.membershipId, body })
    .returning();
  // Escribir implica haber leído lo anterior.
  await markRead(tx, conversationId, me.membershipId);
  const { user } = getAuth();
  const [u] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, user.id)).limit(1);
  return toDto(row!, u?.name ?? "", me.role, me.membershipId);
}

async function markRead(tx: TenantTx, conversationId: string, me: string): Promise<void> {
  const ctx = getTenantContext();
  await tx
    .insert(conversationReads)
    .values({ conversationId, membershipId: me, tenantId: ctx.tenantId, region: ctx.region, lastReadAt: sql`now()` })
    .onConflictDoUpdate({
      target: [conversationReads.conversationId, conversationReads.membershipId],
      set: { lastReadAt: sql`greatest(${conversationReads.lastReadAt}, now())` },
    });
}

function toDto(m: typeof messages.$inferSelect, name: string, role: MembershipRole, me: string): MessageDto {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    author: { name, role },
    mine: m.authorMembershipId === me,
  };
}
