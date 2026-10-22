"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrgKind, SlugAvailability } from "@nutreitor/shared";
import { CheckCircle2, MailCheck, User, Users } from "lucide-react";

import { Alert, Button, Input, Label, cn } from "@/components/ui";
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
      <div className="rounded-3xl border border-ink/10 bg-surface p-8 text-center shadow-sm">
        <MailCheck className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Revisá tu email</h1>
        <p className="mt-2 text-sm text-ink/65">
          Te mandamos un link a <span className="font-medium text-ink">{sentTo}</span> para
          confirmar y terminar de crear <span className="font-medium text-ink">{orgName}</span>.
          Vence en 48 horas.
        </p>
        <p className="mt-6 text-xs text-ink/50">¿No llegó? Mirá en spam o volvé a intentar en unos minutos.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Creá tu espacio en Nutreitor</h1>
        <p className="mt-2 text-ink/65">
          Tu vidriera, tus deportistas y sus planes en un solo lugar. Revisamos cada alta para
          cuidar sus datos de salud: mientras tanto ya podés configurar todo.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">¿Cómo trabajás?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map(({ kind: k, title, desc, Icon }) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-2xl border bg-surface p-4 text-left transition",
                kind === k ? "border-brand ring-2 ring-brand/20" : "border-ink/10 hover:border-ink/25",
              )}
            >
              <Icon className={cn("h-5 w-5", kind === k ? "text-brand" : "text-ink/50")} aria-hidden />
              <span className="mt-2 block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block text-xs text-ink/55">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-4 rounded-3xl border border-ink/10 bg-surface p-5 sm:p-6">
        <Label label={kind === "individual" ? "Nombre de tu consultorio o marca" : "Nombre del club, gimnasio o consultorio"}>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={kind === "individual" ? "Lic. Ana Pérez · Nutrición deportiva" : "Club Atlético Norte"}
            required
            maxLength={120}
          />
        </Label>
        <div>
          <Label label="Tu dirección en Nutreitor" hint="Es la URL de tu vidriera. Después no se puede cambiar.">
            <div className="flex items-center rounded-lg border border-stone-200 bg-surface pr-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                aria-describedby="slug-status"
                required
              />
              <span className="shrink-0 text-sm text-stone-400">.{rootHost}</span>
            </div>
          </Label>
          <p id="slug-status" className="mt-1 min-h-[1rem] text-xs" aria-live="polite">
            {availability?.slug === slug &&
              (availability.available ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Disponible
                </span>
              ) : (
                <span className="text-red-700">{availability.reason}</span>
              ))}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-ink/10 bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Label label="Tu nombre y apellido">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </Label>
          <Label label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Label>
        </div>

        {kind === "team" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={attends} onChange={(e) => setAttends(e.target.checked)} className="mt-0.5 accent-[rgb(var(--brand-rgb))]" />
            <span>También atiendo pacientes</span>
          </label>
        )}

        {needsLicense && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Label label="Matrícula" hint="La revisamos antes de publicar tu perfil.">
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="MN 1234" required maxLength={40} />
            </Label>
            <Label label="Jurisdicción">
              <Input value={licenseJurisdiction} onChange={(e) => setLicenseJurisdiction(e.target.value)} placeholder="Nacional, CABA, Córdoba…" required maxLength={80} />
            </Label>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-ink/75">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
        <span>
          Acepto los términos y la política de privacidad, y me comprometo a tratar los datos
          de mis deportistas y pacientes con el consentimiento que corresponde.
        </span>
      </label>

      {err && <Alert>{err}</Alert>}

      <Button type="submit" disabled={!canSubmit || busy} className="w-full sm:w-auto">
        {busy ? "Enviando…" : "Crear mi espacio"}
      </Button>
    </form>
  );
}
