import { BadRequestException, Injectable } from "@nestjs/common";
import { orgModules, memberships, type TenantTx } from "@nutreitor/db";
import {
  MODULE_CATALOG,
  moduleKeys,
  type InstallModuleDto,
  type ModuleKey,
  type OrgModuleStateDto,
} from "@nutreitor/shared";
import { and, eq, isNull } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { getAuth, getTenantContext } from "../../core/tenant/tenant-context.store.js";

/**
 * Módulos/complementos instalables por organización (ADR 0016). El admin los
 * instala (aceptando términos + plan) y desinstala (soft: conserva datos). El
 * gateway exige el módulo activo vía ModuleGuard.
 */
@Injectable()
export class OrgModulesService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
  ) {}

  /** Catálogo + estado de instalación para la org actual. */
  list(): Promise<OrgModuleStateDto[]> {
    return this.tenantDb.run((tx) => this.listIn(tx));
  }

  install(module: ModuleKey, dto: InstallModuleDto): Promise<OrgModuleStateDto[]> {
    const entry = MODULE_CATALOG[module];
    if (!entry.plans.some((p) => p.id === dto.plan)) {
      throw new BadRequestException("Plan inválido para este complemento.");
    }
    return this.tenantDb.run(async (tx) => {
      const ctx = getTenantContext();
      const membershipId = await this.currentMembershipId(tx);
      const now = new Date();
      await tx
        .insert(orgModules)
        .values({
          tenantId: ctx.tenantId,
          region: ctx.region,
          module,
          status: "active",
          plan: dto.plan,
          termsVersion: entry.termsVersion,
          installedByMembershipId: membershipId,
          installedAt: now,
          uninstalledAt: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [orgModules.tenantId, orgModules.module],
          set: {
            status: "active",
            plan: dto.plan,
            termsVersion: entry.termsVersion,
            installedByMembershipId: membershipId,
            installedAt: now,
            uninstalledAt: null,
            updatedAt: now,
          },
        });
      await this.audit.recordForSession(tx, {
        action: "module.installed",
        targetType: "org_module",
        metadata: { module, plan: dto.plan, termsVersion: entry.termsVersion },
      });
      return this.listIn(tx);
    });
  }

  uninstall(module: ModuleKey): Promise<OrgModuleStateDto[]> {
    return this.tenantDb.run(async (tx) => {
      const now = new Date();
      // Soft: conserva conversaciones/consentimientos; sólo deshabilita el acceso.
      await tx
        .update(orgModules)
        .set({ status: "inactive", uninstalledAt: now, updatedAt: now })
        .where(eq(orgModules.module, module));
      await this.audit.recordForSession(tx, {
        action: "module.uninstalled",
        targetType: "org_module",
        metadata: { module },
      });
      return this.listIn(tx);
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────--

  private async currentMembershipId(tx: TenantTx): Promise<string | null> {
    const { user } = getAuth();
    const [m] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), isNull(memberships.revokedAt)))
      .limit(1);
    return m?.id ?? null;
  }

  private async listIn(tx: TenantTx): Promise<OrgModuleStateDto[]> {
    const rows = await tx.select().from(orgModules);
    const byKey = new Map(rows.map((r) => [r.module, r]));
    return moduleKeys.map((key) => {
      const entry = MODULE_CATALOG[key];
      const row = byKey.get(key);
      return {
        key,
        name: entry.name,
        blurb: entry.blurb,
        status: row?.status === "active" ? "active" : "inactive",
        plan: row?.plan ?? null,
        termsVersion: row?.termsVersion ?? null,
        installedAt: row?.installedAt ? row.installedAt.toISOString() : null,
        currentTermsVersion: entry.termsVersion,
      } satisfies OrgModuleStateDto;
    });
  }
}
