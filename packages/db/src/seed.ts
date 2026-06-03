import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { createDb } from "./client.js";
import {
  organizations,
  patients,
  users,
  memberships,
  professionalProfiles,
} from "./schema/index.js";

/**
 * Datos semilla deterministas (IDs fijos) para la demo y los tests de RLS.
 * - orgA/orgB: dos tenants para ejercitar el aislamiento (usados por el test RLS).
 * - orgDemo: tenant para probar login + capa pública en demo.localhost:3000.
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

/** Usuarios demo (uno por rol) con membership (id fijo) a la org Demo. */
const DEMO_USERS = [
  { id: "00000000-0000-0000-0000-0000000000f1", membershipId: "00000000-0000-0000-0000-0000000000c1", email: "admin@demo.test", fullName: "Admin Demo", role: "admin" as const },
  { id: "00000000-0000-0000-0000-0000000000f2", membershipId: "00000000-0000-0000-0000-0000000000c2", email: "pro@demo.test", fullName: "Profesional Demo", role: "professional" as const },
  { id: "00000000-0000-0000-0000-0000000000f3", membershipId: "00000000-0000-0000-0000-0000000000c3", email: "patient@demo.test", fullName: "Paciente Demo", role: "patient" as const },
];

/**
 * Perfiles públicos demo:
 *  - pro: con contenido público → aparece en el roster (y dispara modo perfil-único).
 *  - admin: listado pero SIN contenido público → excluido por la regla de roster.
 */
const DEMO_PROFILES = [
  {
    id: "00000000-0000-0000-0000-0000000000e2",
    userId: "00000000-0000-0000-0000-0000000000f2", // pro@demo
    profileSlug: "profesional-demo",
    headline: "Nutrición deportiva y clínica",
    bio: "Acompaño a deportistas y pacientes a mejorar su composición corporal y su relación con la comida, con planes personalizados y seguimiento cercano.",
    specialty: "Nutrición deportiva",
    specialties: ["Nutrición deportiva", "Nutrición clínica"],
    visibility: { headline: true, bio: true, specialties: true } as Record<string, boolean>,
  },
  {
    id: "00000000-0000-0000-0000-0000000000e1",
    userId: "00000000-0000-0000-0000-0000000000f1", // admin@demo (sin contenido público)
    profileSlug: "admin-demo",
    headline: null,
    bio: null,
    specialty: null,
    specialties: [] as string[],
    visibility: {} as Record<string, boolean>,
  },
];

/**
 * Inserta el dataset semilla. Usa la conexión OWNER (bypassa RLS): alta de orgs,
 * usuarios, memberships y perfiles son operaciones de administración. Idempotente.
 */
export async function runSeed(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await db
      .insert(organizations)
      .values([SEED.orgA, SEED.orgB, SEED.orgDemo])
      .onConflictDoNothing();

    // Texto público de la org demo (idempotente, se aplica aunque la org ya exista).
    await db
      .update(organizations)
      .set({
        publicHeadline: "Nutrición que se adapta a vos",
        publicDescription:
          "En Demo combinamos evidencia y trato humano para acompañarte en tu objetivo, sea rendimiento deportivo o salud.",
      })
      .where(eq(organizations.id, SEED.orgDemo.id));

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
          id: u.membershipId,
          userId: u.id,
          organizationId: SEED.orgDemo.id,
          role: u.role,
          region: SEED.orgDemo.region,
        })),
      )
      .onConflictDoNothing();

    // Resolver el membershipId REAL por userId (los memberships pueden preexistir
    // con ids random de un seed anterior; no dependemos de ids fijos).
    const demoMemberships = await db
      .select({ id: memberships.id, userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.organizationId, SEED.orgDemo.id));
    const membershipByUser = new Map(
      demoMemberships.map((m) => [m.userId, m.id]),
    );

    const profileValues = DEMO_PROFILES.flatMap((p) => {
      const membershipId = membershipByUser.get(p.userId);
      return membershipId
        ? [
            {
              id: p.id,
              organizationId: SEED.orgDemo.id,
              region: SEED.orgDemo.region,
              membershipId,
              profileSlug: p.profileSlug,
              isPubliclyListed: true,
              headline: p.headline,
              bio: p.bio,
              specialty: p.specialty,
              specialties: p.specialties,
              visibility: p.visibility,
            },
          ]
        : [];
    });
    if (profileValues.length > 0) {
      await db
        .insert(professionalProfiles)
        .values(profileValues)
        .onConflictDoNothing();
    }
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
