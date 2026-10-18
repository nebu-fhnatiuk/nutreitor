import type {
  ProfileVisibilityField,
  PublicProfessional,
  PublicRosterEntry,
} from "@nutreitor/shared";
import { formatLicense } from "@nutreitor/shared";

/** Forma mínima de fila de perfil que consumen los serializers (testeable sin DB). */
export interface ProfileLike {
  profileSlug: string;
  isPubliclyListed: boolean;
  specialty: string | null;
  headline: string | null;
  bio: string | null;
  photoUrl: string | null;
  credentials: string | null;
  specialties: string[];
  services: { name: string; description?: string }[];
  visibility: Record<string, boolean>;
  /** Matrícula: sólo llegan acá perfiles con matrícula revisada (filtro en SQL). */
  licenseNumber?: string | null;
  licenseJurisdiction?: string | null;
}

/** ¿El campo está marcado público? */
function isVisible(p: ProfileLike, field: ProfileVisibilityField): boolean {
  return p.visibility?.[field] === true;
}

function nonEmpty(v: string | null): boolean {
  return !!v && v.trim().length > 0;
}

/**
 * Contenido público mínimo que justifica una card en el roster: al menos headline
 * o bio marcados públicos y no vacíos. Evita cards de perfiles pelados (Ajuste 1).
 */
export function hasPublicRosterContent(p: ProfileLike): boolean {
  return (
    (isVisible(p, "headline") && nonEmpty(p.headline)) ||
    (isVisible(p, "bio") && nonEmpty(p.bio))
  );
}

/** Entrada de roster, o null si NO debe aparecer (no listado o sin contenido). */
export function toRosterEntry(
  p: ProfileLike,
  fullName: string,
): PublicRosterEntry | null {
  if (!p.isPubliclyListed) return null;
  if (!hasPublicRosterContent(p)) return null;
  return {
    profileSlug: p.profileSlug,
    fullName,
    headline: isVisible(p, "headline") ? p.headline : null,
    photoUrl: isVisible(p, "photoUrl") ? p.photoUrl : null,
    // `specialty` es metadato de roster curado por el admin (agrupación), público.
    specialty: p.specialty,
  };
}

/** Perfil público: SÓLO los campos marcados visibles (default privado). */
export function toPublicProfessional(
  p: ProfileLike,
  fullName: string,
): PublicProfessional {
  return {
    profileSlug: p.profileSlug,
    fullName,
    headline: isVisible(p, "headline") ? p.headline : null,
    bio: isVisible(p, "bio") ? p.bio : null,
    photoUrl: isVisible(p, "photoUrl") ? p.photoUrl : null,
    credentials: isVisible(p, "credentials") ? p.credentials : null,
    specialties: isVisible(p, "specialties") ? (p.specialties ?? []) : [],
    services: isVisible(p, "services") ? (p.services ?? []) : [],
    // La matrícula revisada es la señal de confianza: se muestra siempre.
    license: formatLicense(p.licenseNumber ?? null, p.licenseJurisdiction ?? null),
  };
}
