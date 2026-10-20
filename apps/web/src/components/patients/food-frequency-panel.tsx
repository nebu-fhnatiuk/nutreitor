"use client";

import { AlertTriangle, CheckCircle2, MinusCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FFQ_FREQUENCIES,
  FFQ_GROUP_LABEL,
  FFQ_ITEMS,
  ffqItemResults,
  gapaComparison,
  wholeGrainShare,
  type FfqAnswers,
  type FfqFrequencyKey,
  type FfqGroup,
  type FfqItemKey,
  type FfqRuleResult,
  type FfqSex,
  type FoodFrequencyDto,
} from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Loading, SectionHeading, Select, Textarea, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { fmt, fmtMeasured, parseDecimal } from "./anthro-format";

const GROUP_ORDER: FfqGroup[] = ["vegetablesFruits", "starches", "dairy", "protein", "fats", "optional", "drinks", "sport"];
const ITEM_LABEL = Object.fromEntries(FFQ_ITEMS.map((i) => [i.key, i.label])) as Record<FfqItemKey, string>;

const STATUS: Record<FfqRuleResult["status"], { icon: typeof CheckCircle2; cls: string; text: string }> = {
  ok: { icon: CheckCircle2, cls: "text-emerald-700", text: "Dentro de la referencia" },
  below: { icon: AlertTriangle, cls: "text-amber-700", text: "Por debajo" },
  above: { icon: AlertTriangle, cls: "text-amber-700", text: "Por encima" },
  unanswered: { icon: MinusCircle, cls: "text-stone-400", text: "Sin contestar" },
};

/**
 * Frecuencia de consumo por grupos (ADR 0034), comparada con las GAPA. Las GAPA son
 * para la población general: se muestran como referencia; el objetivo del deportista
 * es su requerimiento.
 */
export function FoodFrequencyPanel({ patientId, sex, canWrite }: { patientId: string; sex: FfqSex | null; canWrite: boolean }) {
  const { confirm, toast } = useFeedback();
  const [list, setList] = useState<FoodFrequencyDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FoodFrequencyDto | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<FoodFrequencyDto[]>(`patients/${patientId}/food-frequency`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(s: FoodFrequencyDto) {
    const ok = await confirm({ title: "¿Borrar este cuestionario?", body: `El del ${fmtMeasured(s.answeredOn)}.`, confirmLabel: "Borrar", tone: "danger" });
    if (!ok) return;
    try {
      await api(`patients/${patientId}/food-frequency/${s.id}`, { method: "DELETE" });
      toast("Cuestionario borrado");
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!list) return <Loading />;

  if (editing) {
    return (
      <FfqEditor
        patientId={patientId}
        sex={sex}
        initial={editing === "new" ? (list[0] ? { ...list[0], id: "" } : null) : editing}
        isNew={editing === "new"}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          toast("Cuestionario guardado");
          await load();
        }}
      />
    );
  }

  const [current, previous] = list;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionHeading>Frecuencia de consumo</SectionHeading>
          <p className="mt-1 text-sm text-stone-500">
            Con qué frecuencia come cada grupo, comparado con las Guías Alimentarias para la Población Argentina.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> {current ? "Actualizar cuestionario" : "Nuevo cuestionario"}
          </Button>
        )}
      </div>

      {!current ? (
        <Card>
          <EmptyState>
            Todavía no hay cuestionarios. Se completa en unos minutos y complementa al recordatorio de 24 h: muestra la dieta
            habitual, no la de un día.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-stone-900">{fmtMeasured(current.answeredOn)}</p>
                <p className="text-xs text-stone-500">
                  {current.recordedByName ?? ""}
                  {previous ? ` · comparado con el del ${fmtMeasured(previous.answeredOn)}` : ""}
                </p>
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(current)} aria-label="Editar cuestionario">
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(current)} aria-label="Borrar cuestionario">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </div>
            <GapaList rules={current.gapa} previous={previous?.gapa} />
            {current.wholeGrainPct !== null && (
              <p className="mt-3 text-sm text-stone-600">
                Cereales integrales: <strong>{current.wholeGrainPct} %</strong> del total de cereales (las GAPA recomiendan preferirlos).
              </p>
            )}
            <p className="mt-3 text-xs text-stone-500">
              Las GAPA son para la población general. Para un deportista, el objetivo es su requerimiento: en días de mucha carga
              puede necesitar más cereales, papa o legumbres, y más líquido.
            </p>
            {current.note && <p className="mt-3 whitespace-pre-line text-sm text-stone-600">{current.note}</p>}
          </Card>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
                    <th className="px-5 py-2 font-medium">Grupo</th>
                    <th className="px-3 py-2 font-medium">Frecuencia</th>
                    <th className="px-3 py-2 text-right font-medium">Porciones/día</th>
                    <th className="px-5 py-2 text-right font-medium">Porciones/semana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {current.items.map((r) => {
                    const a = current.answers[r.key]!;
                    return (
                      <tr key={r.key}>
                        <td className="px-5 py-2 text-stone-800">{ITEM_LABEL[r.key]}</td>
                        <td className="px-3 py-2 text-stone-600">
                          {FFQ_FREQUENCIES.find((f) => f.key === a.frequency)!.label}
                          {a.portions !== 1 && a.frequency !== "never" ? ` · ${fmt(a.portions)} porc.` : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.portionsPerDay)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmt(r.portionsPerWeek)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {list.length > 1 && (
            <p className="text-xs text-stone-500">
              Cuestionarios anteriores: {list.slice(1).map((s) => fmtMeasured(s.answeredOn)).join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function GapaList({ rules, previous }: { rules: FfqRuleResult[]; previous?: FfqRuleResult[] }) {
  const prev = new Map((previous ?? []).map((r) => [r.id, r]));
  return (
    <ul className="mt-4 divide-y divide-stone-100">
      {rules.map((r) => {
        const st = STATUS[r.status];
        const Icon = st.icon;
        const before = prev.get(r.id)?.value;
        return (
          <li key={r.id} className="flex items-start gap-3 py-2.5">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", st.cls)} aria-label={st.text} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-stone-800">{r.label}</p>
              <p className="text-xs text-stone-500">Referencia: {r.recommendation}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn("text-sm font-medium tabular-nums", st.cls)}>{r.value != null ? `${fmt(r.value)} ${r.unit}` : "—"}</p>
              {before != null && r.value != null && before !== r.value && (
                <p className="text-xs tabular-nums text-stone-500">antes {fmt(before)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FfqEditor({
  patientId,
  sex,
  initial,
  isNew,
  onCancel,
  onSaved,
}: {
  patientId: string;
  sex: FfqSex | null;
  /** En uno nuevo, el anterior precarga las respuestas (se actualiza lo que cambió). */
  initial: FoodFrequencyDto | null;
  isNew: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [answeredOn, setAnsweredOn] = useState(isNew ? new Date().toLocaleDateString("en-CA") : initial!.answeredOn);
  const [answers, setAnswers] = useState<FfqAnswers>(initial?.answers ?? {});
  const [note, setNote] = useState(isNew ? "" : (initial?.note ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => gapaComparison(answers, sex), [answers, sex]);
  const perDay = useMemo(() => new Map(ffqItemResults(answers).map((r) => [r.key, r.portionsPerDay])), [answers]);
  const answered = Object.keys(answers).length;

  function setFreq(key: FfqItemKey, f: FfqFrequencyKey | "") {
    setAnswers((a) => {
      const next = { ...a };
      if (!f) delete next[key];
      else next[key] = { frequency: f, portions: a[key]?.portions ?? 1 };
      return next;
    });
  }
  function setPortions(key: FfqItemKey, v: string) {
    const n = parseDecimal(v);
    setAnswers((a) => (a[key] && n != null && n > 0 ? { ...a, [key]: { ...a[key]!, portions: n } } : a));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (answered === 0) return setErr("Contestá al menos un grupo.");
    setBusy(true);
    try {
      await api(`patients/${patientId}/food-frequency${isNew ? "" : `/${initial!.id}`}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answeredOn, answers, note: note.trim() || null }),
      });
      await onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <SectionHeading>{isNew ? "Cuestionario de frecuencia de consumo" : "Editar cuestionario"}</SectionHeading>
        <p className="mt-1 text-sm text-stone-500">
          "En el último mes, ¿cada cuánto comés…?" Para cada grupo, la frecuencia y cuántas porciones cada vez.
          {isNew && initial ? " Arranca con las respuestas del cuestionario anterior: cambiá lo que cambió." : ""}
        </p>
        <label className="mt-4 block w-fit text-sm">
          <span className="mb-1 block text-xs text-stone-500">Fecha</span>
          <Input type="date" value={answeredOn} onChange={(e) => setAnsweredOn(e.target.value)} required className="w-auto" />
        </label>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          {GROUP_ORDER.map((g) => (
            <Card key={g} className="p-0">
              <p className="border-b border-stone-100 px-4 py-2.5 text-sm font-medium text-stone-800">{FFQ_GROUP_LABEL[g]}</p>
              <ul className="divide-y divide-stone-100">
                {FFQ_ITEMS.filter((i) => i.group === g).map((item) => {
                  const a = answers[item.key];
                  return (
                    <li key={item.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <div className="min-w-[10rem] flex-1">
                        <p className="text-sm text-stone-800">{item.label}</p>
                        <p className="text-xs text-stone-500">
                          {item.examples ? `${item.examples} · ` : ""}porción: {item.portion}
                        </p>
                      </div>
                      <Select
                        value={a?.frequency ?? ""}
                        onChange={(e) => setFreq(item.key, e.target.value as FfqFrequencyKey | "")}
                        className="w-44"
                        aria-label={`${item.label}: frecuencia`}
                      >
                        <option value="">—</option>
                        {FFQ_FREQUENCIES.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1 text-xs text-stone-500">
                        <Input
                          key={`${item.key}-${a ? "on" : "off"}`}
                          defaultValue={a ? String(a.portions).replace(".", ",") : "1"}
                          onChange={(e) => setPortions(item.key, e.target.value)}
                          disabled={!a || a.frequency === "never"}
                          inputMode="decimal"
                          className="w-14 px-2 text-right"
                          aria-label={`${item.label}: porciones cada vez`}
                        />
                        porc.
                      </label>
                      <span className="w-16 text-right text-xs tabular-nums text-stone-500">
                        {perDay.has(item.key) ? `${fmt(perDay.get(item.key)!)} /día` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
        <Card as="div" className="h-fit lg:sticky lg:top-4">
          <p className="text-sm font-medium text-stone-800">Contra las GAPA</p>
          <p className="text-xs text-stone-500">{answered} de {FFQ_ITEMS.length} grupos contestados</p>
          <GapaList rules={preview} />
          {wholeGrainShare(answers) !== null && <p className="mt-2 text-xs text-stone-600">Integrales: {wholeGrainShare(answers)} % de los cereales</p>}
        </Card>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-stone-500">Nota (opcional)</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Come afuera de lunes a viernes…" />
      </label>

      {err && <Alert>{err}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar cuestionario"}
        </Button>
      </div>
    </form>
  );
}
