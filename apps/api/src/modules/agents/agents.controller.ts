import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  agentChatSchema,
  portalAgentChatSchema,
  type AgentChatDto,
  type AgentChatResponse,
  type AgentConsentDto,
  type AgentConversationDetailDto,
  type AgentConversationSummaryDto,
  type PortalAgentChatDto,
} from "@nutreitor/shared";

import { CapabilityGuard } from "../../core/auth/capability.guard.js";
import { ModuleGuard } from "../../core/auth/module.guard.js";
import { JwtAuthGuard } from "../../core/auth/guards/jwt-auth.guard.js";
import { RequireCapability } from "../../core/auth/require-capability.decorator.js";
import { RequireModule } from "../../core/auth/require-module.decorator.js";
import { ZodValidationPipe } from "../../core/pipes/zod-validation.pipe.js";
import { AgentsService } from "./agents.service.js";

/**
 * Gateway de agentes — lado PROFESIONAL (`agent:use`). NUTRI sobre un paciente
 * asignado, y supervisión de las charlas del paciente con los asistentes del portal
 * (CHEF/PSICO). El scoping fino y la firma del contexto los hace el service.
 */
@Controller("agents")
@UseGuards(JwtAuthGuard, CapabilityGuard, ModuleGuard)
@RequireModule("agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post("chat")
  @RequireCapability("agent:use")
  chat(
    @Body(new ZodValidationPipe(agentChatSchema)) dto: AgentChatDto,
  ): Promise<AgentChatResponse> {
    return this.agents.chat(dto);
  }

  /** Charlas del paciente con los asistentes del portal (para el profesional asignado). */
  @Get("conversations")
  @RequireCapability("agent:use")
  listConversations(
    @Query("patientId", new ParseUUIDPipe()) patientId: string,
  ): Promise<AgentConversationSummaryDto[]> {
    return this.agents.listPatientConversations(patientId);
  }

  @Get("conversations/:id")
  @RequireCapability("agent:use")
  getConversation(
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<AgentConversationDetailDto> {
    return this.agents.getConversation(id);
  }
}

/**
 * Gateway de agentes — lado PACIENTE (`portal:agent`). CHEF y PSICO sobre la PROPIA
 * ficha (el service resuelve "mi paciente"; nunca recibe un patientId del cliente).
 * Requiere consentimiento; PSICO además requiere profesional asignado (supervisado).
 */
@Controller("portal/agents")
@UseGuards(JwtAuthGuard, CapabilityGuard, ModuleGuard)
@RequireModule("agents")
export class PortalAgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get("consent")
  @RequireCapability("portal:agent")
  getConsent(): Promise<AgentConsentDto> {
    return this.agents.getConsent();
  }

  @Post("consent")
  @RequireCapability("portal:agent")
  acceptConsent(): Promise<AgentConsentDto> {
    return this.agents.acceptConsent();
  }

  @Post("chat")
  @RequireCapability("portal:agent")
  chat(
    @Body(new ZodValidationPipe(portalAgentChatSchema)) dto: PortalAgentChatDto,
  ): Promise<AgentChatResponse> {
    return this.agents.chatAsPatient(dto);
  }
}
