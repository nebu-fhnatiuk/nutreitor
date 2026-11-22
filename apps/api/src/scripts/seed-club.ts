/**
 * Club de ejemplo completo: "Club Atlético Norte Alto" (norte-alto.<dominio>).
 *
 * Arma un club polideportivo con datos de una temporada entera, pensado para
 * mostrar Nutreitor a otros clubes: coordinación y tres nutricionistas, planteles de
 * fútbol, hockey femenino y básquet, y para cada deportista ficha, antropometría
 * ISAK, requerimiento por tipo de día, planes con alimentos del catálogo, pruebas de
 * sudoración, adherencia en el portal, notas, informes mensuales, mensajes y turnos.
 *
 * Todo pasa por los servicios de la API (mismas validaciones Zod, cálculos, RLS y
 * auditoría que la app). Solo la organización, los usuarios y las fechas de
 * creación hacia atrás se escriben con el rol owner.
 *
 * Uso (desde apps/api, con el build hecho):
 *   DATABASE_OWNER_URL=… DATABASE_URL=… JWT_ACCESS_SECRET=… JWT_REFRESH_SECRET=… \
 *   EDGE_SHARED_SECRET=… SEED_CLUB_PASSWORD=… node dist/scripts/seed-club.js
 *
 * Si el club ya existe no hace nada: la auditoría es append-only y no se borra. Para
 * rearmarlo, recrear la base (db:reset-dev) y volver a correrlo. Se niega a correr
 * con NODE_ENV=production.
 */
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import {
  adherenceCheckins,
  adherenceMealLogs,
  createDb,
  locations,
  memberships,
  messages,
  mealPlans,
  energyRequirements,
  organizations,
  patientNotes,
  patientReports,
  patients,
  professionalProfiles,
  users,
} from "@nutreitor/db";
import {
  addGroupMembersSchema,
  bookAppointmentSchema,
  checkinSchema,
  createPatientSchema,
  foodRefFor,
  isLoggableDate,
  logMealSchema,
  macrosForGrams,
  recordMetricSchema,
  saveAnthropometrySchema,
  saveEnergySchema,
  saveGroupSchema,
  saveGroupSweatTestSchema,
  savePlanSchema,
  savePlanTemplateSchema,
  setAvailabilitySchema,
  weekdays,
  type AnthroSiteKey,
  type DayPlan,
  type FoodDto,
  type MealItem,
  type MembershipRole,
  type PlanMeal,
  type Weekday,
} from "@nutreitor/shared";
import bcrypt from "bcryptjs";
import { and, eq, inArray, sql } from "drizzle-orm";

import { AppModule } from "../app.module.js";
import { tenantStorage } from "../core/tenant/tenant-context.store.js";
import { FoodsService } from "../modules/foods/foods.service.js";
import { OrgModulesService } from "../modules/organizations/org-modules.service.js";
import { AdherenceService } from "../modules/patients/adherence.service.js";
import { AnthropometryService } from "../modules/patients/anthropometry.service.js";
import { ConversationsService } from "../modules/patients/conversations.service.js";
import { EnergyService } from "../modules/patients/energy.service.js";
import { GroupActionsService } from "../modules/patients/group-actions.service.js";
import { GroupsService } from "../modules/patients/groups.service.js";
import { HydrationService } from "../modules/patients/hydration.service.js";
import { MealPlansService } from "../modules/patients/meal-plans.service.js";
import { MetricsService } from "../modules/patients/metrics.service.js";
import { PatientNotesService } from "../modules/patients/patient-notes.service.js";
import { PatientsService } from "../modules/patients/patients.service.js";
import { PlanTemplatesService } from "../modules/patients/plan-templates.service.js";
import { ReportsService } from "../modules/patients/reports.service.js";
import { SchedulingService } from "../modules/scheduling/scheduling.service.js";
import {
  CLINICAL_CASES,
  CLUB,
  FIRST_NAMES,
  LAST_NAMES,
  SQUADS,
  STAFF,
  type MenuKey,
  type SquadSeed,
  type StaffSeed,
  type Trajectory,
} from "./club-data.js";

// ── Utilidades ────────────────────────────────────────────────────────────────

/** PRNG con semilla fija: el mismo club en cada corrida. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261121);
const between = (a: number, b: number) => a + rand() * (b - a);
const chance = (p: number) => rand() < p;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const r1 = (n: number) => Math.round(n * 10) / 10;

const TODAY = new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (iso: string): Weekday => weekdays[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7]!;
/** Timestamp de un día pasado a una hora local de Buenos Aires (UTC−3). */
const at = (iso: string, hour: number, minute = 0) => new Date(Date.parse(`${iso}T00:00:00Z`) + ((hour + 3) * 60 + minute) * 60_000);

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name}.`);
  return v;
}

// ── Contexto de tenant (lo que en la app arma el guard de auth) ──────────────

interface Org {
  id: string;
  name: string;
  slug: string;
  region: "us-east-1";
  status: "active";
  kind: "team";
}
function as<X>(org: Org, userId: string, role: MembershipRole, fn: () => Promise<X>): Promise<X> {
  return tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org,
      user: { id: userId, role },
    },
    fn,
  );
}

// ── Menús base (se escalan a las kcal de cada tipo de día y de cada deportista) ──

type MenuItem = [slug: string, grams: number];
interface MenuMeal {
  name: string;
  time: string;
  items: MenuItem[];
}

const MENUS: Record<MenuKey, MenuMeal[]> = {
  partido: [
    { name: "Desayuno", time: "08:00", items: [["leche-descremada", 250], ["copos-de-maiz", 28], ["banana", 118], ["miel", 21], ["jugo-de-naranja", 200], ["almendras", 20]] },
    { name: "Almuerzo previo", time: "12:00", items: [["arroz-blanco-cocido", 300], ["pechuga-pollo-cocida", 120], ["pure-de-tomate", 60], ["aceite-de-oliva", 13.5], ["pan-blanco", 40]] },
    { name: "Precompetencia", time: "15:30", items: [["galletas-de-arroz", 27], ["mermelada", 20], ["banana", 118], ["pasas-de-uva", 20]] },
    { name: "Recuperación", time: "19:00", items: [["leche-descremada", 300], ["cacao-amargo", 10], ["miel", 21], ["uvas", 151]] },
    { name: "Cena", time: "21:30", items: [["fideos-cocidos", 200], ["papa-hervida", 150], ["lomo-vacuno-cocido", 130], ["zapallo-cocido", 205], ["aceite-de-oliva", 13.5], ["palta", 80]] },
  ],
  entreno: [
    { name: "Desayuno", time: "07:30", items: [["yogur-descremado-natural", 190], ["avena-arrollada", 40], ["frutillas", 152], ["miel", 14], ["semillas-de-chia", 12]] },
    { name: "Almuerzo", time: "13:00", items: [["arroz-blanco-cocido", 250], ["pechuga-pollo-cocida", 130], ["brocoli-cocido", 156], ["aceite-de-oliva", 13.5]] },
    { name: "Merienda", time: "17:00", items: [["pan-blanco", 50], ["mermelada", 20], ["palta", 60], ["jugo-de-naranja", 200]] },
    { name: "Cena", time: "21:00", items: [["batata-hervida", 250], ["merluza-cocida", 150], ["ensalada-mixta", 0], ["aceite-de-oliva", 13.5]] },
    { name: "Colación", time: "23:00", items: [["banana", 118], ["nueces", 20]] },
  ],
  suave: [
    { name: "Desayuno", time: "09:00", items: [["leche-descremada", 250], ["pan-integral", 56], ["palta", 50], ["kiwi", 138]] },
    { name: "Almuerzo", time: "13:30", items: [["papa-hervida", 200], ["pechuga-pollo-cocida", 130], ["espinaca-cocida", 180], ["aceite-de-oliva", 13.5]] },
    { name: "Merienda", time: "17:30", items: [["yogur-descremado-natural", 190], ["manzana", 182], ["almendras", 24]] },
    { name: "Cena", time: "21:00", items: [["arroz-integral-cocido", 150], ["huevo-entero", 100], ["zapallito-cocido", 180], ["tomate-crudo", 123], ["aceite-de-oliva", 13.5]] },
  ],
};
/** "ensalada-mixta" no está en el catálogo: se reemplaza por sus componentes. */
const EXPAND: Record<string, MenuItem[]> = {
  "ensalada-mixta": [["lechuga", 50], ["tomate-crudo", 123], ["zanahoria-cruda", 61]],
};

/** Reemplazos por restricción (validados contra los alérgenos del catálogo). */
const SWAPS: Record<string, Record<string, string>> = {
  celiaquia: {
    "avena-arrollada": "quinoa-cocida",
    "fideos-cocidos": "arroz-blanco-cocido",
    "pan-blanco": "galletas-de-arroz",
    "pan-integral": "galletas-de-arroz",
    "copos-de-maiz": "galletas-de-arroz",
  },
  intolerancia_lactosa: {
    "leche-descremada": "bebida-de-almendras",
    "yogur-descremado-natural": "bebida-de-almendras",
    "yogur-griego-natural": "banana",
    "queso-untable-descremado": "palta",
  },
  mani: { "mani-tostado": "almendras", "pasta-de-mani": "almendras" },
  frutos_secos: { nueces: "semillas-de-girasol", almendras: "semillas-de-girasol", "bebida-de-almendras": "leche-descremada" },
};

const ALL_SLUGS = [
  ...new Set(
    [...Object.values(MENUS).flatMap((m) => m.flatMap((meal) => meal.items.map(([s]) => s))), ...Object.values(EXPAND).flatMap((x) => x.map(([s]) => s)), ...Object.values(SWAPS).flatMap((m) => Object.values(m))].filter((s) => !EXPAND[s]),
  ),
];

function itemFor(food: FoodDto, grams: number): MealItem {
  // Medida casera solo si da una porción entera o más (si no, en gramos: "0,5 palma" no se lee bien).
  const portion = food.portions.find((p) => p.grams > 0 && grams / p.grams >= 0.95 && grams / p.grams <= 4);
  if (portion) {
    const count = Math.max(1, Math.round((grams / portion.grams) * 2) / 2);
    const ref = { ...foodRefFor(food, count * portion.grams), portion, count };
    return { text: food.name, food: ref, qty: count, unit: portion.label.replace(/^1\s+/, ""), macros: macrosForGrams(ref.per100g, ref.grams) };
  }
  const g = Math.max(5, Math.round(grams / 5) * 5);
  const ref = foodRefFor(food, g);
  return { text: food.name, food: ref, qty: g, unit: "g", macros: macrosForGrams(ref.per100g, g) };
}

interface DayTarget {
  choG: number;
  proG: number;
  fatG: number;
}

/** Verduras: van en la cantidad del menú, no se escalan. */
const FIXED = new Set(["lechuga", "tomate-crudo", "zanahoria-cruda", "brocoli-cocido", "espinaca-cocida", "zapallito-cocido", "zapallo-cocido", "pure-de-tomate"]);

/** Fuente principal de un alimento por su aporte de energía: hidratos, proteína o grasa. */
function sourceOf(f: FoodDto): 0 | 1 | 2 {
  const { proteinG: p, carbsG: c, fatG: g } = f.per100g;
  const kcal = 4 * p + 4 * c + 9 * g || 1;
  if ((9 * g) / kcal >= 0.6) return 2;
  if ((4 * p) / kcal >= 0.5) return 1;
  return 0;
}

/**
 * Menú del tipo de día, con reemplazos por restricción, ajustado a los gramos de
 * hidratos, proteína y grasa del requerimiento: un factor por fuente (lo que haría
 * la nutricionista al mover porciones), resuelto como un sistema de 3×3.
 */
function buildDay(menu: MenuKey, target: DayTarget, restrictions: string[], foods: Map<string, FoodDto>): DayPlan {
  const swap = (slug: string) => restrictions.reduce((s, r) => SWAPS[r]?.[s] ?? s, slug);
  const meals = MENUS[menu].map((m) => ({
    ...m,
    items: m.items.flatMap(([slug, g]) => EXPAND[slug] ?? [[slug, g] as MenuItem]).map(([slug, g]) => [swap(slug), g] as MenuItem),
  }));
  const macro = (f: FoodDto, g: number) => [(f.per100g.carbsG * g) / 100, (f.per100g.proteinG * g) / 100, (f.per100g.fatG * g) / 100];

  // A[macro][fuente] con las cantidades del menú; lo fijo se descuenta del objetivo.
  const A = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const t = [target.choG, target.proG, target.fatG];
  for (const m of meals)
    for (const [slug, g] of m.items) {
      const f = foods.get(slug)!;
      const v = macro(f, g);
      if (FIXED.has(slug)) v.forEach((x, i) => (t[i]! -= x));
      else v.forEach((x, i) => (A[i]![sourceOf(f)]! += x));
    }
  const det = (M: number[][]) =>
    M[0]![0]! * (M[1]![1]! * M[2]![2]! - M[1]![2]! * M[2]![1]!) -
    M[0]![1]! * (M[1]![0]! * M[2]![2]! - M[1]![2]! * M[2]![0]!) +
    M[0]![2]! * (M[1]![0]! * M[2]![1]! - M[1]![1]! * M[2]![0]!);
  const D = det(A);
  const factors = [0, 1, 2].map((j) => {
    const Mj = A.map((row, i) => row.map((x, k) => (k === j ? t[i]! : x)));
    const f = D ? det(Mj) / D : 1;
    return Math.min(4, Math.max(0.25, Number.isFinite(f) ? f : 1));
  });

  return {
    meals: meals.map(
      (m): PlanMeal => ({
        name: m.name,
        time: m.time,
        items: m.items.map(([slug, g]) => {
          const f = foods.get(slug)!;
          return itemFor(f, FIXED.has(slug) ? g : g * factors[sourceOf(f)]!);
        }),
      }),
    ),
  };
}

// ── Antropometría ISAK ─────────────────────────────────────────────────────────

const SKINFOLDS: Record<"male" | "female", Partial<Record<AnthroSiteKey, number>>> = {
  male: { triceps: 7.5, subscapular: 8.5, biceps: 4, iliacCrest: 11, supraspinale: 6.5, abdominal: 11, frontThigh: 9.5, medialCalf: 5.5 },
  female: { triceps: 13, subscapular: 10, biceps: 6, iliacCrest: 13, supraspinale: 9, abdominal: 15, frontThigh: 19, medialCalf: 11.5 },
};

interface Athlete {
  id?: string;
  userId: string;
  membershipId?: string;
  fullName: string;
  email: string;
  squad: SquadSeed;
  index: number;
  position: string;
  sex: "male" | "female";
  birthDate: string;
  heightCm: number;
  massKg: number;
  /** Multiplicador de pliegues propio del deportista. */
  adiposity: number;
  /** Proporción de masa muscular frente a la media. */
  build: number;
  trajectory: Trajectory;
  restrictions: string[];
}

/** Factores de pliegues y masa por sesión de la temporada, según la trayectoria. */
const SESSIONS = ["2026-03-09", "2026-05-18", "2026-08-24", "2026-11-09"] as const;
function seasonFactors(t: Trajectory): { skin: number; mass: number }[] {
  const improving = [
    { skin: 1.18, mass: 1.025 },
    { skin: 1.07, mass: 1.012 },
    { skin: 0.99, mass: 1.0 },
    { skin: 0.94, mass: 0.995 },
  ];
  switch (t) {
    case "rising_fat":
      return [improving[0]!, improving[1]!, { skin: 0.97, mass: 0.998 }, { skin: 1.09, mass: 1.018 }];
    case "steady":
      return [{ skin: 1.06, mass: 1.01 }, { skin: 1.02, mass: 1.004 }, { skin: 0.99, mass: 1.0 }, { skin: 0.98, mass: 0.999 }];
    default:
      return improving;
  }
}

function takes(a: Athlete, skin: number, massFactor: number): Record<string, number[]> {
  const male = a.sex === "male";
  const mass = r1(a.massKg * massFactor);
  // Perímetros ∝ √(masa/talla) y diámetros ∝ √(talla·√masa): así la masa que
  // estima Kerr queda dentro del ±5 % de la medida (calibrado con anthropometryResults).
  const tall0 = a.heightCm / (male ? 180 : 166);
  const size = Math.sqrt(mass / (male ? 76 : 62) / tall0);
  const muscle = a.build * size * (male ? 1 : 1.05);
  const tall = Math.sqrt(tall0 * Math.sqrt(mass / (male ? 76 : 62)));
  const v: Partial<Record<AnthroSiteKey, number>> = {
    bodyMass: mass,
    stature: a.heightCm,
    sittingHeight: r1(a.heightCm * (male ? 0.522 : 0.527)),
    armRelaxed: r1((male ? 31 : 26.5) * muscle),
    armFlexed: r1((male ? 33.6 : 28) * muscle),
    waist: r1((male ? 80 : 68) * size * (0.97 + 0.03 * skin)),
    hip: r1((male ? 95 : 96) * size),
    calf: r1((male ? 37.5 : 35) * muscle),
    forearm: r1((male ? 28 : 24) * muscle),
    chest: r1((male ? 99 : 87) * size),
    midThigh: r1((male ? 55 : 53) * muscle),
    head: male ? 57 : 55,
    humerus: r1((male ? 7.0 : 6.1) * tall),
    wrist: r1((male ? 5.8 : 5.0) * tall),
    femur: r1((male ? 9.8 : 9.0) * tall),
    biacromial: r1((male ? 40.5 : 36.5) * tall),
    biiliocristal: r1((male ? 28.5 : 27.5) * tall),
    chestTransverse: r1((male ? 30 : 26.5) * size),
    chestAP: r1((male ? 20 : 17.5) * size),
  };
  for (const [k, base] of Object.entries(SKINFOLDS[a.sex]) as [AnthroSiteKey, number][]) {
    v[k] = r1(base * a.adiposity * skin * between(0.93, 1.07));
  }
  // Dos tomas iguales (dentro de la tolerancia ISAK).
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, [x!, x!]]));
}

// ── Textos ─────────────────────────────────────────────────────────────────────

const NOTES: Record<"inicio" | "mitad" | "cierre", (a: Athlete) => string> = {
  inicio: (a) =>
    `Evaluación de pretemporada. ${a.position}. Antropometría ISAK completa y prueba de sudoración en calor. ${
      a.restrictions.length ? "Se adapta el plan a las restricciones de la ficha. " : ""
    }Objetivo de la temporada: ${a.sex === "female" ? "sostener la disponibilidad energética y mejorar la masa muscular" : "llegar al inicio del torneo con Σ6 pliegues estable y buena recuperación entre partidos"}.`,
  mitad: (a) =>
    pick([
      "Control de mitad de temporada. Buena tolerancia a la carga de hidratos el día de partido. Se ajusta la colación posentreno.",
      "Refiere cansancio en la semana de doble competencia. Se revisa la recuperación: suma de batido con leche y cacao al terminar el partido.",
      "Viene cumpliendo el plan. Se agregan opciones para los viajes (viandas y compras en ruta).",
      `Sin cambios en la ficha. ${a.trajectory === "dropping" ? "Comenta que le cuesta sostener las comidas los días de facultad." : "Mantener la estrategia actual."}`,
    ]),
  cierre: (a) => {
    switch (a.trajectory) {
      case "rising_fat":
        return "Control de noviembre: suben los pliegues frente a agosto (lesión en septiembre, tres semanas sin entrenar). Se baja la carga de hidratos los días de descanso y se coordina con kinesiología.";
      case "dropping":
        return "Baja la adherencia en las últimas dos semanas (exámenes). Se simplifica el plan y se acuerda registrar al menos almuerzo y cena en el portal.";
      case "stale":
        return "Pendiente el control de noviembre: no pudo venir a la evaluación por la convocatoria a la selección.";
      default:
        return "Control de noviembre: Σ6 pliegues en descenso, masa muscular estable. Muy buena adherencia. Se mantiene el plan hasta el cierre del torneo.";
    }
  },
};

const THREADS: { from: "pro" | "athlete"; text: string }[][] = [
  [
    { from: "athlete", text: "Hola, el sábado viajamos y llegamos a las 14 al hotel. ¿Qué como antes del partido de las 17?" },
    { from: "pro", text: "Hola. Almorzá al llegar algo simple: fideos o arroz con pollo, sin salsas pesadas. A las 15:30, pan con mermelada y una banana. Llevá la botella con la bebida isotónica." },
    { from: "athlete", text: "Perfecto, gracias!" },
  ],
  [
    { from: "pro", text: "Vi que esta semana registraste pocas comidas. ¿Cómo venís?" },
    { from: "athlete", text: "Con los parciales se me complicó, como afuera casi todos los días." },
    { from: "pro", text: "Te armo opciones de vianda para llevar a la facultad. Lo vemos el jueves después del entrenamiento." },
  ],
  [
    { from: "athlete", text: "¿Puedo tomar creatina? Me la recomendó un compañero." },
    { from: "pro", text: "Lo charlamos en el próximo control: la indicamos según el momento de la temporada y siempre de un producto con análisis de terceros. No la empieces por tu cuenta." },
  ],
  [
    { from: "pro", text: "Te subí el informe de octubre al portal. Mirá la parte de hidratación: en la prueba perdiste casi 3 % del peso." },
    { from: "athlete", text: "Lo vi. ¿Cuánto tendría que tomar durante el entrenamiento?" },
    { from: "pro", text: "Unos 600–800 ml por hora, en sorbos cada 15 minutos. En el próximo entrenamiento largo repetimos la prueba." },
  ],
];

// ── Programa ───────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed-club no corre en producción.");
  const password = env("SEED_CLUB_PASSWORD");
  const { db: owner, pool } = createDb(env("DATABASE_OWNER_URL"));

  try {
    // No se borra un club existente: su auditoría es append-only (migración 0010).
    // Para rearmarlo, recrear la base con `pnpm --filter @nutreitor/db db:reset-dev`.
    const [existing] = await owner.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, CLUB.slug));
    if (existing) {
      console.log(`El club ${CLUB.slug} ya existe; no se toca. Para rearmarlo, recreá la base con db:reset-dev.`);
      return;
    }

    // ── Organización, sedes y personas (rol owner, como el alta de la plataforma) ──
    const [orgRow] = await owner
      .insert(organizations)
      .values({
        name: CLUB.name,
        slug: CLUB.slug,
        region: CLUB.region,
        status: "active",
        kind: "team",
        displayName: CLUB.displayName,
        brandPrimaryColor: CLUB.primary,
        brandSecondaryColor: CLUB.secondary,
        publicHeadline: CLUB.headline,
        publicDescription: CLUB.description,
        reviewedAt: new Date(),
      })
      .returning({ id: organizations.id });
    const org: Org = { id: orgRow!.id, name: CLUB.name, slug: CLUB.slug, region: CLUB.region, status: "active", kind: "team" };

    const locRows = await owner
      .insert(locations)
      .values(CLUB.locations.map((name) => ({ tenantId: org.id, region: org.region, name })))
      .returning({ id: locations.id, name: locations.name });
    const locationId = new Map(locRows.map((l) => [l.name, l.id]));

    const hashedPassword = bcrypt.hashSync(password, 10);
    const email = (local: string) => `${local}@${CLUB.emailDomain}`;

    const staff = new Map<StaffSeed["key"], { userId: string; membershipId: string; seed: StaffSeed }>();
    for (const s of STAFF) {
      const [u] = await owner.insert(users).values({ email: email(s.email), fullName: s.fullName, hashedPassword }).returning({ id: users.id });
      const [m] = await owner
        .insert(memberships)
        .values({ userId: u!.id, organizationId: org.id, role: s.role, region: org.region })
        .returning({ id: memberships.id });
      await owner.insert(professionalProfiles).values({
        organizationId: org.id,
        region: org.region,
        membershipId: m!.id,
        profileSlug: s.profileSlug,
        isPubliclyListed: true,
        displayOrder: STAFF.indexOf(s),
        headline: s.headline,
        bio: s.bio,
        specialty: s.specialties[0] ?? null,
        specialties: s.specialties,
        visibility: { headline: true, bio: true, specialties: true },
        licenseNumber: s.license,
        licenseJurisdiction: s.license ? "Nacional" : null,
        licenseStatus: "reviewed",
      });
      staff.set(s.key, { userId: u!.id, membershipId: m!.id, seed: s });
    }
    const admin = staff.get("admin")!;
    const asAdmin = <X>(fn: () => Promise<X>) => as(org, admin.userId, "admin", fn);

    // ── Deportistas (cuenta de portal para cada uno) ──
    const usedNames = new Set<string>();
    const athletes: Athlete[] = [];
    for (const squad of SQUADS) {
      for (let i = 0; i < squad.count; i++) {
        let fullName: string;
        do fullName = `${pick(FIRST_NAMES[squad.sex])} ${pick(LAST_NAMES)}`;
        while (usedNames.has(fullName));
        usedNames.add(fullName);
        const age = Math.round(between(...squad.ageRange));
        const heightCm = Math.round(between(...squad.heightCm));
        const bmi = between(...squad.bmi);
        const clinical = CLINICAL_CASES.find((c) => c.sport === squad.sport && c.index === i);
        const t = rand();
        const trajectory: Trajectory = t < 0.55 ? "improving" : t < 0.75 ? "steady" : t < 0.85 ? "dropping" : t < 0.93 ? "rising_fat" : "stale";
        const local = fullName
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z ]/g, "")
          .trim()
          .replace(/\s+/g, ".");
        athletes.push({
          userId: "",
          fullName,
          email: email(local),
          squad,
          index: i,
          position: squad.positions[i] ?? "Jugador",
          sex: squad.sex,
          birthDate: `${2026 - age}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
          heightCm,
          massKg: r1((bmi * heightCm * heightCm) / 10000),
          adiposity: squad.sex === "male" ? between(0.72, 1.02) : between(0.85, 1.12),
          build: between(0.98, 1.03),
          trajectory,
          restrictions: clinical?.allergyFlags?.filter((f) => SWAPS[f]) ?? [],
        });
      }
    }
    const athleteUsers = await owner
      .insert(users)
      .values(athletes.map((a) => ({ email: a.email, fullName: a.fullName, hashedPassword })))
      .returning({ id: users.id, email: users.email });
    const userByEmail = new Map(athleteUsers.map((u) => [u.email, u.id]));
    const athleteMemberships = await owner
      .insert(memberships)
      .values(athletes.map((a) => ({ userId: userByEmail.get(a.email)!, organizationId: org.id, role: "patient" as const, region: org.region })))
      .returning({ id: memberships.id, userId: memberships.userId });
    const membershipByUser = new Map(athleteMemberships.map((m) => [m.userId, m.id]));
    for (const a of athletes) {
      a.userId = userByEmail.get(a.email)!;
      a.membershipId = membershipByUser.get(a.userId);
    }

    // ── Servicios de la API ──
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
    const svc = {
      patients: app.get(PatientsService),
      groups: app.get(GroupsService),
      groupActions: app.get(GroupActionsService),
      anthropometry: app.get(AnthropometryService),
      energy: app.get(EnergyService),
      plans: app.get(MealPlansService),
      templates: app.get(PlanTemplatesService),
      metrics: app.get(MetricsService),
      hydration: app.get(HydrationService),
      notes: app.get(PatientNotesService),
      adherence: app.get(AdherenceService),
      reports: app.get(ReportsService),
      conversations: app.get(ConversationsService),
      scheduling: app.get(SchedulingService),
      modules: app.get(OrgModulesService),
      foods: app.get(FoodsService),
    };

    try {
      await asAdmin(() => svc.modules.install("agents", { plan: "standard", acceptTerms: true }));
      const foods = await asAdmin(() => svc.foods.catalogBySlugs(ALL_SLUGS));
      const missing = ALL_SLUGS.filter((s) => !foods.has(s));
      if (missing.length) throw new Error(`Faltan alimentos en el catálogo: ${missing.join(", ")}`);

      // Fichas, planteles y asignación del nutricionista de cada disciplina.
      for (const squad of SQUADS) {
        const pro = staff.get(squad.sport)!;
        const members = athletes.filter((a) => a.squad === squad);
        for (const a of members) {
          const clinical = CLINICAL_CASES.find((c) => c.sport === squad.sport && c.index === a.index);
          const created = await asAdmin(() =>
            svc.patients.create(
              createPatientSchema.parse({
                fullName: a.fullName,
                documentId: `${Math.floor(between(38, 47))}.${String(Math.floor(rand() * 1000)).padStart(3, "0")}.${String(Math.floor(rand() * 1000)).padStart(3, "0")}`,
                birthDate: a.birthDate,
                sex: a.sex,
                email: a.email,
                phone: `+54 9 11 ${Math.floor(between(2000, 6999))}-${Math.floor(between(1000, 9999))}`,
                country: "AR",
                timezone: "America/Argentina/Buenos_Aires",
                reasonForConsult: `${squad.group} · ${a.position}. Seguimiento de la temporada 2026.`,
                medicalHistory: pick(["Sin antecedentes relevantes.", "Esguince de tobillo derecho (2024).", "Desgarro isquiotibial (2025), recuperado.", "Sin antecedentes quirúrgicos."]),
                allergies: clinical?.allergies ?? "Sin alergias conocidas.",
                allergyFlags: clinical?.allergyFlags ?? [],
                currentMedication: clinical?.currentMedication ?? "Ninguna.",
                diagnosedConditions: clinical?.diagnosedConditions ?? null,
                familyHistory: pick(["Sin datos relevantes.", "Diabetes tipo 2 (padre).", "Hipertensión (madre).", "Sin datos relevantes."]),
                heightCm: a.heightCm,
                initialWeightKg: r1(a.massKg * seasonFactors(a.trajectory)[0]!.mass),
                activityLevel: "very_active",
                goal: a.sex === "female" ? "Rendimiento y disponibilidad energética adecuada" : pick(["Rendimiento y recuperación", "Recomposición corporal", "Ganar masa muscular"]),
                dietaryPreferences: pick(["Come de todo.", "No le gusta el pescado.", "Prefiere comidas caseras; cocina los fines de semana.", "Vive solo: necesita opciones rápidas."]),
                locationId: locationId.get(squad.location),
              }),
            ),
          );
          a.id = created.id;
        }
        // Vincula la cuenta del portal a la ficha (en la app lo hace aceptar la invitación).
        for (const a of members) await owner.update(patients).set({ userId: a.userId }).where(eq(patients.id, a.id!));

        const group = await asAdmin(() => svc.groups.create(saveGroupSchema.parse({ name: squad.group, description: squad.description })));
        await asAdmin(() => svc.groups.addMembers(group.id, addGroupMembersSchema.parse({ patientIds: members.map((a) => a.id!) })));
        await asAdmin(() => svc.groupActions.assignProfessional(group.id, { membershipId: pro.membershipId }));
        const asPro = <X>(fn: () => Promise<X>) => as(org, pro.userId, "professional", fn);

        // Plantilla del plantel (biblioteca de planes).
        await asPro(() =>
          svc.templates.create(
            savePlanTemplateSchema.parse({
              name: `${squad.group}: semana tipo`,
              description: `Semana de competencia para un deportista de 75 kg. Se ajusta con el requerimiento de cada uno.`,
              body: {
                layout: "week",
                days: Object.fromEntries(weekdays.map((d) => [d, buildDay(
                      squad.dayTypes.find((t) => t.id === squad.week[d])!.menu,
                      (({ choGPerKg, proGPerKg }) => ({ choG: choGPerKg * 75, proG: proGPerKg * 75, fatG: 1.1 * 75 }))(squad.dayTypes.find((t) => t.id === squad.week[d])!),
                      [],
                      foods,
                    )])),
                dayLabels: Object.fromEntries(weekdays.map((d) => [d, squad.dayTypes.find((t) => t.id === squad.week[d])!.name])),
              },
            }),
          ),
        );

        // Pruebas de sudoración del plantel (pretemporada y octubre).
        for (const [k, s] of squad.sweat.entries()) {
          await asPro(() =>
            svc.hydration.createForGroup(
              group.id,
              saveGroupSweatTestSchema.parse({
                measuredOn: s.on,
                sessionLabel: s.label,
                durationMin: s.durationMin,
                temperatureC: s.temperatureC,
                humidityPct: s.humidityPct,
                entries: members.map((a) => {
                  const pre = r1(a.massKg * seasonFactors(a.trajectory)[k === 0 ? 0 : 3]!.mass);
                  // Pretemporada con calor: varios pasan el 2 %. Octubre: casi todos por debajo.
                  const lossPct = k === 0 ? between(1.2, 3.4) : a.trajectory === "dropping" ? between(2.1, 3.2) : between(0.7, 1.9);
                  return {
                    patientId: a.id!,
                    preWeightKg: pre,
                    postWeightKg: r1(pre * (1 - lossPct / 100)),
                    fluidIntakeMl: Math.round(between(300, 1100) / 50) * 50,
                    urineMl: chance(0.3) ? Math.round(between(100, 300) / 50) * 50 : 0,
                  };
                }),
              }),
            ),
          );
        }

        for (const a of members) {
          const factors = seasonFactors(a.trajectory);
          const sessions = SESSIONS.filter((_, k) => !(k === 3 && a.trajectory === "stale"));

          // Antropometría ISAK de la temporada.
          let lastFfm = 0;
          for (const [k, on] of sessions.entries()) {
            const s = await asPro(() =>
              svc.anthropometry.create(a.id!, saveAnthropometrySchema.parse({ measuredAt: on, takes: takes(a, factors[k]!.skin, factors[k]!.mass), note: k === 0 ? "Evaluación de pretemporada." : null })),
            );
            const fat = s.results.fat.durninWomersley;
            const mass = a.massKg * factors[k]!.mass;
            if (fat.ok) lastFfm = mass * (1 - fat.value / 100);
          }

          // Mediciones de peso del portal (quincenales desde marzo).
          for (let d = "2026-03-02", k = 0; d <= TODAY; d = addDays(d, 14), k++) {
            const progress = Math.min(1, k / 18);
            const f = factors[0]!.mass + (factors[3]!.mass - factors[0]!.mass) * progress;
            await asPro(() => svc.metrics.record(a.id!, recordMetricSchema.parse({ measuredAt: d, weightKg: r1(a.massKg * f + between(-0.4, 0.4)) })));
          }

          // Requerimiento: versión de pretemporada y ajuste de agosto.
          const energyDto = (massFactor: number, adjustment: number, note: string) => {
            const weightKg = r1(a.massKg * massFactor);
            const ffmKg = r1(lastFfm > 0 && lastFfm < weightKg ? lastFfm : weightKg * (a.sex === "male" ? 0.88 : 0.78));
            // Factor de actividad sin el entrenamiento, individual: el que deja la
            // disponibilidad energética del día de descanso cerca de 50 kcal/kg MLG.
            const activityFactor = Math.round(Math.min(1.9, Math.max(1.4, (50 * ffmKg) / (500 + 22 * ffmKg))) * 100) / 100;
            return saveEnergySchema.parse({
              formula: "cunningham",
              activityFactor,
              adjustmentPct: adjustment,
              weightKg,
              heightCm: a.heightCm,
              ffmKg,
              dayTypes: squad.dayTypes.map(({ menu: _menu, ...d }) => d),
              week: squad.week,
              note,
            });
          };
          await asPro(() => svc.energy.create(a.id!, energyDto(factors[0]!.mass, a.trajectory === "improving" ? -5 : 0, "Pretemporada.")));
          const req = await asPro(() => svc.energy.create(a.id!, energyDto(
                factors[2]!.mass,
                squad.sport === "hockey" && a.index === 7 ? -8 : a.trajectory === "rising_fat" ? -5 : 0,
                squad.sport === "hockey" && a.index === 7
                  ? "Pidió bajar de peso antes del torneo. Se acepta un déficit acotado y se controla la disponibilidad energética."
                  : "Ajuste de mitad de temporada con la antropometría de agosto.",
              )));
          if (!req.results.days.ok) throw new Error(`Requerimiento sin resultado para ${a.fullName}: ${req.results.days.reason}`);
          const target = new Map(req.results.days.value.map((d) => [d.id, d]));

          // Plan alimentario de la semana tipo, escalado al requerimiento de cada día.
          const days = Object.fromEntries(
            weekdays.map((d) => {
              const t = squad.dayTypes.find((x) => x.id === squad.week[d])!;
              return [d, buildDay(t.menu, target.get(t.id)!, a.restrictions, foods)];
            }),
          );
          await asPro(() =>
            svc.plans.save(
              a.id!,
              savePlanSchema.parse({
                title: `Plan de temporada · ${squad.group}`,
                startDate: "2026-08-24",
                draftedFrom: "template",
                editSeconds: Math.round(between(900, 2100)),
                body: {
                  layout: "week",
                  days,
                  dayLabels: Object.fromEntries(weekdays.map((d) => [d, squad.dayTypes.find((t) => t.id === squad.week[d])!.name])),
                  dayTargets: Object.fromEntries(weekdays.map((d) => [d, { kcal: Math.round(target.get(squad.week[d])!.targetKcal) }])),
                  generalNotes:
                    "Hidratación: 500 ml en las 2 h previas al entrenamiento y 600–800 ml por hora durante. Reponer el 150 % del peso perdido después. Los días de partido, la última comida completa 3–4 h antes.",
                },
              }),
            ),
          );

          // Notas clínicas.
          for (const k of ["inicio", "mitad", "cierre"] as const) {
            await asPro(() => svc.notes.addNote(a.id!, { content: NOTES[k](a) }));
          }
          const clinical = CLINICAL_CASES.find((c) => c.sport === squad.sport && c.index === a.index);
          if (clinical?.note) await asPro(() => svc.notes.addNote(a.id!, { content: clinical.note! }));

          // Ajuste de noviembre, después del control (parte del plan anterior).
          if (a.trajectory !== "stale") {
            await asPro(() =>
              svc.plans.save(
                a.id!,
                savePlanSchema.parse({
                  title: `Plan de temporada · ${squad.group} · ajuste de noviembre`,
                  startDate: "2026-11-10",
                  draftedFrom: a.trajectory === "improving" ? "template" : "previous",
                  editSeconds: Math.round(between(240, 720)),
                  body: {
                    layout: "week",
                    days,
                    dayLabels: Object.fromEntries(weekdays.map((d) => [d, squad.dayTypes.find((t) => t.id === squad.week[d])!.name])),
                    dayTargets: Object.fromEntries(weekdays.map((d) => [d, { kcal: Math.round(target.get(squad.week[d])!.targetKcal) }])),
                    generalNotes:
                      "Ajuste después del control de noviembre. Hidratación: 500 ml en las 2 h previas al entrenamiento y 600–800 ml por hora durante; reponer el 150 % del peso perdido. Los días de partido, la última comida completa 3–4 h antes.",
                  },
                }),
              ),
            );
          }

          // Lo que ve el deportista en el portal: su antropometría.
          await asPro(() => svc.patients.setClinicalVisibility(a.id!, { anthroSkinfolds: true, anthroFat: true, anthroKerr: true, anthroSomatotype: true }));
        }

        // Disponibilidad de turnos del nutricionista (en el club, martes y jueves; consultorio, lunes).
        await asPro(() =>
          svc.scheduling.setMyAvailability(
            setAvailabilitySchema.parse({
              timezone: "America/Argentina/Buenos_Aires",
              windows: [
                { weekday: 1, startMinute: 16 * 60, endMinute: 20 * 60, slotMinutes: 30 },
                { weekday: 2, startMinute: 9 * 60, endMinute: 13 * 60, slotMinutes: 30 },
                { weekday: 4, startMinute: 9 * 60, endMinute: 13 * 60, slotMinutes: 30 },
              ],
            }),
          ),
        );
      }

      // ── Portal: adherencia y registros diarios de las últimas 6 semanas ──
      // La app deja registrar solo los últimos días: esos van por el servicio (como
      // los registraría el deportista) y el historial anterior directo a la tabla.
      const start = addDays(TODAY, -42);
      const planRows = await owner
        .select({ id: mealPlans.id, patientId: mealPlans.patientId, version: mealPlans.version })
        .from(mealPlans)
        .where(inArray(mealPlans.patientId, athletes.map((a) => a.id!)));
      /** Plan vigente en una fecha: el ajuste de noviembre rige desde el 10. */
      const planOf = (patientId: string, date: string) =>
        planRows.find((p) => p.patientId === patientId && p.version === (date >= "2026-11-10" ? 2 : 1))?.id ??
        planRows.find((p) => p.patientId === patientId && p.version === 1)?.id ??
        null;
      for (const a of athletes) {
        const asAthlete = <X>(fn: () => Promise<X>) => as(org, a.userId, "patient", fn);
        const tenant = { tenantId: org.id, region: org.region, patientId: a.id! };
        const base = a.trajectory === "dropping" ? 0.86 : a.trajectory === "steady" || a.trajectory === "improving" ? between(0.82, 0.96) : between(0.68, 0.84);
        const logs = a.trajectory === "stale" ? 0.55 : 0.88;
        for (let d = start; d < TODAY; d = addDays(d, 1)) {
          const late = a.trajectory === "dropping" && d >= addDays(TODAY, -12);
          const p = late ? 0.45 : base;
          if (!chance(late ? 0.6 : logs)) continue;
          const menu = a.squad.dayTypes.find((t) => t.id === a.squad.week[weekdayOf(d)])!.menu;
          for (const meal of MENUS[menu]) {
            const r = rand();
            const status = r < p ? "done" : r < p + (1 - p) * 0.55 ? "partial" : "skipped";
            const log = logMealSchema.parse({
              date: d,
              mealName: meal.name,
              status,
              note: status === "skipped" && chance(0.3) ? pick(["Me quedé dormido.", "Comí en la facultad.", "No tenía hambre después del entrenamiento.", "Viaje con el equipo."]) : null,
            });
            if (isLoggableDate(d, TODAY)) await asAthlete(() => svc.adherence.logMeal(log));
            else await owner.insert(adherenceMealLogs).values({ ...tenant, ...log, planId: planOf(a.id!, d), createdAt: at(d, 22), updatedAt: at(d, 22) });
          }
          if (weekdayOf(d) === "mon" || weekdayOf(d) === "thu") {
            const checkin = checkinSchema.parse({
              date: d,
              hunger: Math.round(between(2, 4)),
              energy: late ? Math.round(between(2, 3)) : Math.round(between(3, 5)),
              mood: Math.round(between(3, 5)),
              note: null,
            });
            if (isLoggableDate(d, TODAY)) await asAthlete(() => svc.adherence.checkin(checkin));
            else await owner.insert(adherenceCheckins).values({ ...tenant, ...checkin, createdAt: at(d, 22), updatedAt: at(d, 22) });
          }
        }
      }

      // ── Informes de octubre, publicados en el portal ──
      for (const a of athletes) {
        const pro = staff.get(a.squad.sport)!;
        const asPro = <X>(fn: () => Promise<X>) => as(org, pro.userId, "professional", fn);
        const report = await asPro(() => svc.reports.create(a.id!, "2026-10"));
        await asPro(() =>
          svc.reports.updateComment(
            a.id!,
            report.id,
            a.trajectory === "dropping"
              ? "Buen octubre en general. En las últimas semanas bajó el registro: retomemos almuerzo y cena como mínimo."
              : "Muy buen mes. Seguí con la recuperación posentrenamiento y la hidratación que acordamos.",
          ),
        );
        await asPro(() => svc.reports.publish(a.id!, report.id));
      }

      // ── Mensajes entre deportistas y nutricionistas ──
      const threadAthletes = SQUADS.flatMap((s) => athletes.filter((a) => a.squad === s).slice(1, 3));
      for (const [k, a] of threadAthletes.entries()) {
        const pro = staff.get(a.squad.sport)!;
        const { conversationId } = await as(org, pro.userId, "professional", () => svc.conversations.openWithPatient(a.id!));
        const thread = THREADS[k % THREADS.length]!;
        for (const msg of thread) {
          const [userId, role]: [string, MembershipRole] = msg.from === "pro" ? [pro.userId, "professional"] : [a.userId, "patient"];
          await as(org, userId, role, () => svc.conversations.send(conversationId, msg.text));
        }
        // Mensajes de los últimos días, en orden.
        const rows = await owner.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
        const day = addDays(TODAY, -(1 + (k % 6)));
        for (const [j, row] of rows.entries()) await owner.update(messages).set({ createdAt: at(day, 10 + j, 5 + j * 7) }).where(eq(messages.id, row.id));
      }

      // ── Turnos de las próximas dos semanas ──
      for (const squad of SQUADS) {
        const pro = staff.get(squad.sport)!;
        const asPro = <X>(fn: () => Promise<X>) => as(org, pro.userId, "professional", fn);
        const slots = await asPro(() => svc.scheduling.mySlots(new Date().toISOString(), new Date(Date.now() + 14 * 86_400_000).toISOString()));
        const who = athletes.filter((a) => a.squad === squad && (a.trajectory !== "improving" || a.index % 4 === 0));
        for (const [k, a] of who.entries()) {
          const slot = slots[k * 3];
          if (!slot) break;
          await asPro(() =>
            svc.scheduling.bookForPatient(
              bookAppointmentSchema.parse({
                startsAt: slot.startsAt,
                patientId: a.id,
                notes: a.trajectory === "stale" ? "Control antropométrico pendiente de noviembre." : a.trajectory === "dropping" ? "Revisar adherencia y viandas." : "Control de rutina.",
              }),
            ),
          );
        }
      }
    } finally {
      await app.close();
    }

    // ── Fechas de creación hacia atrás (la app las pone en "ahora") ──
    const ids = athletes.map((a) => a.id!);
    await owner.execute(sql`
      update ${patients} set created_at = timestamp '2026-03-02 12:00' + (random() * interval '6 days')
      where ${inArray(patients.id, ids)}`);
    const energyRows = await owner.select({ id: energyRequirements.id, patientId: energyRequirements.patientId, note: energyRequirements.note }).from(energyRequirements).where(inArray(energyRequirements.patientId, ids));
    for (const r of energyRows) await owner.update(energyRequirements).set({ createdAt: at(r.note === "Pretemporada." ? "2026-03-10" : "2026-08-25", 11) }).where(eq(energyRequirements.id, r.id));
    await owner.update(mealPlans).set({ createdAt: at("2026-08-24", 18) }).where(and(inArray(mealPlans.patientId, ids), eq(mealPlans.version, 1)));
    await owner.execute(sql`
      update ${mealPlans} set created_at = timestamp '2026-11-10 14:00' + (random() * interval '4 days')
      where ${and(inArray(mealPlans.patientId, ids), eq(mealPlans.version, 2))}`);
    const noteRows = await owner.select({ id: patientNotes.id, patientId: patientNotes.patientId }).from(patientNotes).where(inArray(patientNotes.patientId, ids)).orderBy(patientNotes.createdAt);
    const seen = new Map<string, number>();
    for (const n of noteRows) {
      const k = seen.get(n.patientId) ?? 0;
      seen.set(n.patientId, k + 1);
      await owner.update(patientNotes).set({ createdAt: at(["2026-03-09", "2026-08-24", "2026-11-09", "2026-11-10"][k] ?? TODAY, 12 + k) }).where(eq(patientNotes.id, n.id));
    }
    await owner.update(patientReports).set({ createdAt: at("2026-11-03", 10), updatedAt: at("2026-11-03", 10) }).where(and(inArray(patientReports.patientId, ids), eq(patientReports.period, "2026-10-01")));

    console.log(`\nClub "${CLUB.name}" listo: ${athletes.length} deportistas en ${SQUADS.length} planteles.`);
    console.log(`Subdominio: ${CLUB.slug}   Contraseña de todas las cuentas: la de SEED_CLUB_PASSWORD\n`);
    for (const s of STAFF) console.log(`  ${s.role === "admin" ? "Coordinación " : "Nutricionista"}  ${email(s.email)}`);
    const sample = SQUADS.map((s) => athletes.find((a) => a.squad === s && a.trajectory === "improving")!);
    for (const a of sample) console.log(`  Deportista    ${a.email}  (${a.squad.group})`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
