import { conversations, createDb, dataAccessLog, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import type { MembershipRole } from "@nutreitor/shared";
import { Reflector } from "@nestjs/core";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { eq, inArray, sql } from "drizzle-orm";
import type pg from "pg";
import { firstValueFrom, of } from "rxjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACCESS_LOG_KEY, type AccessLogSpec } from "../src/core/audit/access-log.decorator.js";
import { AccessLogInterceptor } from "../src/core/audit/access-log.interceptor.js";
import { AccessLogService, accessWindow } from "../src/core/audit/access-log.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AdherenceController } from "../src/modules/patients/adherence.controller.js";
import { AnthropometryController } from "../src/modules/patients/anthropometry.controller.js";
import { ConversationsController } from "../src/modules/patients/conversations.controller.js";
import { EnergyController } from "../src/modules/patients/energy.controller.js";
import { FoodFrequencyController } from "../src/modules/patients/food-frequency.controller.js";
import { GroupsController } from "../src/modules/patients/groups.controller.js";
import { GroupHydrationController, HydrationController } from "../src/modules/patients/hydration.controller.js";
import { MealPlansController } from "../src/modules/patients/meal-plans.controller.js";
import { MetricsController } from "../src/modules/patients/metrics.controller.js";
import { PatientsController } from "../src/modules/patients/patients.controller.js";
import { RecallsController } from "../src/modules/patients/recalls.controller.js";
import { ReportsController } from "../src/modules/patients/reports.controller.js";
import { TeamController } from "../src/modules/team/team.controller.js";

/**
 * Registro de lecturas de datos de salud (KAN-23, ADR 0042), contra Postgres real:
 * qué endpoints quedan marcados, quién deja rastro (staff sí, deportista no), la
 * ventana de 15 min, la conversación → deportista, append-only y RLS.
 */
const APP_URL = requireEnv("DATABASE_URL");
const OWNER_URL = requireEnv("DATABASE_OWNER_URL");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} para los tests.`);
  return v;
}

const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const PATIENT_USER = "00000000-0000-0000-0000-0000000000f3";
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";
const D1 = "00000000-0000-0000-0000-0000000000d1";
const D2 = "00000000-0000-0000-0000-0000000000d2";

let appDb: Database;
let appPool: pg.Pool;
let ownerDb: Database;
let ownerPool: pg.Pool;
let log: AccessLogService;
let conversationId: string;
const createdConversations: string[] = [];

function as<T>(userId: string, role: MembershipRole, fn: () => Promise<T>): Promise<T> {
  const org = SEED.orgDemo;
  return tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org: { id: org.id, name: org.name, slug: org.slug, region: org.region, status: org.status, kind: org.kind },
      user: { id: userId, role },
    },
    fn,
  );
}

/** Filas de un deportista, por recurso, vistas por el owner (sin RLS). */
const rowsFor = (patientId: string, resource: string) =>
  ownerDb
    .select()
    .from(dataAccessLog)
    .where(sql`${dataAccessLog.patientId} = ${patientId} AND ${dataAccessLog.resource} = ${resource}`);

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: ownerDb, pool: ownerPool } = createDb(OWNER_URL));
  log = new AccessLogService(new TenantDbService(appDb));
  await ownerDb.delete(dataAccessLog).where(inArray(dataAccessLog.patientId, [D1, D2]));
  const [c] = await ownerDb
    .insert(conversations)
    .values({ tenantId: SEED.orgDemo.id, region: SEED.orgDemo.region, kind: "patient_professional", patientId: D2, professionalMembershipId: PRO_MEMBERSHIP })
    .onConflictDoNothing()
    .returning({ id: conversations.id });
  if (c) {
    conversationId = c.id;
    createdConversations.push(c.id);
  } else {
    const [existing] = await ownerDb
      .select({ id: conversations.id })
      .from(conversations)
      .where(sql`${conversations.patientId} = ${D2} AND ${conversations.professionalMembershipId} = ${PRO_MEMBERSHIP}`);
    conversationId = existing!.id;
  }
});

afterAll(async () => {
  if (ownerDb) {
    await ownerDb.delete(dataAccessLog).where(inArray(dataAccessLog.patientId, [D1, D2]));
    await ownerDb.delete(dataAccessLog).where(eq(dataAccessLog.targetId, conversationId));
    if (createdConversations.length) await ownerDb.delete(conversations).where(inArray(conversations.id, createdConversations));
  }
  await appPool?.end();
  await ownerPool?.end();
});

describe("qué lecturas quedan marcadas", () => {
  const spec = (proto: object, method: string) =>
    Reflect.getMetadata(ACCESS_LOG_KEY, (proto as Record<string, object>)[method]!) as AccessLogSpec | undefined;

  it.each([
    [PatientsController, "getOne", "patient"],
    [PatientsController, "listAssignments", "assignments"],
    [PatientsController, "listNotes", "patient_notes"],
    [MetricsController, "list", "metrics"],
    [AnthropometryController, "list", "anthropometry"],
    [MealPlansController, "list", "plan"],
    [RecallsController, "list", "recalls"],
    [FoodFrequencyController, "list", "food_frequency"],
    [HydrationController, "list", "sweat_tests"],
    [GroupHydrationController, "summary", "sweat_tests"],
    [EnergyController, "list", "energy"],
    [EnergyController, "context", "energy"],
    [AdherenceController, "list", "adherence"],
    [ReportsController, "list", "reports"],
    [ReportsController, "get", "report"],
    [ConversationsController, "thread", "conversation"],
    [GroupsController, "board", "group_board"],
    [GroupsController, "anthropometry", "anthropometry"],
    // Cuerpo técnico (KAN-109): un tercero no clínico leyendo datos de salud del plantel.
    [TeamController, "board", "group_board"],
  ] as const)("%o.%s → %s", (ctrl, method, resource) => {
    expect(spec(ctrl.prototype, method)?.resource).toBe(resource);
  });

  it("la lista de deportistas (nombres) no se registra", () => {
    expect(spec(PatientsController.prototype, "list")).toBeUndefined();
  });
});

describe("registro", () => {
  it("el staff deja rastro; el deportista viendo lo suyo, no", async () => {
    const s: AccessLogSpec = { resource: "metrics", patientParam: "patientId" };
    await as(PRO_USER, "professional", () => log.recordRead(s, { patientId: D1 }));
    await as(PATIENT_USER, "patient", () => log.recordRead(s, { patientId: D1 }));
    const rows = await rowsFor(D1, "metrics");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: PRO_USER, actorRole: "professional", tenantId: SEED.orgDemo.id });
  });

  it("una fila por ventana de 15 minutos", async () => {
    const s: AccessLogSpec = { resource: "plan", patientParam: "patientId" };
    const t0 = new Date("2026-10-23T12:01:00Z");
    for (const at of [t0, new Date("2026-10-23T12:09:00Z"), new Date("2026-10-23T12:14:59Z")]) {
      await as(PRO_USER, "professional", () => log.recordRead(s, { patientId: D1 }, at));
    }
    expect(await rowsFor(D1, "plan")).toHaveLength(1);
    await as(PRO_USER, "professional", () => log.recordRead(s, { patientId: D1 }, new Date("2026-10-23T12:15:00Z")));
    expect(await rowsFor(D1, "plan")).toHaveLength(2);
    expect(accessWindow(t0).toISOString()).toBe("2026-10-23T12:00:00.000Z");
  });

  it("los mensajes se atribuyen al deportista de la conversación", async () => {
    await as(PRO_USER, "professional", () =>
      log.recordRead({ resource: "conversation", targetParam: "id", patientFromConversation: true }, { id: conversationId }),
    );
    const [row] = await rowsFor(D2, "conversation");
    expect(row).toMatchObject({ targetId: conversationId, actorUserId: PRO_USER });
  });

  it("ignora parámetros que no son uuid", async () => {
    await as(ADMIN_USER, "admin", () => log.recordRead({ resource: "patient", patientParam: "id" }, { id: "no-es-uuid" }));
    const rows = await ownerDb
      .select()
      .from(dataAccessLog)
      .where(sql`${dataAccessLog.resource} = 'patient' AND ${dataAccessLog.patientId} IS NULL AND ${dataAccessLog.actorUserId} = ${ADMIN_USER}`);
    expect(rows.length).toBeGreaterThan(0);
    await ownerDb.delete(dataAccessLog).where(sql`${dataAccessLog.resource} = 'patient' AND ${dataAccessLog.patientId} IS NULL`);
  });
});

describe("consulta del admin", () => {
  it("filtra por deportista, más nuevo primero y con el nombre de quien leyó", async () => {
    const entries = await as(ADMIN_USER, "admin", () => log.list({ patientId: D1 }));
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.every((e) => e.patientId === D1)).toBe(true);
    expect(entries[0]!.actorName).toBe("Profesional Demo");
    const times = entries.map((e) => e.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe("interceptor", () => {
  const spec: AccessLogSpec = { resource: "adherence", patientParam: "patientId" };
  const ctx = (params: Record<string, string>) =>
    ({
      getHandler: () => {
        const h = () => undefined;
        Reflect.defineMetadata(ACCESS_LOG_KEY, spec, h);
        return h;
      },
      switchToHttp: () => ({ getRequest: () => ({ params }) }),
    }) as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of({ ok: true }) };

  it("registra después de leer y devuelve la respuesta intacta", async () => {
    const i = new AccessLogInterceptor(new Reflector(), log);
    const body = await as(PRO_USER, "professional", () => firstValueFrom(i.intercept(ctx({ patientId: D1 }), next)));
    expect(body).toEqual({ ok: true });
    expect(await rowsFor(D1, "adherence")).toHaveLength(1);
  });

  it("si no se puede registrar, la lectura falla", async () => {
    const failing = { recordRead: () => Promise.reject(new Error("db caída")) } as unknown as AccessLogService;
    const i = new AccessLogInterceptor(new Reflector(), failing);
    await expect(as(PRO_USER, "professional", () => firstValueFrom(i.intercept(ctx({ patientId: D1 }), next)))).rejects.toThrow("db caída");
  });
});

describe("plano de datos", () => {
  it("append-only: el rol app no puede modificar ni borrar", async () => {
    await expect(
      withTenant(appDb, SEED.orgDemo.id, (tx) => tx.update(dataAccessLog).set({ actorRole: "admin" }).where(eq(dataAccessLog.patientId, D1))),
    ).rejects.toThrow();
    await expect(withTenant(appDb, SEED.orgDemo.id, (tx) => tx.delete(dataAccessLog).where(eq(dataAccessLog.patientId, D1)))).rejects.toThrow();
  });

  it("RLS: otra organización no ve las lecturas de esta", async () => {
    const rows = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(dataAccessLog).where(eq(dataAccessLog.patientId, D1)));
    expect(rows).toHaveLength(0);
  });
});
