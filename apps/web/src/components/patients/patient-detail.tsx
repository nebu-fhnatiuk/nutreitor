"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  activityLevels,
  patientSexes,
  type MemberDto,
  type PatientDetailDto,
} from "@nutreitor/shared";

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/${path}`, { credentials: "include", ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? `HTTP ${r.status}`);
  return data;
}

const SEX_LABEL: Record<string, string> = {
  female: "Femenino",
  male: "Masculino",
  other: "Otro",
  unspecified: "Sin especificar",
};
const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: "Sedentario",
  light: "Ligera",
  moderate: "Moderada",
  active: "Activa",
  very_active: "Muy activa",
};

function ageFrom(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Edad aproximada (sin tz: dato de ficha, no clínico de precisión).
  const today = new Date();
  let age = today.getUTCFullYear() - y;
  const mm = today.getUTCMonth() + 1;
  if (mm < m || (mm === m && today.getUTCDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? `${age} años` : null;
}

/**
 * Ficha del paciente: lectura rápida + edición de campos sobrescribibles, notas
 * (append-only) y asignaciones. La API ya hace el access check (404 si no
 * corresponde). `canAssign` muestra los controles de admin.
 */
export function PatientDetail({
  id,
  basePath,
  canEdit,
  canAssign,
  canAddNote,
}: {
  id: string;
  basePath: string;
  canEdit: boolean;
  canAssign: boolean;
  canAddNote: boolean;
}) {
  const [p, setP] = useState<PatientDetailDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound">("loading");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setP(await api(`patients/${id}`));
      setState("ready");
    } catch {
      setState("notfound");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <p className="text-sm text-stone-400">Cargando ficha…</p>;
  }
  if (state === "notfound" || !p) {
    return (
      <div>
        <BackLink basePath={basePath} />
        <p className="mt-6 text-sm text-stone-500">
          No encontramos esta ficha (o no tenés acceso).
        </p>
      </div>
    );
  }

  const age = ageFrom(p.birthDate);

  return (
    <div className="space-y-6">
      <BackLink basePath={basePath} />

      {/* Header */}
      <header className="flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl font-semibold text-brand">
          {p.fullName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">
            {p.fullName}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {[
              p.documentId ? `Doc ${p.documentId}` : null,
              age,
              p.sex ? SEX_LABEL[p.sex] : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin datos de identificación"}
            {p.archivedAt && (
              <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">
                archivado
              </span>
            )}
          </p>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-brand/40 hover:text-brand"
          >
            Editar ficha
          </button>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {editing ? (
        <EditForm
          patient={p}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
          onError={setError}
        />
      ) : (
        <ReadView patient={p} age={age} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Assignments
          patient={p}
          canAssign={canAssign}
          onChange={load}
          onError={setError}
        />
        <Notes patient={p} canAddNote={canAddNote} onChange={load} onError={setError} />
      </div>
    </div>
  );
}

function BackLink({ basePath }: { basePath: string }) {
  return (
    <Link
      href={basePath}
      className="inline-block text-sm text-stone-500 transition hover:text-brand"
    >
      ← Pacientes
    </Link>
  );
}

// ── Lectura ───────────────────────────────────────────────────────────────────

function ReadView({
  patient: p,
  age,
}: {
  patient: PatientDetailDto;
  age: string | null;
}) {
  return (
    <div className="space-y-6">
      <Section title="Identificación y contacto">
        <Field label="Documento" value={p.documentId} />
        <Field label="Fecha de nacimiento" value={p.birthDate} hint={age} />
        <Field label="Sexo" value={p.sex ? SEX_LABEL[p.sex] : null} />
        <Field label="Email" value={p.email} />
        <Field label="Teléfono" value={p.phone} />
        <Field label="País" value={p.country} />
        <Field label="Zona horaria" value={p.timezone} />
      </Section>

      <Section title="Antropométrico basal">
        <Field label="Altura" value={p.heightCm ? `${p.heightCm} cm` : null} />
        <Field
          label="Peso inicial"
          value={p.initialWeightKg ? `${p.initialWeightKg} kg` : null}
        />
      </Section>

      <Section title="Hábitos y objetivo">
        <Field
          label="Actividad física"
          value={p.activityLevel ? ACTIVITY_LABEL[p.activityLevel] : null}
        />
        <Field label="Objetivo" value={p.goal} />
        <Field label="Preferencias / restricciones" value={p.dietaryPreferences} wide />
      </Section>

      {p.clinical && (
        <Section title="Clínicos de base">
          <Field label="Motivo de consulta" value={p.clinical.reasonForConsult} wide />
          <Field label="Antecedentes médicos" value={p.clinical.medicalHistory} wide />
          <Field label="Alergias / intolerancias" value={p.clinical.allergies} wide />
          <Field label="Medicación actual" value={p.clinical.currentMedication} wide />
          <Field
            label="Patologías diagnosticadas"
            value={p.clinical.diagnosedConditions}
            wide
          />
          <Field label="Antecedentes familiares" value={p.clinical.familyHistory} wide />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
        {title}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  value,
  hint,
  wide,
}: {
  label: string;
  value: string | null;
  hint?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-stone-800">
        {value || <span className="text-stone-300">—</span>}
        {value && hint ? <span className="ml-2 text-stone-400">({hint})</span> : null}
      </dd>
    </div>
  );
}

// ── Edición ───────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20";

function EditForm({
  patient: p,
  onCancel,
  onSaved,
  onError,
}: {
  patient: PatientDetailDto;
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: string) => void;
}) {
  const [f, setF] = useState({
    fullName: p.fullName,
    documentId: p.documentId ?? "",
    birthDate: p.birthDate ?? "",
    sex: p.sex ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    country: p.country ?? "",
    timezone: p.timezone ?? "",
    heightCm: p.heightCm?.toString() ?? "",
    initialWeightKg: p.initialWeightKg?.toString() ?? "",
    activityLevel: p.activityLevel ?? "",
    goal: p.goal ?? "",
    dietaryPreferences: p.dietaryPreferences ?? "",
    reasonForConsult: p.clinical?.reasonForConsult ?? "",
    medicalHistory: p.clinical?.medicalHistory ?? "",
    allergies: p.clinical?.allergies ?? "",
    currentMedication: p.clinical?.currentMedication ?? "",
    diagnosedConditions: p.clinical?.diagnosedConditions ?? "",
    familyHistory: p.clinical?.familyHistory ?? "",
  });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const orNull = (v: string) => (v.trim() ? v.trim() : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const body: Record<string, unknown> = {
        fullName: f.fullName.trim(),
        documentId: orNull(f.documentId),
        birthDate: orNull(f.birthDate),
        sex: f.sex || null,
        email: orNull(f.email),
        phone: orNull(f.phone),
        country: orNull(f.country),
        timezone: orNull(f.timezone),
        heightCm: f.heightCm ? Number(f.heightCm) : null,
        initialWeightKg: f.initialWeightKg ? Number(f.initialWeightKg) : null,
        activityLevel: f.activityLevel || null,
        goal: orNull(f.goal),
        dietaryPreferences: orNull(f.dietaryPreferences),
      };
      if (p.clinical) {
        Object.assign(body, {
          reasonForConsult: orNull(f.reasonForConsult),
          medicalHistory: orNull(f.medicalHistory),
          allergies: orNull(f.allergies),
          currentMedication: orNull(f.currentMedication),
          diagnosedConditions: orNull(f.diagnosedConditions),
          familyHistory: orNull(f.familyHistory),
        });
      }
      await api(`patients/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FieldsetCard title="Identificación y contacto">
        <L label="Nombre y apellido">
          <input value={f.fullName} onChange={(e) => upd("fullName", e.target.value)} className={inputCls} />
        </L>
        <L label="Documento">
          <input value={f.documentId} onChange={(e) => upd("documentId", e.target.value)} className={inputCls} />
        </L>
        <L label="Fecha de nacimiento (YYYY-MM-DD)">
          <input value={f.birthDate} onChange={(e) => upd("birthDate", e.target.value)} placeholder="1990-05-12" className={inputCls} />
        </L>
        <L label="Sexo">
          <select value={f.sex} onChange={(e) => upd("sex", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {patientSexes.map((s) => (
              <option key={s} value={s}>{SEX_LABEL[s]}</option>
            ))}
          </select>
        </L>
        <L label="Email">
          <input type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} className={inputCls} />
        </L>
        <L label="Teléfono">
          <input value={f.phone} onChange={(e) => upd("phone", e.target.value)} className={inputCls} />
        </L>
        <L label="País">
          <input value={f.country} onChange={(e) => upd("country", e.target.value)} className={inputCls} />
        </L>
        <L label="Zona horaria">
          <input value={f.timezone} onChange={(e) => upd("timezone", e.target.value)} placeholder="America/Argentina/Buenos_Aires" className={inputCls} />
        </L>
      </FieldsetCard>

      <FieldsetCard title="Antropométrico basal">
        <L label="Altura (cm)">
          <input type="number" value={f.heightCm} onChange={(e) => upd("heightCm", e.target.value)} className={inputCls} />
        </L>
        <L label="Peso inicial (kg)">
          <input type="number" step="0.1" value={f.initialWeightKg} onChange={(e) => upd("initialWeightKg", e.target.value)} className={inputCls} />
        </L>
      </FieldsetCard>

      <FieldsetCard title="Hábitos y objetivo">
        <L label="Actividad física">
          <select value={f.activityLevel} onChange={(e) => upd("activityLevel", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {activityLevels.map((a) => (
              <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>
            ))}
          </select>
        </L>
        <L label="Objetivo">
          <input value={f.goal} onChange={(e) => upd("goal", e.target.value)} className={inputCls} />
        </L>
        <L label="Preferencias / restricciones" wide>
          <textarea value={f.dietaryPreferences} onChange={(e) => upd("dietaryPreferences", e.target.value)} rows={2} className={inputCls} />
        </L>
      </FieldsetCard>

      {p.clinical && (
        <FieldsetCard title="Clínicos de base">
          <L label="Motivo de consulta" wide>
            <textarea value={f.reasonForConsult} onChange={(e) => upd("reasonForConsult", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Antecedentes médicos" wide>
            <textarea value={f.medicalHistory} onChange={(e) => upd("medicalHistory", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Alergias / intolerancias" wide>
            <textarea value={f.allergies} onChange={(e) => upd("allergies", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Medicación actual" wide>
            <textarea value={f.currentMedication} onChange={(e) => upd("currentMedication", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Patologías diagnosticadas" wide>
            <textarea value={f.diagnosedConditions} onChange={(e) => upd("diagnosedConditions", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Antecedentes familiares" wide>
            <textarea value={f.familyHistory} onChange={(e) => upd("familyHistory", e.target.value)} rows={2} className={inputCls} />
          </L>
        </FieldsetCard>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !f.fullName.trim()}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar ficha"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm text-stone-500 transition hover:bg-stone-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FieldsetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
        {title}
      </h2>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function L({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}

// ── Asignaciones ────────────────────────────────────────────────────────────--

function Assignments({
  patient: p,
  canAssign,
  onChange,
  onError,
}: {
  patient: PatientDetailDto;
  canAssign: boolean;
  onChange: () => void;
  onError: (e: string) => void;
}) {
  const [pros, setPros] = useState<MemberDto[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canAssign) return;
    api("members")
      .then((m: MemberDto[]) =>
        setPros(m.filter((x) => x.status === "active" && x.role !== "patient")),
      )
      .catch(() => setPros([]));
  }, [canAssign]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    onError("");
    try {
      await fn();
      onChange();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Profesionales a cargo
      </h2>

      {p.assignments.length === 0 ? (
        <p className="text-sm text-stone-400">Sin asignaciones.</p>
      ) : (
        <ul className="space-y-2">
          {p.assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-stone-800">{a.professionalName}</div>
                <div className="text-xs text-stone-400">
                  {a.status === "active" ? "Activa" : "Cerrada"} · desde{" "}
                  {new Date(a.assignedAt).toLocaleDateString("es-AR")}
                  {a.endedAt
                    ? ` · hasta ${new Date(a.endedAt).toLocaleDateString("es-AR")}`
                    : ""}
                </div>
              </div>
              {a.status === "active" ? (
                <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                  activa
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                  cerrada
                </span>
              )}
              {canAssign && a.status === "active" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api(`patients/${p.id}/assignments/${a.id}/end`, { method: "POST" }),
                    )
                  }
                  className="shrink-0 text-xs text-stone-400 transition hover:text-red-600"
                >
                  Cerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAssign && (
        <div className="mt-4 flex items-end gap-2 border-t border-stone-100 pt-4">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-stone-500">Asignar profesional</span>
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className={inputCls}
            >
              <option value="">Elegir…</option>
              {pros.map((pr) => (
                <option key={pr.membershipId} value={pr.membershipId}>
                  {pr.fullName} ({pr.role})
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || !assignTo}
            onClick={() =>
              run(async () => {
                await api(`patients/${p.id}/assignments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ membershipId: assignTo }),
                });
                setAssignTo("");
              })
            }
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
          >
            Asignar
          </button>
        </div>
      )}
    </section>
  );
}

// ── Notas ─────────────────────────────────────────────────────────────────────

function Notes({
  patient: p,
  canAddNote,
  onChange,
  onError,
}: {
  patient: PatientDetailDto;
  canAddNote: boolean;
  onChange: () => void;
  onError: (e: string) => void;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api(`patients/${p.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent("");
      onChange();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Notas clínicas
      </h2>

      {canAddNote && (
        <form onSubmit={add} className="mb-5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Agregar una nota… (no se edita ni se borra; para corregir, agregá otra)"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={busy || !content.trim()}
            className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Agregar nota"}
          </button>
        </form>
      )}

      {p.notes.length === 0 ? (
        <p className="text-sm text-stone-400">Sin notas todavía.</p>
      ) : (
        <ol className="space-y-3">
          {p.notes.map((n) => (
            <li key={n.id} className="border-l-2 border-brand/30 pl-3">
              <div className="text-xs text-stone-400">
                {n.authorName} ·{" "}
                {new Date(n.createdAt).toLocaleString("es-AR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm text-stone-800">
                {n.content}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
