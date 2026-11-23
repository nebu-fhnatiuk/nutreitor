import { Module } from "@nestjs/common";

import { AppConfigModule } from "./core/config/app-config.module.js";
import { DatabaseModule } from "./core/database/database.module.js";
import { AuthModule } from "./core/auth/auth.module.js";
import { AuditModule } from "./core/audit/audit.module.js";
import { MailModule } from "./core/mail/mail.module.js";
import { TenantModule } from "./core/tenant/tenant.module.js";
import { RateLimitModule } from "./core/rate-limit/rate-limit.module.js";
import { HealthModule } from "./health/health.module.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";
import { PatientsModule } from "./modules/patients/patients.module.js";
import { TeamModule } from "./modules/team/team.module.js";
import { InvitationsModule } from "./modules/invitations/invitations.module.js";
import { MembersModule } from "./modules/members/members.module.js";
import { PublicModule } from "./modules/public/public.module.js";
import { ProfessionalsModule } from "./modules/professionals/professionals.module.js";
import { PortalModule } from "./modules/portal/portal.module.js";
import { SchedulingModule } from "./modules/scheduling/scheduling.module.js";
import { AgentsModule } from "./modules/agents/agents.module.js";
import { FoodsModule } from "./modules/foods/foods.module.js";
import { OnboardingModule } from "./modules/onboarding/onboarding.module.js";
import { ContactModule } from "./modules/contact/contact.module.js";

/**
 * Raíz de la API.
 *
 * core/  → infraestructura transversal (config, database, tenant, auth, rate-limit).
 * modules/ → bounded contexts del producto; todos implementan el patrón
 *            multi-tenant + RLS + capacidades. Los agentes de IA corren en un
 *            servicio Python aparte (apps/agents); acá vive su gateway (modules/agents).
 *
 * El TenantContextMiddleware se registra globalmente en main.ts (app.use) para
 * abrir el scope de AsyncLocalStorage en todas las rutas sin depender de patrones
 * de ruta wildcard.
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    TenantModule,
    AuthModule,
    AuditModule,
    MailModule,
    RateLimitModule,
    HealthModule,
    OrganizationsModule,
    PatientsModule,
    TeamModule,
    InvitationsModule,
    MembersModule,
    PublicModule,
    ProfessionalsModule,
    PortalModule,
    SchedulingModule,
    AgentsModule,
    FoodsModule,
    OnboardingModule,
    ContactModule,
  ],
})
export class AppModule {}
