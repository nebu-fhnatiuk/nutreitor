import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { salesLeads, users, type SalesLead } from "@nutreitor/db";
import {
  LEAD_ORG_KIND_LABEL,
  type CreateLeadDto,
  type LeadOrgKind,
  type LeadStatus,
  type PlatformMe,
  type SalesLeadDto,
} from "@nutreitor/shared";
import { desc, eq } from "drizzle-orm";

import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { AdminDbService } from "../../core/database/admin-db.service.js";
import { MAIL_SENDER, type MailSender } from "../../core/mail/mail-sender.js";
import { leadReceivedMail, platformNewLeadMail } from "./onboarding-mails.js";

/**
 * Consultas comerciales de la landing (KAN-80, ADR 0041). Plano de control, con la
 * conexión owner: no hay tenant todavía y el rol app no ve la tabla.
 *
 * - `create` es público. Con el campo trampa (`website`) lleno, no se guarda ni se
 *   manda nada, pero se responde igual que un alta (el bot no se entera).
 * - Listar y cambiar el estado es sólo de operadores (lo cuida `PlatformGuard`).
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger("Leads");

  constructor(
    private readonly admin: AdminDbService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  /** `true` si se guardó; `false` si lo descartó el campo trampa. */
  async create(dto: CreateLeadDto): Promise<boolean> {
    if (dto.website) {
      this.logger.warn("Consulta descartada: campo trampa completo.");
      return false;
    }
    await this.admin.db.insert(salesLeads).values({
      fullName: dto.fullName,
      email: dto.email,
      orgName: dto.orgName,
      orgKind: dto.orgKind,
      role: dto.role,
      athletes: dto.athletes,
      message: dto.message,
      consentAt: new Date(),
    });
    await this.notify(dto);
    return true;
  }

  async list(status?: LeadStatus): Promise<SalesLeadDto[]> {
    const rows = await this.admin.db
      .select({ lead: salesLeads, handler: users.fullName })
      .from(salesLeads)
      .leftJoin(users, eq(users.id, salesLeads.handledBy))
      .where(status ? eq(salesLeads.status, status) : undefined)
      .orderBy(desc(salesLeads.createdAt));
    return rows.map((r) => toDto(r.lead, r.handler));
  }

  async setStatus(id: string, status: LeadStatus, by: PlatformMe): Promise<SalesLeadDto> {
    const [row] = await this.admin.db
      .update(salesLeads)
      .set({ status, handledBy: by.id, updatedAt: new Date() })
      .where(eq(salesLeads.id, id))
      .returning();
    if (!row) throw new NotFoundException("No existe esa consulta.");
    return toDto(row, by.fullName);
  }

  /** Acuse a quien escribió y aviso a los operadores. Un fallo de mail no pierde la consulta. */
  private async notify(dto: CreateLeadDto): Promise<void> {
    try {
      await this.mail.send(leadReceivedMail({ to: dto.email, fullName: dto.fullName, orgName: dto.orgName }));
      const operators = await this.admin.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.isPlatformAdmin, true));
      for (const op of operators) {
        await this.mail.send(
          platformNewLeadMail({
            to: op.email,
            orgName: dto.orgName,
            kind: LEAD_ORG_KIND_LABEL[dto.orgKind],
            link: `${this.env.WEB_ROOT_ORIGIN}/plataforma`,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(`No se pudieron mandar los avisos de la consulta: ${(err as Error).message}`);
    }
  }
}

function toDto(r: SalesLead, handler: string | null): SalesLeadDto {
  return {
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    orgName: r.orgName,
    orgKind: r.orgKind as LeadOrgKind,
    role: r.role as SalesLeadDto["role"],
    athletes: r.athletes as SalesLeadDto["athletes"],
    message: r.message,
    status: r.status as LeadStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    handledBy: handler,
  };
}
