import { z } from "zod";

/**
 * Módulos/complementos instalables por organización (entitlements a nivel tenant).
 * Apagados por default; el admin los instala aceptando términos + plan. El gateway
 * exige el módulo ACTIVO además de la capability del rol. Ver ADR 0016.
 */

export const moduleKeys = ["agents"] as const;
export type ModuleKey = (typeof moduleKeys)[number];

export interface ModulePlan {
  id: string;
  name: string;
  /** Texto informativo de precio (no hay pasarela de cobro todavía). */
  priceText: string;
  blurb: string;
}

export interface ModuleCatalogEntry {
  key: ModuleKey;
  name: string;
  blurb: string;
  /** Versión vigente del contrato/términos que el admin acepta al instalar. */
  termsVersion: string;
  termsSummary: string[];
  plans: ModulePlan[];
}

/** Catálogo estático de complementos disponibles. */
export const MODULE_CATALOG: Record<ModuleKey, ModuleCatalogEntry> = {
  agents: {
    key: "agents",
    name: "Asistentes de IA",
    blurb:
      "NUTRI para el equipo profesional, y CHEF + PSICO para tus pacientes en el portal.",
    termsVersion: "2026-06-05",
    termsSummary: [
      "Se procesan datos clínicos para generar respuestas; PSICO incluye un guardrail de crisis.",
      "Hasta firmar el acuerdo con el proveedor de IA, los asistentes corren en modo de prueba (sin IA real).",
      "El uso se mide por organización; aplican límites de uso para controlar el costo.",
    ],
    plans: [
      {
        id: "standard",
        name: "Standard",
        priceText: "A convenir",
        blurb: "Asistentes habilitados para toda la organización, con límites de uso por tenant.",
      },
    ],
  },
};

/** Estado de un módulo para una org (catálogo + si está instalado). */
export interface OrgModuleStateDto {
  key: ModuleKey;
  name: string;
  blurb: string;
  status: "active" | "inactive";
  plan: string | null;
  termsVersion: string | null;
  installedAt: string | null;
  /** Versión de términos vigente en el catálogo (para re-consentir si cambió). */
  currentTermsVersion: string;
}

/** Instalar un módulo: el admin elige plan y acepta los términos vigentes. */
export const installModuleSchema = z.object({
  plan: z.string().min(1),
  acceptTerms: z.literal(true),
});
export type InstallModuleDto = z.infer<typeof installModuleSchema>;
