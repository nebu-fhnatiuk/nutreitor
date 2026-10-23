"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrgKind, SlugAvailability } from "@nutreitor/shared";
import { User, Users } from "lucide-react";

import { AuthButton, AuthField, AuthHeading, AuthNotice } from "@/components/auth/auth-shell";
import { cn, ZoneMark } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/** Sugerencia de dirección a partir del nombre: kebab-case sin acentos. */
function toSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const KINDS: { kind: OrgKind; title: string; desc: string; Icon: typeof User }[] = [
  {
    kind: "individual",
    title: "Trabajo solo/a",
    desc: "Nutricionista deportivo independiente: tu consultorio, tus deportistas.",
    Icon: User,
  },
  {
    kind: "team",
    title: "Tenemos un equipo",
    desc: "Club, gimnasio o consultorio con varios nutricionistas.",
    Icon: Users,
  },
];

/**
 * Alta autoservicio (ADR 0025). Paso 1 de 2: los datos quedan en una solicitud y
 * mandamos un link para confirmar el email. Nada se crea hasta confirmar.
 */
export function SignupForm({ rootHost }: { rootHost: string }) {
  const [kind, setKind] = useState<OrgKind>("individual");
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [attends, setAttends] = useState(true);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseJurisdiction, setLicenseJurisdiction] = useState("");
  const [terms, setTerms] = useState(false);
  const [availability, setAvailability] = useState<SlugAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Mientras no la toque, la dirección sigue al nombre.
  useEffect(() => {
    if (!slugTouched) setSlug(toSlug(orgName));
  }, [orgName, slugTouched]);

  // Disponibilidad con debounce.
  useEffect(() => {
    if (slug.length < 3) {
      setAvailability(null);
      return;
    }
    const t = setTimeout(() => {
      api<SlugAvailability>(`signup/slug?slug=${encodeURIComponent(slug)}`)
        .then(setAvailability)
        .catch(() => setAvailability(null));
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  const needsLicense = kind === "individual" || attends;
  const slugOk = availability?.slug === slug && availability.available;
  const canSubmit = useMemo(
    () =>
      !!orgName.trim() &&
      slugOk &&
      !!fullName.trim() &&
      !!email.trim() &&
      (!needsLicense || (!!licenseNumber.trim() && !!licenseJurisdiction.trim())) &&
      terms,
    [orgName, slugOk, fullName, email, needsLicense, licenseNumber, licenseJurisdiction, terms],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          orgName,
          slug,
          fullName,
          email,
          ...(needsLicense ? { licenseNumber, licenseJurisdiction } : {}),
          acceptTerms: terms,
        }),
      });
      setSentTo(email.trim().toLowerCase());
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status">
        <span aria-hidden className="mb-5 ml-1 block h-5 w-5 rotate-45 rounded-[2px] bg-zone-ok" />
        <AuthHeading title="Revisá tu email">
          Te mandamos un link a <strong className="font-semibold text-stone-900">{sentTo}</strong> para confirmar y terminar
          de crear <strong className="font-semibold text-stone-900">{orgName}</strong>. Vence en 48 horas.
        </AuthHeading>
        <p className="mt-3 text-[15px] text-stone-500">¿No llegó? Mirá en spam o volvé a intentar en unos minutos.</p>
      </div>
    );
  }

  const checkbox = "mt-0.5 h-[22px] w-[22px] shrink-0 accent-[rgb(var(--brand-rgb))]";

  return (
    <form onSubmit={submit} className="space-y-5">
      <AuthHeading kicker="Nutrición deportiva" title="Creá tu espacio">
        Tu vidriera, tus deportistas y sus planes en un solo lugar. Revisamos cada alta para cuidar sus datos de salud:
        mientras tanto ya podés configurar todo.
      </AuthHeading>

      <fieldset className="pt-2">
        <legend className="mb-2 text-sm text-stone-500">¿Cómo trabajás?</legend>
        <div className="space-y-2.5">
          {KINDS.map(({ kind: k, title, desc, Icon }) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                kind === k ? "border-brand bg-brand/15" : "border-stone-200 bg-surface hover:border-stone-300",
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", kind === k ? "text-brand" : "text-stone-500")} aria-hidden />
              <span>
                <span className="block font-display text-lg font-bold uppercase tracking-[0.04em] text-stone-900">{title}</span>
                <span className="block text-sm text-stone-600">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <AuthField
        label={kind === "individual" ? "Nombre de tu consultorio o marca" : "Nombre del club, gimnasio o consultorio"}
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        placeholder={kind === "individual" ? "Lic. Ana Pérez · Nutrición deportiva" : "Club Atlético Norte"}
        required
        maxLength={120}
      />

      <div>
        <label htmlFor="signup-slug" className="mb-1.5 block text-sm text-stone-500">Tu dirección en Nutreitor</label>
        <div className="flex h-[52px] items-center rounded-xl border border-stone-200 bg-surface pr-4 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
          <input
            id="signup-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-base text-stone-900 outline-none"
            aria-describedby="slug-status slug-hint"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <span className="shrink-0 text-[15px] text-stone-500">.{rootHost}</span>
        </div>
        <p id="slug-status" className="mt-1.5 min-h-5 text-sm" aria-live="polite">
          {availability?.slug === slug &&
            (availability.available ? (
              <span className="inline-flex items-center gap-2 text-stone-900">
                <ZoneMark zone="ok" /> Disponible
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-stone-900">
                <ZoneMark zone="bad" /> {availability.reason}
              </span>
            ))}
        </p>
        <p id="slug-hint" className="text-sm text-stone-500">Es la URL de tu vidriera. Después no se puede cambiar.</p>
      </div>

      <AuthField label="Tu nombre y apellido" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
      <AuthField
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="vos@club.com"
      />

      {kind === "team" && (
        <label className="flex items-start gap-3 text-[15px] text-stone-800">
          <input type="checkbox" checked={attends} onChange={(e) => setAttends(e.target.checked)} className={checkbox} />
          <span>También atiendo pacientes</span>
        </label>
      )}
      {needsLicense && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <AuthField label="Matrícula" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="MN 1234" required maxLength={40} />
            <AuthField
              label="Jurisdicción"
              value={licenseJurisdiction}
              onChange={(e) => setLicenseJurisdiction(e.target.value)}
              placeholder="Córdoba"
              required
              maxLength={80}
            />
          </div>
          <p className="mt-1.5 text-sm text-stone-500">La matrícula la revisamos antes de publicar tu perfil.</p>
        </div>
      )}

      <label className="flex items-start gap-3 text-[15px] leading-snug text-stone-700">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className={checkbox} />
        <span>
          Acepto los términos y la política de privacidad, y me comprometo a tratar los datos de mis deportistas y pacientes
          con el consentimiento que corresponde.
        </span>
      </label>

      {err && <AuthNotice zone="bad" title={err} />}

      <AuthButton type="submit" disabled={!canSubmit || busy}>
        {busy ? "Enviando…" : "Crear mi espacio"}
      </AuthButton>
      <p className="text-center text-[15px] text-stone-600">
        ¿Ya tenés un espacio? Entrá desde la dirección de tu club.
      </p>
    </form>
  );
}
