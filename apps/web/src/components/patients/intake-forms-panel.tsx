"use client";

import { ClipboardList, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ANAMNESIS_FIELDS,
  FFQ_FREQUENCIES,
  FFQ_ITEMS,
  INTAKE_KIND_LABEL,
  INTAKE_STATUS_LABEL,
  anamnesisKeys,
  type AnamnesisKey,
  type IntakeKind,
  type IntakeRequestDto,
  type PatientDetailDto,
} from "@nutreitor/shared";

import { Alert, Button, Card, Label, Modal, SectionHeading, Textarea, ZoneMark, cn, useFeedback, type Zone } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { anamnesisValue } from "./intake-forms-format";

const STATUS_ZONE: Record<IntakeRequestDto["status"], Zone | null> = { requested: null, submitted: "warn", reviewed: "ok", cancelled: null };
const when = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Valor actual de la ficha para un campo de la anamnesis (para comparar al revisar). */
function currentValue(p: PatientDetailDto, k: AnamnesisKey): unknown {
  if (k in (p.clinical ?? {})) return p.clinical?.[k as keyof NonNullable<PatientDetailDto["clinical"]>] ?? null;
  if (k in (p.sportProfile ?? {})) return p.sportProfile?.[k as keyof NonNullable<PatientDetailDto["sportProfile"]>] ?? null;
  return (p as unknown as Record<string, unknown>)[k] ?? null;
}

/**
 * Formularios previos a la consulta (KAN-60): pedirle al deportista la anamnesis o la
 * frecuencia de consumo, y revisar lo que mandó campo por campo antes de pasarlo a
 * la ficha (queda marcado como autorreportado).
 */
export function IntakeFormsPanel({
  patient,
  canEdit,
  onApplied,
}: {
  patient: PatientDetailDto;
  canEdit: boolean;
  onApplied: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<IntakeRequestDto[] | null>(null);
  const [asking, setAsking] = useState<IntakeKind | null>(null);
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState<IntakeRequestDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api<IntakeRequestDto[]>(`patients/${patient.id}/intake-requests`));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [patient.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (k: IntakeKind) => items?.find((i) => i.kind === k && (i.status === "requested" || i.status === "submitted"));

  async function request() {
    if (!asking) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`patients/${patient.id}/intake-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: asking, message: message.trim() || null }),
      });
      toast(`Le pedimos ${INTAKE_KIND_LABEL[asking].toLowerCase()} a ${patient.fullName.split(" ")[0]}. Le llega un aviso por mail.`);
      setAsking(null);
      setMessage("");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(r: IntakeRequestDto) {
    const ok = await confirm({ title: `¿Cancelar el pedido de ${INTAKE_KIND_LABEL[r.kind].toLowerCase()}?`, confirmLabel: "Cancelar pedido" });
    if (!ok) return;
    try {
      await api(`patients/${patient.id}/intake-requests/${r.id}/cancel`, { method: "POST" });
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <Card>
      <SectionHeading>Formularios para el deportista</SectionHeading>
      <p className="mt-1 text-sm text-stone-500">
        Lo completa desde su portal antes de la consulta. Vos revisás qué pasa a la ficha.
      </p>
      {err && <Alert className="mt-3">{err}</Alert>}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["anamnesis", "food_frequency"] as IntakeKind[]).map((k) => (
            <Button key={k} size="sm" variant="secondary" disabled={!patient.hasAccount || !!open(k)} onClick={() => setAsking(k)}>
              <Send className="h-4 w-4" aria-hidden /> Pedir {INTAKE_KIND_LABEL[k].toLowerCase()}
            </Button>
          ))}
        </div>
      )}
      {canEdit && !patient.hasAccount && (
        <p className="mt-2 text-sm text-stone-500">Todavía no entra al portal: invitalo primero para poder pedirle formularios.</p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((r) => {
            const zone = STATUS_ZONE[r.status];
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-100 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <ClipboardList className="h-4 w-4 text-stone-500" aria-hidden />
                    {INTAKE_KIND_LABEL[r.kind]}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wider",
                        zone === "warn" ? "bg-zone-warn/10 text-zone-warn" : zone === "ok" ? "bg-zone-ok/10 text-zone-ok" : "bg-stone-100 text-stone-600",
                      )}
                    >
                      {zone && <ZoneMark zone={zone} />}
                      {INTAKE_STATUS_LABEL[r.status]}
                    </span>
                  </p>
                  <p className="text-stone-500">
                    Pedido por {r.requestedByName} el {when(r.createdAt)}
                    {r.submittedAt && ` · enviado el ${when(r.submittedAt)}`}
                    {r.reviewedAt && ` · revisó ${r.reviewedByName} el ${when(r.reviewedAt)}`}
                    {r.status === "reviewed" && r.kind === "anamnesis" && ` · ${r.applied?.fields?.length ?? 0} dato(s) a la ficha`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    {r.status === "submitted" && (
                      <Button size="sm" onClick={() => setReviewing(r)}>
                        Revisar
                      </Button>
                    )}
                    {(r.status === "requested" || r.status === "submitted") && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={asking !== null} onClose={() => setAsking(null)} title={asking ? `Pedir ${INTAKE_KIND_LABEL[asking].toLowerCase()}` : undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void request();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-stone-600">
            {patient.fullName} lo va a ver en su portal y le llega un aviso por mail.
            {asking === "anamnesis" ? " Son preguntas de salud, entrenamiento y hábitos." : " Es el cuestionario de frecuencia de consumo."}
          </p>
          <Label label="Mensaje (opcional)">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} placeholder="Completalo antes del control del jueves." />
          </Label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Pidiendo…" : "Pedir"}
            </Button>
          </div>
        </form>
      </Modal>

      {reviewing && (
        <ReviewModal
          patient={patient}
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={async () => {
            setReviewing(null);
            await load();
            onApplied();
          }}
        />
      )}
    </Card>
  );
}

function ReviewModal({
  patient,
  request: r,
  onClose,
  onDone,
}: {
  patient: PatientDetailDto;
  request: IntakeRequestDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useFeedback();
  const answers = r.answers ?? {};
  const answered = anamnesisKeys.filter((k) => k in answers);
  // Por defecto: lo nuevo o lo que estaba vacío. Lo que ya tenía un valor distinto, a elección.
  const [chosen, setChosen] = useState<Set<AnamnesisKey>>(
    () => new Set(answered.filter((k) => currentValue(patient, k) === null || currentValue(patient, k) === "")),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(accept: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await api(`patients/${patient.id}/intake-requests/${r.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: [...chosen], accept }),
      });
      toast(r.kind === "anamnesis" ? `Listo: ${chosen.size} dato(s) a la ficha.` : accept ? "Encuesta guardada como autorreportada." : "Formulario archivado.");
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Revisar ${INTAKE_KIND_LABEL[r.kind].toLowerCase()}`} className="sm:max-w-3xl">
      <div className="space-y-4">
        {r.kind === "anamnesis" ? (
          <>
            <p className="text-sm text-stone-600">
              Elegí qué pasa a la ficha. Queda marcado como autorreportado y revisado por vos. Lo que no marques queda guardado en el formulario.
            </p>
            <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface font-display text-xs uppercase tracking-wider text-stone-500">
                  <tr className="border-b border-stone-200">
                    <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Pasar</span></th>
                    <th scope="col" className="px-3 py-2 font-semibold">Dato</th>
                    <th scope="col" className="px-3 py-2 font-semibold">En la ficha</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Respondió</th>
                  </tr>
                </thead>
                <tbody>
                  {answered.map((k) => {
                    const now = anamnesisValue(k, currentValue(patient, k));
                    const next = anamnesisValue(k, answers[k]);
                    const same = now === next;
                    return (
                      <tr key={k} className="border-b border-stone-100 align-top">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Pasar ${ANAMNESIS_FIELDS[k].label} a la ficha`}
                            className="h-4 w-4 accent-brand"
                            checked={chosen.has(k)}
                            disabled={same}
                            onChange={(e) =>
                              setChosen((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(k);
                                else n.delete(k);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{ANAMNESIS_FIELDS[k].label}</td>
                        <td className="whitespace-pre-line px-3 py-2 text-stone-500">{now ?? "—"}</td>
                        <td className={cn("whitespace-pre-line px-3 py-2", same ? "text-stone-500" : "text-stone-900")}>
                          {next}
                          {same && <span className="ml-1 text-xs">(igual)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {err && <Alert>{err}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Después
              </Button>
              <Button onClick={() => submit(false)} disabled={busy}>
                {busy ? "Guardando…" : chosen.size ? `Pasar ${chosen.size} a la ficha` : "Archivar sin cambios"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ul className="max-h-[55vh] space-y-1 overflow-y-auto text-sm">
              {FFQ_ITEMS.filter((i) => i.key in answers).map((i) => {
                const a = answers[i.key] as { frequency: string; portions: number };
                return (
                  <li key={i.key} className="flex justify-between gap-3 border-b border-stone-100 py-1.5">
                    <span>{i.label}</span>
                    <span className="text-stone-600">
                      {FFQ_FREQUENCIES.find((f) => f.key === a.frequency)?.label} · {String(a.portions).replace(".", ",")} porción(es)
                    </span>
                  </li>
                );
              })}
            </ul>
            {err && <Alert>{err}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => submit(false)} disabled={busy}>
                Archivar sin guardar
              </Button>
              <Button onClick={() => submit(true)} disabled={busy}>
                Guardar como encuesta autorreportada
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
