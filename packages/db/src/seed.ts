import bcrypt from "bcryptjs";

import { createDb } from "./client.js";
import {
  organizations,
  patients,
  users,
  memberships,
} from "./schema/index.js";

/**
 * Datos semilla deterministas (IDs fijos) para la demo y los tests de RLS.
 * - orgA/orgB: dos tenants para ejercitar el aislamiento (usados por el test RLS).
 * - orgDemo: tenant para probar el login end-to-end en demo.localhost:3000.
 */
export const SEED = {
  orgA: {
    id: "00000000-0000-0000-0000-00000000000a",
    name: "NutriClinic Norte",
    slug: "nutriclinic-norte",
    region: "eu-central-1",
  },
  orgB: {
    id: "00000000-0000-0000-0000-00000000000b",
    name: "Gimnasio Sur",
    slug: "gimnasio-sur",
    region: "us-east-1",
  },
  orgDemo: {
    id: "00000000-0000-0000-0000-0000000000de",
    name: "Demo",
    slug: "demo",
    region: "us-east-1",
  },
} as const;

const PATIENTS = [
  { id: "00000000-0000-0000-0000-0000000000a1", tenantId: SEED.orgA.id, region: SEED.orgA.region, fullName: "Ana Gómez" },
  { id: "00000000-0000-0000-0000-0000000000a2", tenantId: SEED.orgA.id, region: SEED.orgA.region, fullName: "Bruno Díaz" },
  { id: "00000000-0000-0000-0000-0000000000b1", tenantId: SEED.orgB.id, region: SEED.orgB.region, fullName: "Carla Ruiz" },
  { id: "00000000-0000-0000-0000-0000000000b2", tenantId: SEED.orgB.id, region: SEED.orgB.region, fullName: "Diego Fernández" },
  { id: "00000000-0000-0000-0000-0000000000d1", tenantId: SEED.orgDemo.id, region: SEED.orgDemo.region, fullName: "Paciente Demo Uno" },
  { id: "00000000-0000-0000-0000-0000000000d2", tenantId: SEED.orgDemo.id, region: SEED.orgDemo.region, fullName: "Paciente Demo Dos" },
];

/** Password de los usuarios de prueba (sólo dev). */
export const DEMO_PASSWORD = "demo1234";

/** Usuarios demo (uno por rol) con membership a la org Demo. */
const DEMO_USERS = [
  { id: "00000000-0000-0000-0000-0000000000f1", email: "admin@demo.test", fullName: "Admin Demo", role: "admin" as const },
  { id: "00000000-0000-0000-0000-0000000000f2", email: "pro@demo.test", fullName: "Profesional Demo", role: "professional" as const },
  { id: "00000000-0000-0000-0000-0000000000f3", email: "patient@demo.test", fullName: "Paciente Demo", role: "patient" as const },
];

/**
 * Inserta el dataset semilla. Usa la conexión OWNER (bypassa RLS): el alta de
 * organizaciones, usuarios y memberships son operaciones de administración.
 * Idempotente vía onConflictDoNothing sobre los IDs/uniques fijos.
 */
export async function runSeed(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await db
      .insert(organizations)
      .values([SEED.orgA, SEED.orgB, SEED.orgDemo])
      .onConflictDoNothing();
    await db.insert(patients).values(PATIENTS).onConflictDoNothing();

    const hashedPassword = bcrypt.hashSync(DEMO_PASSWORD, 10);
    await db
      .insert(users)
      .values(
        DEMO_USERS.map((u) => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          hashedPassword,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(memberships)
      .values(
        DEMO_USERS.map((u) => ({
          userId: u.id,
          organizationId: SEED.orgDemo.id,
          role: u.role,
          region: SEED.orgDemo.region,
        })),
      )
      .onConflictDoNothing();
  } finally {
    await pool.end();
  }
}

// Ejecución directa: `pnpm db:seed`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env.DATABASE_OWNER_URL;
  if (!connectionString) {
    throw new Error("DATABASE_OWNER_URL no está seteada. El seed requiere el rol owner.");
  }
  runSeed(connectionString)
    .then(() => {
      console.log("Seed aplicado.");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
