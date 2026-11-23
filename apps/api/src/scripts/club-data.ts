/**
 * Datos del club de ejemplo "Club Atlético Norte Alto" (seed-club.ts). Todo es
 * inventado: el club, las personas, las matrículas y los documentos. Los números se
 * generan con una semilla fija, así cada corrida arma el mismo club.
 */
import type { ActivityKey, AllergyFlag } from "@nutreitor/shared";

export const CLUB = {
  name: "Club Atlético Norte Alto",
  displayName: "Norte Alto",
  slug: "norte-alto",
  region: "us-east-1" as const,
  primary: "#0E5E6F",
  secondary: "#E0A526",
  headline: "Nutrición deportiva en todas las disciplinas del club",
  description:
    "El área de nutrición de Norte Alto acompaña a los planteles de fútbol, hockey y básquet: antropometría ISAK cada temporada, planes según la carga de cada día, pruebas de sudoración y seguimiento en el portal del deportista.",
  emailDomain: "nortealto.test",
  locations: ["Complejo Deportivo", "Sede Social"] as const,
};

export interface StaffSeed {
  key: "admin" | "futbol" | "hockey" | "basquet";
  fullName: string;
  email: string;
  role: "admin" | "professional";
  profileSlug: string;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  license: string | null;
}

/** Cuerpo técnico de cada plantel (KAN-109): rol `coach`, sin perfil público. */
export const COACHES: { sport: SquadSeed["sport"]; fullName: string; email: string }[] = [
  { sport: "futbol", fullName: "Diego Arce", email: "diego.arce" },
  { sport: "hockey", fullName: "Laura Méndez", email: "laura.mendez" },
  { sport: "basquet", fullName: "Pablo Sosa", email: "pablo.sosa" },
];

export const STAFF: StaffSeed[] = [
  {
    key: "admin",
    fullName: "Mariana Quiroga",
    email: "mariana.quiroga",
    role: "admin",
    profileSlug: "mariana-quiroga",
    headline: "Coordinación del área de nutrición",
    bio: "Coordino el área de nutrición del club y la articulación con el cuerpo médico y la preparación física de cada disciplina.",
    specialties: ["Nutrición deportiva", "Gestión de equipos de salud"],
    license: "MN 41.208",
  },
  {
    key: "futbol",
    fullName: "Julián Ferreyra",
    email: "julian.ferreyra",
    role: "professional",
    profileSlug: "julian-ferreyra",
    headline: "Nutrición en fútbol de alto rendimiento",
    bio: "Trabajo con el plantel de primera de fútbol: periodización de hidratos según la semana de partido, recuperación y composición corporal.",
    specialties: ["Nutrición deportiva", "Fútbol", "Antropometría ISAK 2"],
    license: "MN 38.715",
  },
  {
    key: "hockey",
    fullName: "Sofía Benítez",
    email: "sofia.benitez",
    role: "professional",
    profileSlug: "sofia-benitez",
    headline: "Nutrición deportiva y salud de la mujer deportista",
    bio: "Acompaño al plantel de hockey femenino con foco en disponibilidad energética, salud ósea y rendimiento.",
    specialties: ["Nutrición deportiva", "Hockey", "Salud de la mujer deportista"],
    license: "MN 44.392",
  },
  {
    key: "basquet",
    fullName: "Tomás Aguirre",
    email: "tomas.aguirre",
    role: "professional",
    profileSlug: "tomas-aguirre",
    headline: "Nutrición para deportes de equipo",
    bio: "Planteles de básquet: fuerza, potencia y la logística de comer bien con doble turno y viajes.",
    specialties: ["Nutrición deportiva", "Básquet", "Suplementación"],
    license: "MN 46.051",
  },
];

export type SportKey = "futbol" | "hockey" | "basquet";

export interface DayTypeSeed {
  id: string;
  name: string;
  sessions: { activity: ActivityKey; minutes: number }[];
  choGPerKg: number;
  proGPerKg: number;
  /** Menú que se usa para ese tipo de día. */
  menu: MenuKey;
}

export type MenuKey = "partido" | "entreno" | "suave";

export interface SquadSeed {
  sport: SportKey;
  group: string;
  description: string;
  sex: "male" | "female";
  count: number;
  positions: string[];
  ageRange: [number, number];
  heightCm: [number, number];
  /** IMC aproximado, para derivar la masa de la talla. */
  bmi: [number, number];
  location: (typeof CLUB.locations)[number];
  dayTypes: DayTypeSeed[];
  week: Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>;
  sweat: { label: string; on: string; durationMin: number; temperatureC: number; humidityPct: number }[];
}

export const SQUADS: SquadSeed[] = [
  {
    sport: "futbol",
    group: "Fútbol · Primera",
    description: "Plantel profesional de fútbol masculino. Partido los domingos.",
    sex: "male",
    count: 20,
    positions: ["Arquero", "Arquero", "Defensor central", "Defensor central", "Defensor central", "Lateral", "Lateral", "Lateral", "Mediocampista central", "Mediocampista central", "Mediocampista central", "Volante", "Volante", "Volante", "Enganche", "Extremo", "Extremo", "Delantero centro", "Delantero centro", "Delantero"],
    ageRange: [19, 32],
    heightCm: [168, 191],
    bmi: [22, 24.5],
    location: "Complejo Deportivo",
    dayTypes: [
      { id: "partido", name: "Partido", sessions: [{ activity: "football_match", minutes: 95 }], choGPerKg: 9, proGPerKg: 1.8, menu: "partido" },
      { id: "entreno", name: "Entrenamiento", sessions: [{ activity: "football_training", minutes: 90 }, { activity: "strength_moderate", minutes: 40 }], choGPerKg: 8, proGPerKg: 1.8, menu: "entreno" },
      { id: "activacion", name: "Activación", sessions: [{ activity: "football_training", minutes: 70 }], choGPerKg: 7, proGPerKg: 1.7, menu: "entreno" },
      { id: "descanso", name: "Descanso activo", sessions: [{ activity: "yoga", minutes: 30 }], choGPerKg: 6, proGPerKg: 1.8, menu: "suave" },
    ],
    week: { mon: "descanso", tue: "entreno", wed: "entreno", thu: "entreno", fri: "entreno", sat: "activacion", sun: "partido" },
    sweat: [
      { label: "Pretemporada, turno tarde", on: "2026-02-10", durationMin: 90, temperatureC: 32, humidityPct: 60 },
      { label: "Entrenamiento de campo", on: "2026-10-14", durationMin: 80, temperatureC: 25, humidityPct: 70 },
    ],
  },
  {
    sport: "hockey",
    group: "Hockey · Primera femenina",
    description: "Plantel de primera de hockey sobre césped. Partido los sábados.",
    sex: "female",
    count: 18,
    positions: ["Arquera", "Arquera", "Defensora", "Defensora", "Defensora", "Defensora", "Defensora", "Volante", "Volante", "Volante", "Volante", "Volante", "Volante", "Delantera", "Delantera", "Delantera", "Delantera", "Delantera"],
    ageRange: [18, 31],
    heightCm: [156, 176],
    bmi: [20.5, 23],
    location: "Complejo Deportivo",
    dayTypes: [
      { id: "partido", name: "Partido", sessions: [{ activity: "hockey_field", minutes: 75 }], choGPerKg: 7, proGPerKg: 1.7, menu: "partido" },
      { id: "entreno", name: "Entrenamiento", sessions: [{ activity: "hockey_field", minutes: 100 }, { activity: "strength_moderate", minutes: 45 }], choGPerKg: 7.5, proGPerKg: 1.7, menu: "entreno" },
      { id: "descanso", name: "Descanso activo", sessions: [{ activity: "yoga", minutes: 30 }], choGPerKg: 5.6, proGPerKg: 1.8, menu: "suave" },
    ],
    week: { mon: "entreno", tue: "entreno", wed: "descanso", thu: "entreno", fri: "entreno", sat: "partido", sun: "descanso" },
    sweat: [
      { label: "Pretemporada, sintético", on: "2026-02-12", durationMin: 100, temperatureC: 31, humidityPct: 55 },
      { label: "Entrenamiento de campo", on: "2026-10-16", durationMin: 90, temperatureC: 24, humidityPct: 65 },
    ],
  },
  {
    sport: "basquet",
    group: "Básquet · Primera",
    description: "Plantel de primera de básquet masculino. Doble turno martes y jueves.",
    sex: "male",
    count: 14,
    positions: ["Base", "Base", "Base", "Escolta", "Escolta", "Escolta", "Alero", "Alero", "Alero", "Ala pívot", "Ala pívot", "Ala pívot", "Pívot", "Pívot"],
    ageRange: [20, 33],
    heightCm: [182, 206],
    bmi: [23, 25.5],
    location: "Sede Social",
    dayTypes: [
      { id: "partido", name: "Partido", sessions: [{ activity: "basketball_match", minutes: 75 }], choGPerKg: 7.5, proGPerKg: 1.8, menu: "partido" },
      { id: "doble", name: "Doble turno", sessions: [{ activity: "basketball_training", minutes: 100 }, { activity: "strength_vigorous", minutes: 50 }], choGPerKg: 8, proGPerKg: 1.8, menu: "entreno" },
      { id: "entreno", name: "Entrenamiento", sessions: [{ activity: "basketball_training", minutes: 100 }], choGPerKg: 7.5, proGPerKg: 1.8, menu: "entreno" },
      { id: "descanso", name: "Descanso activo", sessions: [{ activity: "yoga", minutes: 30 }], choGPerKg: 6, proGPerKg: 1.8, menu: "suave" },
    ],
    week: { mon: "entreno", tue: "doble", wed: "entreno", thu: "doble", fri: "entreno", sat: "partido", sun: "descanso" },
    sweat: [
      { label: "Pretemporada, estadio cubierto", on: "2026-02-18", durationMin: 100, temperatureC: 27, humidityPct: 60 },
      { label: "Entrenamiento", on: "2026-10-20", durationMin: 95, temperatureC: 23, humidityPct: 55 },
    ],
  },
];

export const FIRST_NAMES = {
  male: ["Agustín", "Bautista", "Benjamín", "Bruno", "Facundo", "Federico", "Felipe", "Franco", "Gastón", "Gonzalo", "Ignacio", "Joaquín", "Juan Cruz", "Lautaro", "Leandro", "Lisandro", "Lucas", "Luciano", "Manuel", "Martín", "Mateo", "Matías", "Maximiliano", "Nahuel", "Nicolás", "Ramiro", "Santiago", "Thiago", "Tobías", "Valentín", "Emiliano", "Rodrigo", "Damián", "Ezequiel", "Germán"],
  female: ["Abril", "Agustina", "Antonella", "Camila", "Candela", "Carolina", "Catalina", "Delfina", "Florencia", "Guadalupe", "Josefina", "Julieta", "Lucía", "Luz", "Malena", "Martina", "Micaela", "Milagros", "Paula", "Pilar", "Rocío", "Sofía", "Valentina", "Victoria", "Zoe", "Ailén", "Belén", "Constanza"],
};

export const LAST_NAMES = ["Acosta", "Aguilar", "Álvarez", "Arias", "Benítez", "Cabrera", "Castro", "Córdoba", "Domínguez", "Escobar", "Figueroa", "Funes", "Galván", "Giménez", "Godoy", "Herrera", "Ibarra", "Juárez", "Ledesma", "Lucero", "Maidana", "Medina", "Molina", "Montenegro", "Navarro", "Ojeda", "Olivera", "Paz", "Peralta", "Ponce", "Quiroga", "Ríos", "Robledo", "Rojas", "Sosa", "Suárez", "Toledo", "Valdez", "Vera", "Villalba", "Zalazar", "Correa", "Bustos", "Ferrari", "Lombardi", "Bianchi", "Ruggeri", "Sartori"];

/** Condiciones clínicas repartidas en el club, para que la ficha y las alertas tengan casos reales. */
export interface ClinicalCase {
  sport: SportKey;
  /** Posición dentro del plantel (índice del deportista). */
  index: number;
  allergyFlags?: AllergyFlag[];
  allergies?: string;
  currentMedication?: string;
  diagnosedConditions?: string;
  note?: string;
}

export const CLINICAL_CASES: ClinicalCase[] = [
  { sport: "futbol", index: 4, allergyFlags: ["celiaquia"], allergies: "Celiaquía diagnosticada en 2019 (biopsia). Buena adherencia a la dieta sin TACC.", diagnosedConditions: "Enfermedad celíaca." },
  { sport: "futbol", index: 11, allergyFlags: ["intolerancia_lactosa"], allergies: "Intolerancia a la lactosa: tolera yogur y quesos duros en poca cantidad." },
  { sport: "futbol", index: 16, allergyFlags: ["mani"], allergies: "Alergia al maní (anafilaxia en la infancia). Lleva autoinyector de adrenalina." },
  { sport: "hockey", index: 3, currentMedication: "Levotiroxina 75 µg en ayunas, 7:00.", diagnosedConditions: "Hipotiroidismo (tiroiditis de Hashimoto), compensado." },
  { sport: "hockey", index: 7, currentMedication: "Anticonceptivo oral combinado.", note: "Ciclos irregulares antes de empezar el anticonceptivo: seguir disponibilidad energética." },
  { sport: "hockey", index: 12, allergyFlags: ["intolerancia_lactosa"], allergies: "Intolerancia a la lactosa." },
  { sport: "hockey", index: 15, allergyFlags: ["frutos_secos"], allergies: "Alergia a la nuez y la almendra." },
  { sport: "basquet", index: 2, currentMedication: "Ninguna. Suplementa creatina 5 g/día (indicada por el club).", note: "Creatina desde la pretemporada." },
  { sport: "basquet", index: 9, allergyFlags: ["celiaquia"], allergies: "Celiaquía.", diagnosedConditions: "Enfermedad celíaca." },
];

/** Perfil de seguimiento: cómo vienen la adherencia y la composición corporal. */
export type Trajectory = "steady" | "improving" | "dropping" | "rising_fat" | "stale";
