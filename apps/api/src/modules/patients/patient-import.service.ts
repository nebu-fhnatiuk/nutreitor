import { randomUUID } from "node:crypto";

import { Inject, Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
  auditLog,
  invitations,
  memberships,
  patientGroupMembers,
  patientGroups,
  patients,
  users,
  type TenantTx,
} from "@nutreitor/db";
import {
  normalizeGroupName,
  parseImport,
  type ImportPatientsDto,
  type ImportPreviewDto,
  type ImportResultDto,
} from "@nutreitor/shared";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { AuditService } from "../../core/audit/audit.service.js";
import { generateToken, hashToken } from "../../core/crypto/tokens.js";
import { TenantDbService } from "../../core/database/tenant-db.service.js";
import { APP_ENV, type ApiEnv } from "../../core/config/app-config.module.js";
import { getAuth } from "../../core/tenant/tenant-context.store.js";
import { CareAssignmentsService } from "./care-assignments.service.js";
import { resolvePatientAccess } from "./patient-access.js";

/** Lo que la validación contra la base deja resuelto para el import. */
interface Resolved {
  preview: ImportPreviewDto;
  groupIds: Map<string, string>;
  professionalIds: Map<string, string>;
}

/**
 * Import de deportistas desde un CSV (KAN-42/43/44, ADR 0043). La vista previa y
 * el import usan la MISMA validación; el import la repite dentro de su transacción
 * y, si queda un error, no escribe nada (todo o nada).
 */
@Injectable()
export class PatientImportService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly audit: AuditService,
    private readonly assignments: CareAssignmentsService,
    @Inject(APP_ENV) private readonly env: ApiEnv,
  ) {}

  preview(dto: ImportPatientsDto): Promise<ImportPreviewDto> {
    return this.tenantDb.run(async (tx) => (await this.resolve(tx, dto)).preview);
  }

  async import(dto: ImportPatientsDto): Promise<ImportResultDto> {
    const ctx = this.tenantDb.context;
    const { user, org } = getAuth();
    return this.tenantDb.run(async (tx) => {
      const { preview, groupIds, professionalIds } = await this.resolve(tx, dto);
      if (!preview.canImport) {
        // 422 con la vista previa: la pantalla muestra los errores de nuevo.
        throw new UnprocessableEntityException({ message: "El archivo tiene errores.", preview });
      }
      const rows = preview.rows;
      const ids = rows.map(() => randomUUID());

      await tx.insert(patients).values(
        rows.map((r, i) => ({
          id: ids[i]!,
          tenantId: ctx.tenantId,
          region: ctx.region,
          fullName: r.fullName,
          email: r.email,
          documentId: r.documentId,
          birthDate: r.birthDate,
          sex: r.sex,
          phone: r.phone,
        })),
      );
      await tx.insert(auditLog).values(
        ids.map((id) => ({
          organizationId: ctx.orgId,
          region: ctx.region,
          actorUserId: user.id,
          actorRole: user.role,
          action: "patient.created",
          targetType: "patient",
          targetId: id,
          metadata: { source: "import" },
        })),
      );

      // Grupos (KAN-44): todos los de la fila, ya resueltos a id.
      const groupRows = rows.flatMap((r, i) =>
        r.groups.map((g) => ({
          tenantId: ctx.tenantId,
          region: ctx.region,
          groupId: groupIds.get(normalizeGroupName(g))!,
          patientId: ids[i]!,
        })),
      );
      if (groupRows.length) await tx.insert(patientGroupMembers).values(groupRows).onConflictDoNothing();

      // Invitaciones (KAN-43): las manda el worker. El hash es de un token que nadie
      // conoce; el worker genera el real al enviar. Van antes de asignar: la anamnesis
      // automática (KAN-90) encuentra la invitación pendiente y no crea otra.
      const toInvite = dto.invite ? rows.map((r, i) => ({ r, id: ids[i]! })).filter(({ r }) => r.email) : [];
      if (toInvite.length) {
        const emails = toInvite.map(({ r }) => r.email!);
        await tx
          .update(invitations)
          .set({ status: "revoked" })
          .where(and(eq(invitations.organizationId, ctx.orgId), inArray(invitations.email, emails), eq(invitations.status, "pending")));
        const now = new Date();
        const invited = await tx
          .insert(invitations)
          .values(
            toInvite.map(({ r, id }) => ({
              organizationId: ctx.orgId,
              region: ctx.region,
              email: r.email!,
              role: "patient" as const,
              tokenHash: hashToken(generateToken()),
              status: "pending" as const,
              expiresAt: new Date(now.getTime() + this.env.INVITE_TTL_DAYS * 86_400_000),
              invitedByUserId: user.id,
              patientId: id,
              queuedAt: now,
            })),
          )
          .returning({ id: invitations.id });
        await tx.insert(auditLog).values(
          invited.map((inv) => ({
            organizationId: ctx.orgId,
            region: ctx.region,
            actorUserId: user.id,
            actorRole: user.role,
            action: "member.invited",
            targetType: "invitation",
            targetId: inv.id,
            metadata: { role: "patient", source: "import" },
          })),
        );
      }

      // Profesional (KAN-44): la misma asignación de siempre. En una org de una
      // persona, sin columna, el deportista es de quien importa (ADR 0026).
      const self = org.kind === "individual" ? (await resolvePatientAccess(tx)).membershipId : null;
      let assigned = 0;
      for (const [i, r] of rows.entries()) {
        const membershipId = r.professionalEmail ? professionalIds.get(r.professionalEmail) : self;
        if (!membershipId) continue;
        // Con "invitar" la anamnesis automática (KAN-90) viaja en la invitación de
        // arriba; sin "invitar", se respeta: no se pide ni se invita.
        await this.assignments.assignInTx(tx, ids[i]!, { membershipId, locationId: null }, { autoIntake: dto.invite });
        assigned++;
      }

      const result: ImportResultDto = {
        created: rows.length,
        invited: toInvite.length,
        assigned,
        grouped: new Set(groupRows.map((g) => g.patientId)).size,
      };
      await this.audit.recordForSession(tx, {
        action: "patients.imported",
        targetType: "organization",
        targetId: ctx.orgId,
        metadata: { ...result },
      });
      return result;
    });
  }

  /** Validación completa: la del archivo más la que necesita la base. */
  private async resolve(tx: TenantTx, dto: ImportPatientsDto): Promise<Resolved> {
    const { org } = getAuth();
    const parsed = parseImport(dto.csv);
    const rows = parsed.rows;
    const fileErrors = [...parsed.fileErrors];
    if (dto.invite && org.status !== "active") {
      fileErrors.push("Vas a poder invitar al portal cuando aprobemos tu organización. Importá sin invitar.");
    }

    // Duplicados contra la organización (también archivados: se restauran, no se duplican).
    const emails = [...new Set(rows.map((r) => r.email).filter((e): e is string => !!e))];
    const docs = [...new Set(rows.map((r) => r.documentId).filter((d): d is string => !!d))];
    if (emails.length || docs.length) {
      const existing = await tx
        .select({ email: patients.email, documentId: patients.documentId, archivedAt: patients.archivedAt })
        .from(patients)
        .where(
          or(
            emails.length ? inArray(sql`lower(${patients.email})`, emails) : undefined,
            docs.length ? inArray(sql`regexp_replace(${patients.documentId}, '[.\\s]', '', 'g')`, docs) : undefined,
          ),
        );
      const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]));
      const byDoc = new Map(existing.filter((e) => e.documentId).map((e) => [e.documentId!.replace(/[.\s]/g, ""), e]));
      for (const r of rows) {
        const hit = (r.email && byEmail.get(r.email)) || (r.documentId && byDoc.get(r.documentId));
        if (hit) {
          const what = r.email && byEmail.get(r.email) ? "ese email" : "ese documento";
          r.errors.push(`Ya hay un deportista con ${what}${hit.archivedAt ? " (archivado)" : ""}.`);
        }
      }
    }

    // Invitar a alguien que ya es miembro de la organización no tiene sentido.
    if (dto.invite && emails.length) {
      const members = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(isNull(memberships.revokedAt), inArray(users.email, emails)));
      const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
      for (const r of rows) {
        if (r.email && memberEmails.has(r.email)) r.errors.push("Ese email ya tiene cuenta en la organización; no se puede invitar.");
      }
    }

    // Grupos por nombre (KAN-44): sólo los que existen.
    const groupIds = new Map<string, string>();
    const wantedGroups = [...new Set(rows.flatMap((r) => r.groups.map(normalizeGroupName)))];
    if (wantedGroups.length) {
      const found = await tx
        .select({ id: patientGroups.id, name: patientGroups.name })
        .from(patientGroups)
        .where(inArray(sql`lower(btrim(${patientGroups.name}))`, wantedGroups));
      for (const g of found) groupIds.set(normalizeGroupName(g.name), g.id);
      for (const r of rows) {
        for (const g of r.groups) if (!groupIds.has(normalizeGroupName(g))) r.errors.push(`No existe el grupo "${g}". Crealo primero en Grupos.`);
      }
    }

    // Profesionales por email: miembros activos que no sean deportistas.
    const professionalIds = new Map<string, string>();
    const wantedPros = [...new Set(rows.map((r) => r.professionalEmail).filter((e): e is string => !!e))];
    if (wantedPros.length) {
      const found = await tx
        .select({ id: memberships.id, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(isNull(memberships.revokedAt), ne(memberships.role, "patient"), inArray(users.email, wantedPros)));
      for (const p of found) professionalIds.set(p.email.toLowerCase(), p.id);
      for (const r of rows) {
        if (r.professionalEmail && !professionalIds.has(r.professionalEmail)) {
          r.errors.push(`No hay un profesional activo con el email "${r.professionalEmail}".`);
        }
      }
    }

    const errorCount = rows.filter((r) => r.errors.length > 0).length;
    const preview: ImportPreviewDto = {
      rows,
      fileErrors,
      ignoredHeaders: parsed.ignoredHeaders,
      errorCount,
      inviteCount: dto.invite ? rows.filter((r) => r.email && r.errors.length === 0).length : 0,
      canImport: fileErrors.length === 0 && errorCount === 0 && rows.length > 0,
    };
    return { preview, groupIds, professionalIds };
  }
}

