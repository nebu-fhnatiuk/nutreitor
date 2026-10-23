import type { MembershipRole } from "./auth.dto.js";

/**
 * Registro de lecturas de datos de salud (KAN-23, ADR 0042): quién del staff vio
 * qué dato de qué deportista. Misma lista que el CHECK de la migración 0049.
 */
export const accessResources = [
  "patient",
  "patient_notes",
  "assignments",
  "metrics",
  "anthropometry",
  "plan",
  "recalls",
  "food_frequency",
  "sweat_tests",
  "energy",
  "adherence",
  "reports",
  "report",
  "conversation",
  "group_board",
] as const;
export type AccessResource = (typeof accessResources)[number];

export const ACCESS_RESOURCE_LABEL: Record<AccessResource, string> = {
  patient: "Ficha",
  patient_notes: "Notas",
  assignments: "Profesionales asignados",
  metrics: "Mediciones",
  anthropometry: "Antropometría",
  plan: "Plan alimentario",
  recalls: "Recordatorios de 24 h",
  food_frequency: "Frecuencia de consumo",
  sweat_tests: "Pruebas de sudoración",
  energy: "Requerimiento energético",
  adherence: "Adherencia",
  reports: "Lista de informes",
  report: "Informe",
  conversation: "Mensajes",
  group_board: "Pizarra del plantel",
};

/** Ventana de deduplicación: una fila por persona, recurso y objeto cada 15 min. */
export const ACCESS_LOG_WINDOW_MIN = 15;

export interface AccessLogEntry {
  id: string;
  actorUserId: string | null;
  /** Nombre de quien leyó; null si la cuenta ya no existe. */
  actorName: string | null;
  actorRole: MembershipRole;
  resource: AccessResource;
  patientId: string | null;
  targetId: string | null;
  createdAt: string;
}
