/**
 * Identificadores de las reglas de alerta del plan (KAN-97). Viven aparte del motor
 * para que el schema de guardado del plan (meal-plan.dto) los use sin importar el
 * motor, que a su vez depende de meal-plan.dto.
 */
export const planAlertRules = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;
export type PlanAlertRule = (typeof planAlertRules)[number];
export type PlanAlertLevel = "important" | "info";

/** Qué hizo el profesional con una alerta que quedó en el plan guardado. */
export const planAlertDecisions = ["kept", "unreviewed"] as const;
export type PlanAlertDecision = (typeof planAlertDecisions)[number];
