import { z } from "zod";

import { regionSchema, type Region } from "../region.js";
import { orgKinds, type OrgKind, type OrgStatus } from "./auth.dto.js";
import type { LicenseStatus } from "./public-profile.dto.js";

/**
 * Subdominios que no puede tomar una org: son del producto o se prestan a
 * suplantación (ADR 0025).
 */
export const reservedSlugs = [
  "www", "api", "app", "admin", "plataforma", "platform", "registro", "signup",
  "login", "auth", "mail", "email", "soporte", "support", "ayuda", "help", "blog",
  "docs", "status", "static", "assets", "cdn", "nutreitor", "demo", "test",
] as const;

export const orgSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Mínimo 3 caracteres.")
  .max(40, "Máximo 40 caracteres.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Sólo minúsculas, números y guiones (sin acentos).")
  .refine((s) => !(reservedSlugs as readonly string[]).includes(s), "Esa dirección está reservada.");

// ── Alta autoservicio (dominio raíz, sin sesión) ──────────────────────────────

/**
 * Paso 1: datos de la org y de quien la administra. La matrícula es obligatoria
 * para un independiente (atiende sí o sí) y opcional en un equipo (la admin puede
 * no atender).
 */
export const orgSignupSchema = z
  .object({
    kind: z.enum(orgKinds),
    orgName: z.string().trim().min(2).max(120),
    slug: orgSlugSchema,
    region: regionSchema.default("us-east-1"),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    licenseNumber: z.string().trim().min(2).max(40).optional(),
    licenseJurisdiction: z.string().trim().min(2).max(80).optional(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Tenés que aceptar los términos." }),
    }),
  })
  .refine((d) => d.kind !== "individual" || !!d.licenseNumber, {
    path: ["licenseNumber"],
    message: "Como profesional independiente, la matrícula es obligatoria.",
  })
  .refine((d) => !d.licenseNumber || !!d.licenseJurisdiction, {
    path: ["licenseJurisdiction"],
    message: "Indicá la jurisdicción de la matrícula.",
  });
export type OrgSignupDto = z.infer<typeof orgSignupSchema>;

/** Respuesta del paso 1: siempre la misma (no revela si el email ya tiene cuenta). */
export interface OrgSignupStarted {
  ok: true;
}

/** ¿El slug está libre? (la dirección es pública, no es un oráculo sensible). */
export interface SlugAvailability {
  slug: string;
  available: boolean;
  reason?: string;
}

/** Preview del link de verificación. */
export interface OrgSignupPreview {
  email: string;
  fullName: string;
  orgName: string;
  slug: string;
  kind: OrgKind;
  /** false si el email ya tiene cuenta: se reusa (no se pide contraseña). */
  needsAccount: boolean;
}

/** Paso 2: confirmar (el link ya probó el email). Contraseña sólo si no hay cuenta. */
export const confirmOrgSignupSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Mínimo 8 caracteres.").max(200).optional(),
});
export type ConfirmOrgSignupDto = z.infer<typeof confirmOrgSignupSchema>;

export interface OrgSignupCompleted {
  slug: string;
  /** Login del workspace nuevo (`https://{slug}.nutreitor.com/login?email=…`). */
  loginUrl: string;
}

// ── Consola de plataforma ─────────────────────────────────────────────────────

export const platformLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type PlatformLoginDto = z.infer<typeof platformLoginSchema>;

export interface PlatformMe {
  id: string;
  email: string;
  fullName: string;
}

/** Fila de la consola: una org y lo que hace falta para decidir. */
export interface PlatformOrgEntry {
  id: string;
  name: string;
  slug: string;
  region: Region;
  kind: OrgKind;
  status: OrgStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  admins: { fullName: string; email: string }[];
  /** Profesionales (y admins con perfil) con su matrícula declarada. */
  licenses: PlatformLicenseEntry[];
}

export interface PlatformLicenseEntry {
  profileId: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  /** Para invalidar la vidriera del perfil tras la decisión. */
  profileSlug: string;
  fullName: string;
  email: string;
  licenseNumber: string | null;
  licenseJurisdiction: string | null;
  licenseStatus: LicenseStatus;
  licenseNote: string | null;
}

export const orgDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "suspend", "reactivate"]),
  /** Obligatorio al rechazar o suspender: lo lee la admin de la org. */
  note: z.string().trim().max(1000).optional(),
}).refine((d) => !["reject", "suspend"].includes(d.decision) || !!d.note, {
  path: ["note"],
  message: "Contale el motivo a la organización.",
});
export type OrgDecisionDto = z.infer<typeof orgDecisionSchema>;

export const licenseDecisionSchema = z.object({
  decision: z.enum(["reviewed", "rejected"]),
  note: z.string().trim().max(1000).optional(),
}).refine((d) => d.decision !== "rejected" || !!d.note, {
  path: ["note"],
  message: "Contale el motivo al profesional.",
});
export type LicenseDecisionDto = z.infer<typeof licenseDecisionSchema>;

// ── Primeros pasos del workspace (admin) ──────────────────────────────────────

/** Checklist derivada de datos reales (nada se marca a mano). */
export interface OnboardingStatus {
  status: OrgStatus;
  kind: OrgKind;
  reviewNote: string | null;
  steps: {
    profile: boolean;
    license: LicenseStatus;
    branding: boolean;
    availability: boolean;
    team: boolean;
  };
}

/** Cambio de tipo de cuenta (admin): independiente ⇄ equipo (ADR 0026). */
export const changeOrgKindSchema = z.object({ kind: z.enum(orgKinds) });
export type ChangeOrgKindDto = z.infer<typeof changeOrgKindSchema>;
