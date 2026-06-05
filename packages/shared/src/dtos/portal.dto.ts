import type { MealPlanDto } from "./meal-plan.dto.js";
import type { PatientMetricDto } from "./metric.dto.js";
import type { PatientClinical } from "./patient.dto.js";

/**
 * Portal del paciente: lo que ve de SU propia ficha. NUNCA incluye las notas
 * clínicas del profesional (internas). El backend resuelve "mi paciente" por el
 * userId de la sesión (además de RLS de tenant).
 */
export interface PortalProfile {
  fullName: string;
  goal: string | null;
  email: string | null;
  phone: string | null;
  /** Datos de salud propios (antecedentes/alergias/medicación). */
  clinical: PatientClinical | null;
}

export interface PortalMeDto {
  profile: PortalProfile;
  /** Nombres de los profesionales con asignación activa. */
  professionals: string[];
  /** Plan alimentario activo (o null). */
  plan: MealPlanDto | null;
  /** Serie de mediciones (ascendente). */
  metrics: PatientMetricDto[];
  /** La sesión puede auto-reportar mediciones. */
  canSelfReport: boolean;
  /** Módulos ACTIVOS de la org (ej. "agents"); la UI del portal gatea features. */
  modules: string[];
  /** El paciente tiene un profesional asignado activo (habilita PSICO supervisado). */
  hasAssignedProfessional: boolean;
}
