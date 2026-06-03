import { Module } from "@nestjs/common";

import { AppConfigModule } from "./core/config/app-config.module.js";
import { DatabaseModule } from "./core/database/database.module.js";
import { AuthModule } from "./core/auth/auth.module.js";
import { AuditModule } from "./core/audit/audit.module.js";
import { MailModule } from "./core/mail/mail.module.js";
import { TenantModule } from "./core/tenant/tenant.module.js";
import { HealthModule } from "./health/health.module.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";
import { PatientsModule } from "./modules/patients/patients.module.js";
import { InvitationsModule } from "./modules/invitations/invitations.module.js";
import { MembersModule } from "./modules/members/members.module.js";
import { PublicModule } from "./modules/public/public.module.js";
import { ProfessionalsModule } from "./modules/professionals/professionals.module.js";
import { SchedulingModule } from "./modules/scheduling/scheduling.module.js";
import { PlansModule } from "./modules/plans/plans.module.js";
import { MetricsModule } from "./modules/metrics/metrics.module.js";

/**
 * Raíz de la API.
 *
 * core/  → infraestructura transversal (config, database, tenant, auth).
 * modules/ → bounded contexts del producto (placeholders salvo organizations y
 *            patients, que demuestran el patrón multi-tenant + RLS).
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
    HealthModule,
    OrganizationsModule,
    PatientsModule,
    InvitationsModule,
    MembersModule,
    PublicModule,
    ProfessionalsModule,
    SchedulingModule,
    PlansModule,
    MetricsModule,
  ],
})
export class AppModule {}
