import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AgentChatDto, AgentChatResponse } from "@nutreitor/shared";

import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { signAgentContext } from "../../core/security/agent-context.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";
import {
  assertCanAccessPatient,
  resolvePatientAccess,
} from "../patients/patient-access.js";

/**
 * Gateway hacia el servicio de agentes (Python). NO ejecuta inferencia: valida la
 * sesión + el acceso al paciente (scoping assigned-only, igual que el resto), firma
 * un contexto de tenant (HMAC+TTL) y reenvía. El servicio Python verifica la firma
 * y opera bajo RLS. El front nunca habla directo con el servicio.
 */
@Injectable()
export class AgentsService {
  constructor(
    @Inject(APP_ENV) private readonly env: ApiEnv,
    private readonly tenantDb: TenantDbService,
  ) {}

  async chat(dto: AgentChatDto): Promise<AgentChatResponse> {
    // Si la consulta es sobre un paciente, exigí que la sesión pueda accederlo
    // (admin = todos; profesional = sólo asignados). Defensa antes de salir del proceso.
    if (dto.patientId) {
      await this.tenantDb.run(async (tx) => {
        const access = await resolvePatientAccess(tx);
        await assertCanAccessPatient(tx, dto.patientId!, access);
      });
    }

    const ctx = getTenantContext();
    const { user } = getAuth();
    const token = signAgentContext(
      { tenantId: ctx.tenantId, region: ctx.region, userId: user.id, role: user.role },
      this.env.AGENTS_SHARED_SECRET,
      this.env.AGENTS_CONTEXT_TTL_MS,
    );

    let res: Response;
    try {
      res = await fetch(`${this.env.AGENTS_SERVICE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-context": token },
        body: JSON.stringify({
          agent: dto.agent,
          patientId: dto.patientId ?? null,
          conversationId: dto.conversationId ?? null,
          message: dto.message,
        }),
      });
    } catch {
      throw new ServiceUnavailableException("El servicio de agentes no está disponible.");
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `El servicio de agentes respondió ${res.status}.`,
      );
    }
    return (await res.json()) as AgentChatResponse;
  }
}
