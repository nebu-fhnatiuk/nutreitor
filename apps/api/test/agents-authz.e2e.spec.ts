import { agentConsents, createDb, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { MembershipRole } from "@nutreitor/shared";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ApiEnv } from "../src/core/config/app-config.module.js";
import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AgentsService } from "../src/modules/agents/agents.service.js";
import { FoodsService } from "../src/modules/foods/foods.service.js";

/**
 * Autorización del gateway de agentes: el contexto clínico de un agente sólo se arma
 * para un paciente ACCESIBLE (asignado, mismo tenant) y con consentimiento del lado
 * paciente. Estos caminos de DENY cortan ANTES de salir al servicio Python (no hay
 * inferencia acá): si el gateway no autoriza, nunca se arma ni egresa contexto.
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3";
const D1_ASSIGNED = "00000000-0000-0000-0000-0000000000d1";
const D2_UNASSIGNED = "00000000-0000-0000-0000-0000000000d2";
const A1_OTHER_TENANT = "00000000-0000-0000-0000-0000000000a1";

// El env real no importa para los caminos de DENY (cortan antes de firmar/egresar).
const ENV_STUB = {
  AGENTS_SERVICE_URL: "http://agents:8000",
  AGENTS_SHARED_SECRET: "x".repeat(16),
  AGENTS_CONTEXT_TTL_MS: 60_000,
  AGENTS_RATELIMIT_PER_MIN: 0,
  AGENTS_MONTHLY_TOKEN_CAP: 0,
} as unknown as ApiEnv;

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let svc: AgentsService;

function as<T>(userId: string, role: MembershipRole, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(
    {
      context: { tenantId: SEED.orgDemo.id, orgId: SEED.orgDemo.id, region: SEED.orgDemo.region },
      org: { id: SEED.orgDemo.id, name: SEED.orgDemo.name, slug: SEED.orgDemo.slug, region: SEED.orgDemo.region, status: SEED.orgDemo.status, kind: SEED.orgDemo.kind },
      user: { id: userId, role },
    },
    fn,
  );
}
const asPro = <T>(fn: () => Promise<T>) => as(PRO_USER, "professional", fn);
const asPatient = <T>(fn: () => Promise<T>) => as(PATIENT_USER, "patient", fn);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  const tenantDb = new TenantDbService(appDb);
  svc = new AgentsService(ENV_STUB, tenantDb, new FoodsService(tenantDb, new AuditService()));
  // Idempotencia: arrancar SIN consentimiento del paciente (el rol app no borra).
  await ownerDb.delete(agentConsents).where(eq(agentConsents.patientId, D1_ASSIGNED));
});

afterAll(async () => {
  await appPool?.end();
  await ownerPool?.end();
});

describe("Agentes — autorización del gateway", () => {
  it("NUTRI: el profesional NO arma contexto sobre un paciente NO asignado → 404", async () => {
    await expect(
      asPro(() => svc.chat({ agent: "nutri", patientId: D2_UNASSIGNED, message: "hola" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("cross-tenant: el profesional NO arma contexto sobre un paciente de otro tenant → 404", async () => {
    await expect(
      asPro(() => svc.chat({ agent: "nutri", patientId: A1_OTHER_TENANT, message: "hola" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("borrador de plan: NO sale contexto de un paciente NO asignado ni de otro tenant → 404", async () => {
    for (const patientId of [D2_UNASSIGNED, A1_OTHER_TENANT]) {
      await expect(asPro(() => svc.planDraft({ patientId }))).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it("el paciente NO puede usar los asistentes del portal sin consentimiento → Forbidden", async () => {
    await expect(
      asPatient(() => svc.chatAsPatient({ agent: "chef", message: "hola" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("con consentimiento, el chat del paciente PASA el gate (falla recién al egresar al servicio)", async () => {
    // Otorgamos consentimiento y verificamos que YA NO corta por consentimiento: el
    // error pasa a ser de egreso al servicio Python (no hay servicio en el test).
    await asPatient(() => svc.acceptConsent());
    await expect(
      asPatient(() => svc.chatAsPatient({ agent: "chef", message: "hola" })),
    ).rejects.not.toBeInstanceOf(ForbiddenException);
  });
});
