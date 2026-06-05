import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { agentChatSchema, type AgentChatDto, type AgentChatResponse } from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AgentsService } from "./agents.service.js";

/**
 * Gateway de agentes. Autenticado y gateado por capacidad `agent:use`; el scoping
 * fino (paciente asignado) y la firma del contexto los hace el service.
 */
@Controller("agents")
@UseGuards(JwtAuthGuard, CapabilityGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post("chat")
  @RequireCapability("agent:use")
  chat(
    @Body(new ZodValidationPipe(agentChatSchema)) dto: AgentChatDto,
  ): Promise<AgentChatResponse> {
    return this.agents.chat(dto);
  }
}
