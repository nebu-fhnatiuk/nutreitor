import {
  auditLog,
  careAssignments,
  createDb,
  invitations,
  patientGroupMembers,
  patients,
  type Database,
} from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { IMPORT_TEMPLATE, parseCsv, parseImport, parseImportDate, type OrgStatus } from "@nutreitor/shared";
import { UnprocessableEntityException } from "@nestjs/common";
import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { PatientImportService } from "../src/modules/patients/patient-import.service.js";

/**
 * Import de deportistas desde un CSV (KAN-42/43/44, ADR 0043), contra Postgres real:
 * lectura del archivo, validación por fila, todo o nada, grupos y profesional en la
 * misma transacción e invitaciones encoladas para el worker (sin mandar mails).
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const RUN = Math.random().toString(36).slice(2, 8);
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const GROUP = "Primera división";
const env = { INVITE_TTL_DAYS: 7 } as unknown as ApiEnv;

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let importer: PatientImportService;

function asAdmin<T>(fn: () => Promise<T>, status: OrgStatus = "active"): Promise<T> {
  const org = SEED.orgDemo;
  return tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org: { id: org.id, name: org.name, slug: org.slug, region: org.region, status, kind: org.kind },
      user: { id: ADMIN_USER, role: "admin" },
    },
    fn,
  );
}

const header = "Nombre y apellido;E-mail;DNI;Fecha de nacimiento;Sexo;Teléfono;Grupo;Profesional";
const line = (i: number, over: Partial<Record<"email" | "dni" | "group" | "pro" | "date", string>> = {}) =>
  [
    `Deportista ${i} ${RUN}`,
    over.email ?? `imp-${RUN}-${i}@club.test`,
    over.dni ?? `9${RUN.replace(/\D/g, "").padEnd(3, "0").slice(0, 3)}${String(i).padStart(5, "0")}`,
    over.date ?? "15/03/2007",
    i % 2 ? "F" : "M",
    "",
    over.group ?? GROUP,
    over.pro ?? "pro@demo.test",
  ].join(";");
const csv = (lines: string[]) => [header, ...lines].join("\r\n");

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  importer = new PatientImportService(tenantDb, audit, new CareAssignmentsService(tenantDb, audit), env);
});

afterAll(async () => {
  if (ownerDb) {
    await ownerDb.delete(invitations).where(like(invitations.email, `imp-${RUN}-%`));
    const mine = ownerDb.select({ id: patients.id }).from(patients).where(like(patients.fullName, `% ${RUN}`));
    await ownerDb.delete(careAssignments).where(inArray(careAssignments.patientId, mine));
    await ownerDb.delete(patients).where(like(patients.fullName, `% ${RUN}`));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("lectura del archivo", () => {
  it("separador ; o , con comillas, BOM y CRLF", () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"con ""comillas"""\r\n')).toEqual([["a", "b"], ["x;y", 'con "comillas"']]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("fechas AAAA-MM-DD y DD/MM/AAAA; rechaza las imposibles y las futuras", () => {
    const today = new Date("2026-10-23T12:00:00Z");
    expect(parseImportDate("2007-03-15", today)).toBe("2007-03-15");
    expect(parseImportDate("5/3/2007", today)).toBe("2007-03-05");
    expect(parseImportDate("31/02/2007", today)).toBeNull();
    expect(parseImportDate("01/01/2030", today)).toBeNull();
  });

  it("reconoce encabezados con tildes y alias, e ignora los desconocidos", () => {
    const p = parseImport("Nombre completo;Correo;Género;Club anterior\nAna;ANA@MAIL.com;femenino;River");
    expect(p.fileErrors).toEqual([]);
    expect(p.ignoredHeaders).toEqual(["Club anterior"]);
    expect(p.rows[0]).toMatchObject({ fullName: "Ana", email: "ana@mail.com", sex: "female", errors: [] });
  });

  it("errores por fila: email, fecha, sexo y repetidos dentro del archivo", () => {
    const p = parseImport("nombre;email;dni;fecha_nacimiento;sexo\nA;a@x.com;1.234;;\nB;mal;;30/02/2000;z\nC;a@x.com;1234;;\n;;;;");
    expect(p.rows).toHaveLength(3);
    expect(p.rows[1]!.errors).toHaveLength(3);
    expect(p.rows[2]!.errors.join(" ")).toMatch(/Email repetido.*línea 2.*Documento repetido/);
  });

  it("sin columna nombre o con más de 1000 filas no se puede importar", () => {
    expect(parseImport("email\na@x.com").fileErrors[0]).toMatch(/nombre/);
    const big = ["nombre", ...Array.from({ length: 1001 }, (_, i) => `P${i}`)].join("\n");
    expect(parseImport(big).fileErrors[0]).toMatch(/1000/);
  });

  it("la plantilla se lee sin errores", () => {
    const p = parseImport(IMPORT_TEMPLATE);
    expect(p.fileErrors).toEqual([]);
    expect(p.rows[0]!.errors).toEqual([]);
  });
});

describe("vista previa contra la base", () => {
  it("grupo o profesional inexistente es error de la fila", async () => {
    const preview = await asAdmin(() =>
      importer.preview({ csv: csv([line(1, { group: "Reserva X" }), line(2, { pro: "nadie@demo.test" })]), invite: false }),
    );
    expect(preview.canImport).toBe(false);
    expect(preview.rows[0]!.errors[0]).toMatch(/No existe el grupo "Reserva X"/);
    expect(preview.rows[1]!.errors[0]).toMatch(/No hay un profesional activo/);
  });

  it("invitar con la organización en revisión no se puede", async () => {
    const preview = await asAdmin(() => importer.preview({ csv: csv([line(1)]), invite: true }), "pending_review");
    expect(preview.canImport).toBe(false);
    expect(preview.fileErrors[0]).toMatch(/aprobemos/);
  });
});

describe("import", () => {
  it("con una fila con error no escribe nada (todo o nada)", async () => {
    const lines = [line(900), line(901, { date: "99/99/9999" })];
    await expect(asAdmin(() => importer.import({ csv: csv(lines), invite: true }))).rejects.toBeInstanceOf(UnprocessableEntityException);
    const rows = await ownerDb.select().from(patients).where(like(patients.fullName, `Deportista 90_ ${RUN}`));
    expect(rows).toHaveLength(0);
  });

  it("500 filas: alta, grupo, profesional e invitaciones encoladas en una operación", async () => {
    const lines = Array.from({ length: 500 }, (_, i) => line(i + 1));
    const t0 = Date.now();
    const result = await asAdmin(() => importer.import({ csv: csv(lines), invite: true }));
    expect(result).toEqual({ created: 500, invited: 500, assigned: 500, grouped: 500 });
    expect(Date.now() - t0).toBeLessThan(30_000);

    const created = await ownerDb.select({ id: patients.id }).from(patients).where(like(patients.fullName, `Deportista % ${RUN}`));
    expect(created).toHaveLength(500);
    const ids = created.map((c) => c.id);
    const inGroup = await ownerDb.select().from(patientGroupMembers).where(and(eq(patientGroupMembers.groupId, SEED.groupDemo), inArray(patientGroupMembers.patientId, ids)));
    expect(inGroup).toHaveLength(500);
    const assigned = await ownerDb
      .select()
      .from(careAssignments)
      .where(and(eq(careAssignments.membershipId, PRO_MEMBERSHIP), inArray(careAssignments.patientId, ids), isNull(careAssignments.endedAt)));
    expect(assigned).toHaveLength(500);

    const invs = await ownerDb.select().from(invitations).where(like(invitations.email, `imp-${RUN}-%`));
    expect(invs).toHaveLength(500);
    expect(invs.every((i) => i.status === "pending" && i.queuedAt && i.role === "patient" && i.patientId)).toBe(true);

    const [summary] = await ownerDb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "patients.imported"), sql`${auditLog.metadata}->>'created' = '500'`))
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(1);
    expect(summary).toBeDefined();
  }, 60_000);

  it("volver a importar el mismo archivo marca a todos como ya existentes", async () => {
    const preview = await asAdmin(() => importer.preview({ csv: csv([line(1), line(2)]), invite: false }));
    expect(preview.errorCount).toBe(2);
    expect(preview.rows[0]!.errors[0]).toMatch(/Ya hay un deportista con ese email/);
  });
});
