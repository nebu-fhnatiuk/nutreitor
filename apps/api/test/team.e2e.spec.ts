import { createDb, groupCoaches, withTenant, type Database } from "@nutreitor/db";
import { runMigrations } from "@nutreitor/db/migrate";
import { runSeed, SEED } from "@nutreitor/db/seed";
import { and, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Cuerpo técnico (KAN-109, ADR 0054) contra Postgres real con el rol app: los
 * planteles del coach, el tablero recortado y el consentimiento para compartir la
 * composición corporal.
 */
const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.DATABASE_OWNER_URL!;
const PRO_MEMBERSHIP = "00000000-0000-0000-0000-0000000000c2";

let appDb: Database;
let appPool: pg.Pool;
let owner: Database;
let ownerPool: pg.Pool;

beforeAll(async () => {
  await runMigrations(OWNER_URL);
  await runSeed(OWNER_URL);
  ({ db: appDb, pool: appPool } = createDb(APP_URL));
  ({ db: owner, pool: ownerPool } = createDb(OWNER_URL));
});

afterAll(async () => {
  await owner.delete(groupCoaches).where(and(eq(groupCoaches.groupId, SEED.groupDemo), eq(groupCoaches.membershipId, PRO_MEMBERSHIP)));
  await appPool?.end();
  await ownerPool?.end();
});

describe("group_coaches RLS", () => {
  it("otro tenant no ve ni puede escribir los planteles del coach", async () => {
    const T = SEED.orgDemo;
    await withTenant(appDb, T.id, (tx) =>
      tx.insert(groupCoaches).values({ tenantId: T.id, region: T.region, groupId: SEED.groupDemo, membershipId: PRO_MEMBERSHIP }).onConflictDoNothing(),
    );
    const mine = await withTenant(appDb, T.id, (tx) => tx.select().from(groupCoaches).where(eq(groupCoaches.groupId, SEED.groupDemo)));
    expect(mine).toHaveLength(1);

    const leaked = await withTenant(appDb, SEED.orgA.id, (tx) => tx.select().from(groupCoaches));
    expect(leaked.find((r) => r.groupId === SEED.groupDemo)).toBeUndefined();

    await expect(
      withTenant(appDb, SEED.orgA.id, (tx) =>
        tx.insert(groupCoaches).values({ tenantId: T.id, region: T.region, groupId: SEED.groupDemo, membershipId: PRO_MEMBERSHIP }),
      ),
    ).rejects.toThrow();
  });
});
