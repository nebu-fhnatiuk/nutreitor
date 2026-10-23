// Datos de salud FICTICIOS para el plantel de demo (tools/demo-data/plantel-demo.csv).
// Usa los servicios compilados de la API (mismas reglas y auditoría que la pantalla),
// validando cada carga con los schemas de `shared`. La adherencia la marca el
// deportista desde el portal; como estos no tienen cuenta, va directo a la base.
//
// Correr dentro del contenedor de la API, después de `pnpm --filter @nutreitor/api build`:
//   docker compose exec -T api node /app/tools/demo-data/seed-salud.mjs
// Es idempotente: saltea a quien ya tiene antropometría.
import "reflect-metadata";

import { createDb, withTenant } from "@nutreitor/db";
import {
  saveAnthropometrySchema,
  saveEnergySchema,
  saveFoodFrequencySchema,
  savePlanSchema,
  saveSweatTestSchema,
  recordMetricSchema,
  needsThirdTake,
} from "@nutreitor/shared";
import { sql } from "drizzle-orm";

const API = "/app/apps/api/dist";
const { AuditService } = await import(`${API}/core/audit/audit.service.js`);
const { TenantDbService } = await import(`${API}/core/database/tenant-db.service.js`);
const { tenantStorage } = await import(`${API}/core/tenant/tenant-context.store.js`);
const { AnthropometryService } = await import(`${API}/modules/patients/anthropometry.service.js`);
const { MetricsService } = await import(`${API}/modules/patients/metrics.service.js`);
const { HydrationService } = await import(`${API}/modules/patients/hydration.service.js`);
const { EnergyService } = await import(`${API}/modules/patients/energy.service.js`);
const { MealPlansService } = await import(`${API}/modules/patients/meal-plans.service.js`);
const { FoodFrequencyService } = await import(`${API}/modules/patients/food-frequency.service.js`);
const { ReportsService } = await import(`${API}/modules/patients/reports.service.js`);
const { CareAssignmentsService } = await import(`${API}/modules/patients/care-assignments.service.js`);

const { db: appDb, pool: appPool } = createDb(process.env.DATABASE_URL);
const { db: owner, pool: ownerPool } = createDb(process.env.DATABASE_OWNER_URL);
const tenantDb = new TenantDbService(appDb);
const audit = new AuditService();
const svc = {
  anthro: new AnthropometryService(tenantDb, audit),
  metrics: new MetricsService(tenantDb, audit),
  sweat: new HydrationService(tenantDb, audit),
  energy: new EnergyService(tenantDb, audit),
  plans: new MealPlansService(tenantDb, audit),
  ffq: new FoodFrequencyService(tenantDb, audit),
  reports: new ReportsService(tenantDb, audit),
  care: new CareAssignmentsService(tenantDb, audit),
};

const [org] = (await owner.execute(sql`select id, name, slug, region, status, kind from organizations where slug = 'demo'`)).rows;
const [pro] = (
  await owner.execute(sql`select m.id as membership_id, u.id as user_id from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${org.id} and u.email = 'pro@demo.test' and m.revoked_at is null`)
).rows;
const [admin] = (
  await owner.execute(sql`select u.id as user_id from memberships m join users u on u.id = m.user_id
    where m.organization_id = ${org.id} and u.email = 'admin@demo.test' and m.revoked_at is null`)
).rows;

const as = (userId, role, fn) =>
  tenantStorage.run(
    {
      context: { tenantId: org.id, orgId: org.id, region: org.region },
      org: { id: org.id, name: org.name, slug: org.slug, region: org.region, status: org.status, kind: org.kind },
      user: { id: userId, role },
    },
    fn,
  );
const asPro = (fn) => as(pro.user_id, "professional", fn);
const asAdmin = (fn) => as(admin.user_id, "admin", fn);

// ── Azar reproducible por deportista ─────────────────────────────────────────
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, a, b) => a + (b - a) * r();
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const TODAY = new Date("2026-10-23T12:00:00Z");
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86_400_000).toISOString().slice(0, 10);

// ── Perfiles base (adulto masculino, femenino, juvenil) ──────────────────────
const BASE = {
  M: {
    sittingHeight: 0.525, triceps: 8, subscapular: 10, biceps: 4, iliacCrest: 12, supraspinale: 8, abdominal: 14,
    frontThigh: 11, medialCalf: 7, armRelaxed: 31, armFlexed: 34, waist: 80, hip: 96, calf: 38, forearm: 28,
    chest: 98, midThigh: 56, head: 57, humerus: 7.0, wrist: 5.7, femur: 9.8, biacromial: 41, biiliocristal: 28.5,
    chestTransverse: 30, chestAP: 20,
  },
  F: {
    sittingHeight: 0.53, triceps: 15, subscapular: 11, biceps: 7, iliacCrest: 15, supraspinale: 11, abdominal: 17,
    frontThigh: 21, medialCalf: 13, armRelaxed: 27, armFlexed: 28.5, waist: 68, hip: 95, calf: 35, forearm: 23.5,
    chest: 86, midThigh: 53, head: 55, humerus: 6.0, wrist: 5.0, femur: 8.8, biacromial: 36, biiliocristal: 27.5,
    chestTransverse: 26, chestAP: 17.5,
  },
};
const SKINFOLDS = ["triceps", "subscapular", "biceps", "iliacCrest", "supraspinale", "abdominal", "frontThigh", "medialCalf"];
const GIRTHS = ["armRelaxed", "armFlexed", "waist", "hip", "calf", "forearm", "chest", "midThigh"];

/** Dos tomas dentro de la tolerancia ISAK (5% pliegues, 1% el resto). */
function twoTakes(r, key, v) {
  const tol = SKINFOLDS.includes(key) ? 0.05 : 0.01;
  const a = round(v);
  let b = round(v * (1 + between(r, -0.5, 0.5) * tol));
  if (needsThirdTake(key, [a, b])) b = a;
  return [a, b];
}

function profile(p, r) {
  const sex = p.sex === "female" ? "F" : "M";
  const youth = p.groups.includes("Sub-17");
  const stature = sex === "F" ? between(r, 158, 173) : youth ? between(r, 168, 182) : between(r, 172, 189);
  const bmi = sex === "F" ? between(r, 20.5, 23) : youth ? between(r, 20, 22.5) : between(r, 22.5, 25.5);
  return { sex, youth, stature, mass: bmi * (stature / 100) ** 2, fat: between(r, 0.8, 1.3), trend: r() < 0.8 ? -1 : 1 };
}

/** Sesión ISAK completa (incluye el bloque de Kerr) para la sesión `k` (0 = pretemporada). */
function anthroTakes(pf, r, k) {
  const base = BASE[pf.sex];
  const massK = [1.2, 0.4, -0.3][k] * (pf.trend < 0 ? 1 : -0.6);
  const mass = pf.mass + massK;
  const fatK = pf.fat * (pf.trend < 0 ? [1, 0.93, 0.88][k] : [1, 1.04, 1.08][k]);
  const size = Math.sqrt(pf.mass / (pf.sex === "F" ? 60 : 78));
  const tall = pf.stature / (pf.sex === "F" ? 165 : 180);
  const t = { bodyMass: [round(mass)], stature: [round(pf.stature)] };
  t.sittingHeight = twoTakes(r, "sittingHeight", pf.stature * base.sittingHeight);
  for (const s of SKINFOLDS) t[s] = twoTakes(r, s, base[s] * fatK * between(r, 0.92, 1.08));
  for (const g of GIRTHS) {
    const fatty = g === "waist" || g === "hip" ? fatK ** 0.3 : 1;
    t[g] = twoTakes(r, g, base[g] * size * fatty * between(r, 0.98, 1.02));
  }
  t.head = twoTakes(r, "head", base.head * between(r, 0.98, 1.02));
  for (const b of ["humerus", "wrist", "femur", "biacromial", "biiliocristal", "chestTransverse", "chestAP"]) {
    t[b] = twoTakes(r, b, base[b] * tall * between(r, 0.97, 1.03));
  }
  return t;
}

const PLAN_MEALS = (sex) => [
  { name: "Desayuno", time: "08:00", items: [{ text: "Avena cocida con leche", qty: sex === "F" ? 60 : 80, unit: "g" }, { text: "Banana", qty: 1, unit: "unidad" }, { text: "Mantequilla de maní", qty: 1, unit: "cda" }] },
  { name: "Colación pre-entrenamiento", time: "11:00", items: [{ text: "Yogur descremado", qty: 1, unit: "pote" }, { text: "Barra de cereal", qty: 1, unit: "unidad" }] },
  { name: "Almuerzo", time: "14:00", items: [{ text: "Pollo grillado", qty: sex === "F" ? 130 : 170, unit: "g" }, { text: "Arroz blanco cocido", qty: sex === "F" ? 150 : 220, unit: "g" }, { text: "Ensalada de hojas verdes y tomate" }] },
  { name: "Merienda", time: "17:30", items: [{ text: "Tostadas de pan integral", qty: 2, unit: "rebanadas" }, { text: "Queso untable", qty: 2, unit: "cdas" }, { text: "Fruta de estación", qty: 1, unit: "unidad" }] },
  { name: "Cena", time: "21:00", items: [{ text: "Fideos con salsa de tomate y carne magra", qty: sex === "F" ? 200 : 280, unit: "g" }, { text: "Verduras salteadas" }] },
];

const FFQ = (r) => {
  const pick = (opts) => opts[Math.floor(r() * opts.length)];
  return {
    vegetables: { frequency: pick(["daily1", "daily2to3", "weekly5to6"]), portions: 1 },
    fruits: { frequency: pick(["daily1", "daily2to3", "weekly2to4"]), portions: 1 },
    legumes: { frequency: pick(["weekly1", "weekly2to4", "monthly"]), portions: 1 },
    wholeGrains: { frequency: pick(["weekly2to4", "daily1", "never"]), portions: 1 },
    refinedGrains: { frequency: pick(["daily1", "daily2to3"]), portions: 1.5 },
    dairy: { frequency: pick(["daily1", "daily2to3"]), portions: 1 },
    redMeat: { frequency: pick(["weekly2to4", "weekly5to6"]), portions: 1 },
    poultry: { frequency: pick(["weekly2to4", "weekly5to6"]), portions: 1 },
    fish: { frequency: pick(["monthly", "weekly1", "never"]), portions: 1 },
    eggs: { frequency: pick(["weekly2to4", "daily1"]), portions: 2 },
    sugaryDrinks: { frequency: pick(["never", "weekly1", "weekly2to4", "daily1"]), portions: 1 },
    sweetsSnacks: { frequency: pick(["weekly1", "weekly2to4", "weekly5to6"]), portions: 1 },
    water: { frequency: pick(["daily4to5", "daily6plus", "daily2to3"]), portions: 1 },
    sportsDrinks: { frequency: pick(["weekly2to4", "weekly1", "never"]), portions: 1 },
  };
};

// ── Deportistas del plantel de demo ──────────────────────────────────────────
const athletes = (
  await owner.execute(sql`
    select p.id, p.full_name, p.sex, p.email,
           coalesce(array_agg(g.name) filter (where g.name is not null), '{}') as groups,
           exists (select 1 from care_assignments ca where ca.patient_id = p.id and ca.ended_at is null
                   and ca.membership_id = ${pro.membership_id}) as assigned
    from patients p
    left join patient_group_members gm on gm.patient_id = p.id
    left join patient_groups g on g.id = gm.group_id
    where p.tenant_id = ${org.id} and p.archived_at is null
      and (p.email like '%@ejemplo.test' or g.name = 'Sub-17')
    group by p.id`)
).rows;
console.log(`${athletes.length} deportistas del plantel de demo`);

let done = 0;
let skipped = 0;
for (const p of athletes) {
  const [{ n }] = (await owner.execute(sql`select count(*)::int as n from anthropometry_sessions where patient_id = ${p.id}`)).rows;
  if (n > 0) {
    skipped++;
    continue;
  }
  const r = rng(p.id);
  const pf = profile(p, r);
  const adult = !pf.youth;

  if (!p.assigned) await asAdmin(() => svc.care.assign(p.id, { membershipId: pro.membership_id, locationId: null }));

  await asPro(async () => {
    // Antropometría: pretemporada (~150 días), mitad de temporada (~75) y hace 2 semanas.
    const dates = [daysAgo(150 + Math.floor(r() * 6)), daysAgo(75 + Math.floor(r() * 6)), daysAgo(12 + Math.floor(r() * 6))];
    for (const [k, measuredAt] of dates.entries()) {
      await svc.anthro.create(p.id, saveAnthropometrySchema.parse({ measuredAt, takes: anthroTakes(pf, r, k), note: k === 0 ? "Pretemporada" : null }));
    }

    // Peso y cintura cada 2 semanas.
    for (let d = 154; d >= 0; d -= 14) {
      const t = 1 - d / 154;
      const mass = pf.mass + (pf.trend < 0 ? 1.2 - 1.5 * t : -0.7 + 1.3 * t) + between(r, -0.4, 0.4);
      const waist = BASE[pf.sex].waist * Math.sqrt(pf.mass / (pf.sex === "F" ? 60 : 78)) + between(r, -1, 1);
      await svc.metrics.record(p.id, recordMetricSchema.parse({ measuredAt: daysAgo(d), weightKg: round(mass), waistCm: round(waist) }));
    }
    if (!adult) return;

    // Prueba de sudoración en un entrenamiento de 90 min.
    const pre = round(pf.mass + between(r, -0.5, 0.5));
    await svc.sweat.create(
      p.id,
      saveSweatTestSchema.parse({
        measuredOn: daysAgo(30 + Math.floor(r() * 10)),
        sessionLabel: "Entrenamiento de campo",
        durationMin: 90,
        temperatureC: round(between(r, 22, 28)),
        humidityPct: Math.round(between(r, 50, 75)),
        preWeightKg: pre,
        postWeightKg: round(pre - between(r, 0.7, 1.9)),
        fluidIntakeMl: Math.round(between(r, 4, 11)) * 100,
        urineMl: r() < 0.5 ? 0 : 150,
      }),
    );

    // Requerimiento con semana tipo: partido el sábado, descanso el domingo.
    const training = pf.sex === "F" ? "football_training" : "football_training";
    await svc.energy.create(
      p.id,
      saveEnergySchema.parse({
        formula: "mifflin",
        activityFactor: 1.4,
        adjustmentPct: pf.trend < 0 ? -5 : 0,
        weightKg: round(pf.mass),
        heightCm: round(pf.stature),
        dayTypes: [
          { id: "train", name: "Entrenamiento", sessions: [{ activity: training, minutes: 90 }], choGPerKg: 5, proGPerKg: 1.8 },
          { id: "match", name: "Partido", sessions: [{ activity: "football_match", minutes: 90 }], choGPerKg: 7, proGPerKg: 1.8 },
          { id: "rest", name: "Descanso", sessions: [], choGPerKg: 3, proGPerKg: 1.6 },
        ],
        week: { mon: "train", tue: "train", wed: "train", thu: "train", fri: "train", sat: "match", sun: "rest" },
      }),
    );

    // Plan alimentario activo.
    await svc.plans.save(
      p.id,
      savePlanSchema.parse({
        title: "Plan temporada 2026",
        startDate: daysAgo(60),
        body: { layout: "day", day: { meals: PLAN_MEALS(pf.sex) }, generalNotes: "Hidratarse antes, durante y después de cada entrenamiento." },
        draftedFrom: "template",
        // Tiempo en el editor (eficiencia): entre 8 y 25 minutos.
        editSeconds: Math.round(between(r, 480, 1500)),
      }),
    );

    // Frecuencia de consumo.
    await svc.ffq.create(p.id, saveFoodFrequencySchema.parse({ answeredOn: daysAgo(150), answers: FFQ(r) }));
  });

  if (adult) {
    // Adherencia de los últimos 55 días: cumplidor, intermedio o flojo.
    const [plan] = (await owner.execute(sql`select id from meal_plans where patient_id = ${p.id} and status = 'active' limit 1`)).rows;
    const kind = r();
    const pDone = kind < 0.45 ? 0.85 : kind < 0.8 ? 0.62 : 0.38;
    const pLogDay = kind < 0.45 ? 0.92 : kind < 0.8 ? 0.75 : 0.45;
    const logs = [];
    const checkins = [];
    for (let d = 55; d >= 1; d--) {
      if (r() > pLogDay) continue;
      const date = daysAgo(d);
      for (const m of PLAN_MEALS(pf.sex)) {
        const x = r();
        logs.push({ date, meal: m.name, status: x < pDone ? "done" : x < pDone + (1 - pDone) / 2 ? "partial" : "skipped" });
      }
      if (r() < 0.6) checkins.push({ date, energy: 2 + Math.floor(r() * 4), mood: 2 + Math.floor(r() * 4), hunger: 1 + Math.floor(r() * 5) });
    }
    await withTenant(owner, org.id, async (tx) => {
      for (const l of logs) {
        await tx.execute(sql`insert into adherence_meal_logs (tenant_id, region, patient_id, date, meal_name, status, plan_id)
          values (${org.id}, ${org.region}::region, ${p.id}, ${l.date}, ${l.meal}, ${l.status}::adherence_status, ${plan?.id ?? null})
          on conflict do nothing`);
      }
      for (const c of checkins) {
        await tx.execute(sql`insert into adherence_checkins (tenant_id, region, patient_id, date, hunger, energy, mood)
          values (${org.id}, ${org.region}::region, ${p.id}, ${c.date}, ${c.hunger}, ${c.energy}, ${c.mood})
          on conflict do nothing`);
      }
    });

    // Reporte de septiembre publicado para Primera división.
    if (p.groups.includes("Primera división")) {
      await asPro(async () => {
        const rep = await svc.reports.create(p.id, "2026-09");
        await svc.reports.updateComment(p.id, rep.id, "Buen mes: sostuviste el plan en los días de entrenamiento. Reforcemos la hidratación el día del partido.");
        await svc.reports.publish(p.id, rep.id);
      });
    }
  }
  done++;
  if (done % 10 === 0) console.log(`  ${done} listos…`);
}
console.log(`Listo: ${done} cargados, ${skipped} ya tenían datos.`);
await appPool.end();
await ownerPool.end();
