"use client";

import { useState } from "react";
import type {
  OwnProfessionalProfile,
  ProfileVisibility,
  ProfileVisibilityField,
  PublicService,
} from "@nutreitor/shared";

import { Alert, Button, Input, Textarea } from "@/components/ui";

/**
 * Editor del perfil público propio del profesional. Cada campo de contenido lleva
 * su toggle de visibilidad (default privado): el profesional decide qué se publica.
 * La presencia en el roster y el orden los cura el admin (acá sólo se informa).
 */
export function ProfileEditor({ initial }: { initial: OwnProfessionalProfile }) {
  const [slug, setSlug] = useState(initial.profileSlug);
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl ?? "");
  const [credentials, setCredentials] = useState(initial.credentials ?? "");
  const [specialties, setSpecialties] = useState(
    (initial.specialties ?? []).join(", "),
  );
  const [services, setServices] = useState<PublicService[]>(
    initial.services ?? [],
  );
  const [vis, setVis] = useState<ProfileVisibility>(initial.visibility ?? {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function toggle(field: ProfileVisibilityField) {
    setVis((v) => ({ ...v, [field]: !v[field] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const specialtiesArr = specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const servicesArr = services
        .map((s) => ({
          name: s.name.trim(),
          description: s.description?.trim() || undefined,
        }))
        .filter((s) => s.name.length > 0);

      const r = await fetch("/api/editor/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-prev-profile-slug": initial.profileSlug,
        },
        body: JSON.stringify({
          profileSlug: slug.trim(),
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          photoUrl: photoUrl.trim() || null,
          credentials: credentials.trim() || null,
          specialties: specialtiesArr,
          services: servicesArr,
          visibility: vis,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setMsg("Perfil actualizado. La vidriera ya refleja los cambios.");
    } catch (e2) {
      setErr(String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-7">
      {!initial.isPubliclyListed && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu admin todavía no te incluyó en el roster público. Podés preparar tu
          perfil igual; aparecerá cuando te listen.
        </p>
      )}

      <Field label="Dirección pública (slug)" hint="Tu URL: …/tu-slug">
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="font-mono"
        />
      </Field>

      <FieldWithVisibility
        label="Titular"
        field="headline"
        vis={vis}
        onToggle={toggle}
      >
        <Input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={160}
          placeholder="Ej.: Nutrición deportiva y clínica"
        />
      </FieldWithVisibility>

      <FieldWithVisibility label="Bio" field="bio" vis={vis} onToggle={toggle}>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Contá tu enfoque y experiencia."
        />
      </FieldWithVisibility>

      <FieldWithVisibility
        label="URL de la foto"
        field="photoUrl"
        vis={vis}
        onToggle={toggle}
      >
        <Input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://…/foto.jpg"
        />
      </FieldWithVisibility>

      <FieldWithVisibility
        label="Formación / credenciales"
        field="credentials"
        vis={vis}
        onToggle={toggle}
      >
        <Textarea
          value={credentials}
          onChange={(e) => setCredentials(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Títulos, matrícula, posgrados."
        />
      </FieldWithVisibility>

      <FieldWithVisibility
        label="Especialidades"
        field="specialties"
        vis={vis}
        onToggle={toggle}
        hint="Separadas por coma"
      >
        <Input
          value={specialties}
          onChange={(e) => setSpecialties(e.target.value)}
          placeholder="Nutrición deportiva, Nutrición clínica"
        />
      </FieldWithVisibility>

      <FieldWithVisibility
        label="Servicios"
        field="services"
        vis={vis}
        onToggle={toggle}
      >
        <ServicesEditor services={services} onChange={setServices} />
      </FieldWithVisibility>

      {err && <Alert>{err}</Alert>}
      {msg && <p className="text-sm text-brand">{msg}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-sm text-stone-700">{label}</label>
        {hint && <span className="text-xs text-stone-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Campo de contenido con su toggle de visibilidad al lado (default privado). */
function FieldWithVisibility({
  label,
  field,
  vis,
  onToggle,
  hint,
  children,
}: {
  label: string;
  field: ProfileVisibilityField;
  vis: ProfileVisibility;
  onToggle: (f: ProfileVisibilityField) => void;
  hint?: string;
  children: React.ReactNode;
}) {
  const isPublic = vis[field] === true;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label className="text-sm text-stone-700">
          {label}
          {hint && <span className="ml-2 text-xs text-stone-400">{hint}</span>}
        </label>
        <button
          type="button"
          onClick={() => onToggle(field)}
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-medium transition " +
            (isPublic
              ? "bg-brand/15 text-brand"
              : "bg-stone-200 text-stone-600 hover:text-stone-900")
          }
        >
          {isPublic ? "Público" : "Privado"}
        </button>
      </div>
      {children}
    </div>
  );
}

function ServicesEditor({
  services,
  onChange,
}: {
  services: PublicService[];
  onChange: (s: PublicService[]) => void;
}) {
  function update(i: number, patch: Partial<PublicService>) {
    onChange(services.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  return (
    <div className="space-y-3">
      {services.map((s, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[1fr_1.4fr_auto]"
        >
          <Input
            value={s.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Nombre"
            maxLength={120}
          />
          <Input
            value={s.description ?? ""}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Descripción (opcional)"
            maxLength={500}
          />
          <button
            type="button"
            onClick={() => onChange(services.filter((_, j) => j !== i))}
            className="rounded-lg px-3 py-2 text-sm text-stone-500 transition hover:text-red-700"
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...services, { name: "" }])}
        className="rounded-lg border border-dashed border-stone-300 px-4 py-2 text-sm text-stone-500 transition hover:border-brand/50 hover:text-stone-800"
      >
        + Agregar servicio
      </button>
    </div>
  );
}
