"use client";

import { ArrowLeft, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACTIVITY_LEVEL_LABEL,
  ANAMNESIS_FIELDS,
  COMPETITION_LEVEL_LABEL,
  FFQ_FREQUENCIES,
  FFQ_ITEMS,
  INTAKE_KIND_LABEL,
  activityLevels,
  anamnesisKeys,
  competitionLevels,
  type AnamnesisKey,
  type PortalIntakeDto,
} from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, SectionHeading, Select, Textarea, ZoneMark, buttonClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/** Inicio del portal: formularios que pidió el profesional (KAN-60). */
export function PortalFormsCard() {
  const [forms, setForms] = useState<PortalIntakeDto[] | null>(null);
  useEffect(() => {
    api<PortalIntakeDto[]>("portal/me/intake-requests")
      .then(setForms)
      .catch(() => setForms([]));
  }, []);
  const pending = forms?.filter((f) => f.status === "requested") ?? [];
  if (!pending.length) return null;
  return (
    <Card className="border-accent2/40">
      <SectionHeading className="mb-3">Para completar antes de la consulta</SectionHeading>
      <ul className="space-y-2">
        {pending.map((f) => (
          <li key={f.id}>
            <Link
              href={`/app/formularios/${f.id}`}
              className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ClipboardList className="h-5 w-5 shrink-0 text-accent2" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">{INTAKE_KIND_LABEL[f.kind]}</span>
                <span className="block text-sm text-stone-500">Te lo pidió {f.requestedByName}{f.message ? ` · “${f.message}”` : ""}</span>
              </span>
              <span className="ml-auto font-display text-sm font-semibold uppercase tracking-wider text-brand">Completar</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const SECTIONS = [
  ["salud", "Tu salud"],
  ["deporte", "Tu deporte"],
  ["habitos", "Tus hábitos"],
] as const;

type Values = Partial<Record<AnamnesisKey, string>>;

/** Pasa lo escrito al tipo de cada pregunta; lo vacío no se manda. */
function toAnswers(v: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of anamnesisKeys) {
    const raw = v[k]?.trim();
    if (!raw) continue;
    const kind = ANAMNESIS_FIELDS[k].kind;
    out[k] = kind === "int" ? Math.round(Number(raw.replace(",", "."))) : kind === "number" ? Number(raw.replace(",", ".")) : raw;
  }
  return out;
}

/** Un formulario pedido (anamnesis o frecuencia de consumo), para completar y mandar. */
export function PortalForm({ id }: { id: string }) {
  const [form, setForm] = useState<PortalIntakeDto | null | undefined>(undefined);
  const [values, setValues] = useState<Values>({});
  const [ffq, setFfq] = useState<Record<string, { frequency: string; portions: string }>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<PortalIntakeDto[]>("portal/me/intake-requests")
      .then((list) => setForm(list.find((f) => f.id === id) ?? null))
      .catch(() => setForm(null));
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setErr(null);
    const answers =
      form.kind === "anamnesis"
        ? toAnswers(values)
        : Object.fromEntries(
            Object.entries(ffq)
              .filter(([, a]) => a.frequency)
              .map(([k, a]) => [k, { frequency: a.frequency, portions: Number((a.portions || "1").replace(",", ".")) }]),
          );
    try {
      await api(`portal/me/intake-requests/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href="/app" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al inicio
    </Link>
  );

  if (form === undefined) return <Loading />;
  if (form === null) return <EmptyState action={back}>No encontramos ese formulario.</EmptyState>;
  if (sent || form.status === "submitted") {
    return (
      <Card className="space-y-3">
        <p className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
          <ZoneMark zone="ok" /> ¡Gracias!
        </p>
        <p className="text-stone-600">
          {form.requestedByName} va a revisar tus respuestas antes de la consulta. Si querés cambiar algo, decíselo en la consulta o por mensaje.
        </p>
        <Link href="/app" className={buttonClass("primary")}>
          Volver al inicio
        </Link>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {back}
      {form.message && (
        <p className="rounded-xl border border-stone-200 px-4 py-3 text-sm">
          <span className="font-medium">{form.requestedByName}:</span> “{form.message}”
        </p>
      )}
      <p className="text-sm text-stone-600">
        Contestá lo que sepas: nada es obligatorio. Tus respuestas las ve sólo tu profesional, que las revisa antes de la consulta.
      </p>

      {form.kind === "anamnesis" ? (
        SECTIONS.map(([section, title]) => (
          <Card key={section} className="space-y-4">
            <SectionHeading>{title}</SectionHeading>
            {anamnesisKeys
              .filter((k) => ANAMNESIS_FIELDS[k].section === section)
              .map((k) => {
                const f = ANAMNESIS_FIELDS[k];
                const set = (v: string) => setValues((s) => ({ ...s, [k]: v }));
                const idq = `q-${k}`;
                return (
                  <div key={k}>
                    <label htmlFor={idq} className="block font-medium text-stone-900">
                      {f.question}
                    </label>
                    {f.help && <p className="text-sm text-stone-500">{f.help}</p>}
                    <div className="mt-1.5">
                      {f.kind === "activity" || f.kind === "competition" ? (
                        <Select id={idq} value={values[k] ?? ""} onChange={(e) => set(e.target.value)}>
                          <option value="">Elegí…</option>
                          {(f.kind === "activity" ? activityLevels : competitionLevels).map((o) => (
                            <option key={o} value={o}>
                              {f.kind === "activity"
                                ? ACTIVITY_LEVEL_LABEL[o as (typeof activityLevels)[number]]
                                : COMPETITION_LEVEL_LABEL[o as (typeof competitionLevels)[number]]}
                            </option>
                          ))}
                        </Select>
                      ) : f.kind === "longtext" ? (
                        <Textarea id={idq} rows={3} value={values[k] ?? ""} onChange={(e) => set(e.target.value)} maxLength={f.max ?? 2000} />
                      ) : f.kind === "int" || f.kind === "number" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            id={idq}
                            inputMode="decimal"
                            className="w-28"
                            value={values[k] ?? ""}
                            onChange={(e) => set(e.target.value)}
                            pattern={f.kind === "int" ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
                          />
                          <span className="text-sm text-stone-500">{f.unit}</span>
                        </div>
                      ) : (
                        <Input id={idq} value={values[k] ?? ""} onChange={(e) => set(e.target.value)} maxLength={f.max ?? 200} />
                      )}
                    </div>
                  </div>
                );
              })}
          </Card>
        ))
      ) : (
        <Card className="space-y-1">
          <SectionHeading className="mb-2">¿Con qué frecuencia comés…?</SectionHeading>
          {FFQ_ITEMS.map((i) => {
            const a = ffq[i.key] ?? { frequency: "", portions: "1" };
            const set = (patch: Partial<typeof a>) => setFfq((s) => ({ ...s, [i.key]: { ...a, ...patch } }));
            return (
              <fieldset key={i.key} className="grid gap-2 border-b border-stone-100 py-3 sm:grid-cols-[1fr_14rem_7rem] sm:items-center">
                <legend className="contents">
                  <span className="font-medium">{i.label}</span>
                </legend>
                <div className="text-sm text-stone-500 sm:hidden">{[i.examples, `Porción: ${i.portion}`].filter(Boolean).join(" · ")}</div>
                <Select aria-label={`${i.label}: frecuencia`} value={a.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                  <option value="">Elegí…</option>
                  {FFQ_FREQUENCIES.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-sm text-stone-500">
                  <Input
                    aria-label={`${i.label}: porciones por vez`}
                    inputMode="decimal"
                    className="w-16"
                    value={a.portions}
                    onChange={(e) => set({ portions: e.target.value })}
                    disabled={!a.frequency || a.frequency === "never"}
                  />
                  porc.
                </label>
                <p className="hidden text-sm text-stone-500 sm:col-span-3 sm:block">
                  {[i.examples, `Porción: ${i.portion}`].filter(Boolean).join(" · ")}
                </p>
              </fieldset>
            );
          })}
        </Card>
      )}

      {err && <Alert>{err}</Alert>}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Enviando…" : "Enviar a mi profesional"}
      </Button>
    </form>
  );
}
