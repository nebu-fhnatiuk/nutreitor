import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { anthropometrySessions, createDb, patientGroups, patients, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { saveGroupAnthropometrySchema, type AuthOrg, type MembershipRole } from "@nutreitor/shared";
import { eq, inArray, like } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/core/audit/audit.service.js";
import { TenantDbService } from "../src/core/database/tenant-db.service.js";
import { tenantStorage } from "../src/core/tenant/tenant-context.store.js";
import { AnthropometryService } from "../src/modules/patients/anthropometry.service.js";
import { CareAssignmentsService } from "../src/modules/patients/care-assignments.service.js";
import { GroupsService } from "../src/modules/patients/groups.service.js";
import { PatientNotesService } from "../src/modules/patients/patient-notes.service.js";
import { PatientsService } from "../src/modules/patients/patients.service.js";

/**
 * Grupos de deportistas y carga de antropometría por plantel (ADR 0031), contra
 * Postgres real con el rol app. Cubre: el grupo no abre acceso (el profesional ve
 * sólo a sus asignados), la carga es todo o nada, el resumen toma la última sesión
 * y otro tenant no ve nada.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const T: AuthOrg = { ...SEED.orgDemo };
const PRO_USER = "00000000-0000-0000-0000-0000000000f2";
const ADMIN_USER = "00000000-0000-0000-0000-0000000000f1";
const D1 = "00000000-0000-0000-0000-0000000000d1"; // asignado a pro@demo
const D2 = "00000000-0000-0000-0000-0000000000d2"; // sin asignar
const RUN = Math.random().toString(36).slice(2, 8);

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;
let groups: GroupsService;
let anthro: AnthropometryService;
let patientsSvc: PatientsService;

function as<X>(userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run(
    { context: { tenantId: T.id, orgId: T.id, region: T.region }, org: T, user: { id: userId, role } },
    fn,
  );
}
const asPro = <X>(fn: () => Promise<X>) => as(PRO_USER, "professional", fn);
const asAdmin = <X>(fn: () => Promise<X>) => as(ADMIN_USER, "admin", fn);

const TAKES = {
  bodyMass: [70.0],
  stature: [175.0, 175.1],
  triceps: [8.0, 8.0],
  subscapular: [9.0, 9.0],
  supraspinale: [7.0, 7.0],
  abdominal: [12.0, 12.0],
  frontThigh: [10.0, 10.0],
  medialCalf: [6.0, 6.0],
};

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
  await owner.delete(anthropometrySessions).where(inArray(anthropometrySessions.patientId, [D1, D2]));
  const tenantDb = new TenantDbService(appDb);
  const audit = new AuditService();
  groups = new GroupsService(tenantDb, audit);
  anthro = new AnthropometryService(tenantDb, audit);
  patientsSvc = new PatientsService(tenantDb, audit, new CareAssignmentsService(tenantDb, audit), new PatientNotesService(tenantDb, audit));
});

afterAll(async () => {
  await owner?.delete(anthropometrySessions).where(inArray(anthropometrySessions.patientId, [D1, D2]));
  await owner?.delete(patientGroups).where(like(patientGroups.name, `%${RUN}%`));
  await appPool?.end();
  await ownerPool?.end();
});

describe("grupos", () => {
  it("el admin arma el grupo; no se repiten nombres (sin distinguir mayúsculas)", async () => {
    const g = await asAdmin(() => groups.create({ name: `Sub-20 ${RUN}`, description: "Juveniles" }));
    expect(g).toMatchObject({ name: `Sub-20 ${RUN}`, memberCount: 0, members: [] });
    await expect(asAdmin(() => groups.create({ name: `sub-20 ${RUN}` }))).rejects.toBeInstanceOf(ConflictException);

    const withMembers = await asAdmin(() => groups.addMembers(g.id, { patientIds: [D1, D2, D1] }));
    expect(withMembers.members.map((m) => m.patientId).sort()).toEqual([D1, D2]);
    // Sumar de nuevo no duplica.
    expect((await asAdmin(() => groups.addMembers(g.id, { patientIds: [D2] }))).memberCount).toBe(2);
    // Un paciente de otro tenant no existe para este.
    await expect(
      asAdmin(() => groups.addMembers(g.id, { patientIds: ["00000000-0000-0000-0000-0000000000a1"] })),
    ).rejects.toBeInstanceOf(BadRequestException);

    await asAdmin(() => groups.removeMember(g.id, D2));
    await asAdmin(() => groups.remove(g.id));
    // Borrar el grupo no toca a los pacientes.
    const [p] = await owner.select({ id: patients.id }).from(patients).where(eq(patients.id, D1));
    expect(p).toBeDefined();
  });

  it("el grupo no abre acceso: el profesional ve sólo a sus asignados", async () => {
    const asAdminList = await asAdmin(() => groups.list());
    const asProList = await asPro(() => groups.list());
    expect(asAdminList.find((g) => g.id === SEED.groupDemo)?.memberCount).toBe(2);
    expect(asProList.find((g) => g.id === SEED.groupDemo)?.memberCount).toBe(1);
    const detail = await asPro(() => groups.get(SEED.groupDemo));
    expect(detail.members.map((m) => m.patientId)).toEqual([D1]);
  });

  it("el listado de pacientes filtra por grupo y muestra los grupos de cada uno", async () => {
    const list = await asAdmin(() => patientsSvc.list(undefined, SEED.groupDemo));
    expect(list.map((p) => p.id).sort()).toEqual([D1, D2]);
    expect(list[0]!.groups).toContainEqual({ id: SEED.groupDemo, name: "Primera división" });
    const ficha = await asPro(() => patientsSvc.getOne(D1));
    expect(ficha.groups.map((g) => g.name)).toContain("Primera división");
  });

  it("RLS: otro tenant no ve los grupos", async () => {
    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(patientGroups));
    expect(leaked.find((g) => g.id === SEED.groupDemo)).toBeUndefined();
  });
});

describe("antropometría del plantel", () => {
  it("valida cada entrada como la carga individual y rechaza deportistas repetidos", () => {
    const base = { measuredAt: "2026-10-19" };
    expect(saveGroupAnthropometrySchema.safeParse({ ...base, entries: [{ patientId: D1, takes: { triceps: [10, 11] } }] }).success).toBe(false);
    expect(
      saveGroupAnthropometrySchema.safeParse({
        ...base,
        entries: [
          { patientId: D1, takes: TAKES },
          { patientId: D1, takes: TAKES },
        ],
      }).success,
    ).toBe(false);
  });

  it("todo o nada: si un deportista no es visible, no se guarda ninguno", async () => {
    await expect(
      asPro(() =>
        anthro.createForGroup(SEED.groupDemo, {
          measuredAt: "2026-10-05",
          entries: [
            { patientId: D1, takes: TAKES },
            { patientId: D2, takes: TAKES },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await asAdmin(() => anthro.list(D1))).toHaveLength(0);
    await expect(
      asPro(() => anthro.createForGroup("00000000-0000-0000-0000-00000000dead", { measuredAt: "2026-10-05", entries: [{ patientId: D1, takes: TAKES }] })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("carga el plantel y el resumen muestra la última sesión con la variación de Σ6", async () => {
    expect(
      await asAdmin(() =>
        anthro.createForGroup(SEED.groupDemo, {
          measuredAt: "2026-09-01",
          entries: [
            { patientId: D1, takes: TAKES },
            { patientId: D2, takes: TAKES },
          ],
        }),
      ),
    ).toEqual({ created: 2 });
    // Segunda pasada sólo para D1, tríceps 2 mm menos.
    await asPro(() =>
      anthro.createForGroup(SEED.groupDemo, {
        measuredAt: "2026-10-01",
        entries: [{ patientId: D1, takes: { ...TAKES, triceps: [6.0, 6.0] } }],
      }),
    );

    const pro = await asPro(() => anthro.groupSummary(SEED.groupDemo));
    expect(pro.rows.map((r) => r.patientId)).toEqual([D1]);
    // Σ6 = 6 + 9 + 7 + 12 + 10 + 6 = 50,0 (antes 52,0).
    expect(pro.rows[0]).toMatchObject({
      last: { measuredAt: "2026-10-01", bodyMass: 70, results: { sum6: { ok: true, value: 50 } } },
      sum6Delta: -2,
    });

    const admin = await asAdmin(() => anthro.groupSummary(SEED.groupDemo));
    expect(admin.rows.find((r) => r.patientId === D2)).toMatchObject({ last: { measuredAt: "2026-09-01" }, sum6Delta: null });
    expect(admin.validated).toBe(true);
  });
});
