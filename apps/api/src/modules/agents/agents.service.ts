import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AGENT_CONSENT_VERSION,
  type AgentChatDto,
  type AgentChatResponse,
  type AgentConsentDto,
  type AgentConversationDetailDto,
  type AgentConversationSummaryDto,
  type MealPlanBody,
  normalizeMealPlanBody,
  planDraftProposalSchema,
  type PlanDraftDto,
  type PlanDraftRequestDto,
  type PortalAgentChatDto,
  resolvePlanDraft,
} from "@nutreitor/shared";
import {
  agentConsents,
  agentConversations,
  agentMessages,
  agentRuns,
  careAssignments,
  mealPlans,
  patients,
  type TenantTx,
} from "@nutreitor/db";
import { and, desc, eq, sql } from "drizzle-orm";

import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { parseAgentSecrets, signAgentContext } from "../../core/security/agent-context.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import {
  assertCanAccessPatient,
  resolvePatientAccess,
} from "../patients/patient-access.js";
import { FoodsService } from "../foods/foods.service.js";
import { checkAgentBudget, loadAgentUsage } from "./agent-budget.js";

/**
 * Gateway hacia el servicio de agentes (Python). NO ejecuta inferencia. Dos caras:
 *  - PROFESIONAL: NUTRI sobre un paciente asignado (output = borrador a revisar).
 *  - PACIENTE (portal): CHEF y PSICO sobre la PROPIA ficha. PSICO es supervisado
 *    (requiere profesional asignado) y ambos requieren consentimiento (ADR 0015).
 * En todos los casos firma un contexto de tenant (HMAC+TTL) y opera bajo RLS; el
 * front nunca habla directo con el servicio.
 */
@Injectable()
export class AgentsService {
  constructor(
    @Inject(APP_ENV) private readonly env: ApiEnv,
    private readonly tenantDb: TenantDbService,
    private readonly foods: FoodsService,
  ) {}

  // ── PROFESIONAL: NUTRI ─────────────────────────────────────────────────────

  async chat(dto: AgentChatDto): Promise<AgentChatResponse> {
    // Si la consulta es sobre un paciente, exigí acceso (admin = todos; profesional
    // = sólo asignados). Defensa antes de salir del proceso.
    if (dto.patientId) {
      await this.tenantDb.run(async (tx) => {
        const access = await resolvePatientAccess(tx);
        await assertCanAccessPatient(tx, dto.patientId!, access);
      });
    }
    await this.assertWithinBudget();
    return this.forward({
      agent: dto.agent,
      patientId: dto.patientId ?? null,
      conversationId: dto.conversationId ?? null,
      message: dto.message,
    });
  }

  /**
   * Borrador de plan (ADR 0020): NUTRI propone slugs del catálogo + gramos; acá se
   * valida (es salida de un modelo), se resuelve contra el catálogo y se calculan
   * los macros. No se guarda nada del plan: el editor lo abre para revisar.
   */
  async planDraft(dto: PlanDraftRequestDto): Promise<PlanDraftDto> {
    const targets = await this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, dto.patientId, access);
      if (dto.targets && Object.values(dto.targets).some((v) => v != null)) return dto.targets;
      const [plan] = await tx
        .select({ body: mealPlans.body })
        .from(mealPlans)
        .where(and(eq(mealPlans.patientId, dto.patientId), eq(mealPlans.status, "active")))
        .limit(1);
      return plan ? (normalizeMealPlanBody(plan.body) as MealPlanBody).targets : undefined;
    });
    await this.assertWithinBudget();
    const res = await this.post<{
      conversationId: string;
      model: string;
      status: "ok" | "error";
      proposal: unknown;
    }>("/plan-draft", {
      patientId: dto.patientId,
      targets: targets ?? null,
      instructions: dto.instructions ?? null,
    });
    if (res.status !== "ok") {
      throw new ServiceUnavailableException("NUTRI no pudo armar el borrador. Probá de nuevo en un rato.");
    }
    const proposal = planDraftProposalSchema.safeParse(res.proposal);
    if (!proposal.success) throw new BadGatewayException("NUTRI devolvió un borrador inválido.");
    const slugs = [...new Set(proposal.data.meals.flatMap((m) => m.items.map((i) => i.slug)))];
    const catalog = await this.foods.catalogBySlugs(slugs);
    const { body, unresolved } = resolvePlanDraft(proposal.data, catalog, targets);
    return {
      conversationId: res.conversationId,
      model: res.model,
      body,
      notes: proposal.data.notes,
      unresolved,
    };
  }

  // ── PACIENTE: CHEF / PSICO ──────────────────────────────────────────────────

  async chatAsPatient(dto: PortalAgentChatDto): Promise<AgentChatResponse> {
    const gate = await this.tenantDb.run(async (tx) => {
      const patient = await this.resolveMyPatient(tx);
      const consented = await this.hasConsent(tx, patient.id);
      if (!consented) {
        throw new ForbiddenException("Necesitás aceptar el uso de asistentes primero.");
      }
      // PSICO supervisado: sólo si el paciente tiene un profesional ASIGNADO activo.
      if (dto.agent === "psico") {
        const [a] = await tx
          .select({ id: careAssignments.id })
          .from(careAssignments)
          .where(
            and(
              eq(careAssignments.patientId, patient.id),
              eq(careAssignments.status, "active"),
            ),
          )
          .limit(1);
        if (!a) {
          throw new ForbiddenException(
            "PSICO está disponible cuando tenés un profesional asignado que pueda acompañarte.",
          );
        }
      }
      return { patientId: patient.id };
    });

    await this.assertWithinBudget();
    return this.forward({
      agent: dto.agent,
      patientId: gate.patientId,
      conversationId: dto.conversationId ?? null,
      message: dto.message,
    });
  }

  // ── Consentimiento del paciente ─────────────────────────────────────────────

  getConsent(): Promise<AgentConsentDto> {
    return this.tenantDb.run(async (tx) => {
      const patient = await this.resolveMyPatient(tx);
      const [c] = await tx
        .select({ version: agentConsents.version, acceptedAt: agentConsents.acceptedAt })
        .from(agentConsents)
        .where(eq(agentConsents.patientId, patient.id))
        .orderBy(desc(agentConsents.acceptedAt))
        .limit(1);
      const accepted = c?.version === AGENT_CONSENT_VERSION;
      return {
        accepted,
        version: c?.version ?? null,
        acceptedAt: c?.acceptedAt ? c.acceptedAt.toISOString() : null,
      };
    });
  }

  acceptConsent(): Promise<AgentConsentDto> {
    return this.tenantDb.run(async (tx) => {
      const patient = await this.resolveMyPatient(tx);
      const ctx = getTenantContext();
      await tx.insert(agentConsents).values({
        tenantId: ctx.tenantId,
        region: ctx.region,
        patientId: patient.id,
        version: AGENT_CONSENT_VERSION,
      });
      return {
        accepted: true,
        version: AGENT_CONSENT_VERSION,
        acceptedAt: new Date().toISOString(),
      };
    });
  }

  // ── Supervisión: el profesional asignado lee las charlas del paciente ───────

  async listPatientConversations(patientId: string): Promise<AgentConversationSummaryDto[]> {
    return this.tenantDb.run(async (tx) => {
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, patientId, access);
      const rows = await tx
        .select({
          id: agentConversations.id,
          agent: agentConversations.agent,
          createdAt: agentConversations.createdAt,
          messageCount: sql<string>`count(distinct ${agentMessages.id})`,
          lastMessageAt: sql<string | null>`max(${agentMessages.createdAt})`,
          crisis: sql<boolean>`bool_or(${agentRuns.status} = 'crisis')`,
        })
        .from(agentConversations)
        .leftJoin(agentMessages, eq(agentMessages.conversationId, agentConversations.id))
        .leftJoin(agentRuns, eq(agentRuns.conversationId, agentConversations.id))
        .where(eq(agentConversations.patientId, patientId))
        .groupBy(agentConversations.id)
        .orderBy(desc(agentConversations.createdAt));
      return rows.map((r) => ({
        id: r.id,
        agent: r.agent,
        createdAt: r.createdAt.toISOString(),
        messageCount: Number(r.messageCount ?? 0),
        crisis: r.crisis === true,
        lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      }));
    });
  }

  async getConversation(conversationId: string): Promise<AgentConversationDetailDto> {
    return this.tenantDb.run(async (tx) => {
      const [conv] = await tx
        .select({ id: agentConversations.id, agent: agentConversations.agent, patientId: agentConversations.patientId })
        .from(agentConversations)
        .where(eq(agentConversations.id, conversationId))
        .limit(1);
      if (!conv || !conv.patientId) throw new NotFoundException();
      // El profesional debe poder acceder al paciente sujeto de la charla.
      const access = await resolvePatientAccess(tx);
      await assertCanAccessPatient(tx, conv.patientId, access);

      const crisisRows = await tx
        .select({ crisis: sql<boolean>`bool_or(${agentRuns.status} = 'crisis')` })
        .from(agentRuns)
        .where(eq(agentRuns.conversationId, conversationId));
      const crisis = crisisRows[0]?.crisis === true;
      const msgs = await tx
        .select({
          id: agentMessages.id,
          role: agentMessages.role,
          content: agentMessages.content,
          createdAt: agentMessages.createdAt,
        })
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, conversationId))
        .orderBy(agentMessages.createdAt);
      return {
        id: conv.id,
        agent: conv.agent,
        crisis: crisis === true,
        messages: msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────--

  /** Resuelve la PROPIA ficha del paciente de la sesión (nunca un id del cliente). */
  private async resolveMyPatient(tx: TenantTx): Promise<{ id: string }> {
    const { user } = getAuth();
    const [p] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.userId, user.id))
      .limit(1);
    if (!p) throw new NotFoundException("No encontramos tu ficha de paciente.");
    return p;
  }

  private async hasConsent(tx: TenantTx, patientId: string): Promise<boolean> {
    const [c] = await tx
      .select({ version: agentConsents.version })
      .from(agentConsents)
      .where(
        and(
          eq(agentConsents.patientId, patientId),
          eq(agentConsents.version, AGENT_CONSENT_VERSION),
        ),
      )
      .limit(1);
    return Boolean(c);
  }

  /** Tope de costo/abuso por tenant: corta ACÁ antes de egresar (429). */
  private async assertWithinBudget(): Promise<void> {
    const usage = await this.tenantDb.run((tx) => loadAgentUsage(tx));
    const verdict = checkAgentBudget(usage, {
      ratePerMin: this.env.AGENTS_RATELIMIT_PER_MIN,
      monthlyTokenCap: this.env.AGENTS_MONTHLY_TOKEN_CAP,
    });
    if (!verdict.ok) {
      throw new HttpException(
        verdict.reason === "rate"
          ? "Demasiadas consultas al asistente en este momento. Probá en un minuto."
          : "Se alcanzó el tope mensual de uso del asistente para esta organización.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Reenvía un chat al servicio Python. */
  private forward(payload: {
    agent: string;
    patientId: string | null;
    conversationId: string | null;
    message: string;
  }): Promise<AgentChatResponse> {
    return this.post<AgentChatResponse>("/chat", payload);
  }

  /** Firma el contexto de tenant y hace el POST al servicio Python. */
  private async post<T>(path: string, payload: unknown): Promise<T> {
    const ctx = getTenantContext();
    const { user } = getAuth();
    // Se firma SIEMPRE con el primary (primer secreto de la lista de rotación).
    const primary = parseAgentSecrets(
      this.env.AGENTS_SHARED_SECRETS,
      this.env.AGENTS_SHARED_SECRET,
    )[0]!;
    const token = signAgentContext(
      { tenantId: ctx.tenantId, region: ctx.region, userId: user.id, role: user.role },
      primary,
      this.env.AGENTS_CONTEXT_TTL_MS,
    );

    let res: Response;
    try {
      res = await fetch(`${this.env.AGENTS_SERVICE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-context": token },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ServiceUnavailableException("El servicio de agentes no está disponible.");
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `El servicio de agentes respondió ${res.status}.`,
      );
    }
    return (await res.json()) as T;
  }
}
